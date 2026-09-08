// Command release signs the binaries of a version of pupitred and declares them to the platform.
package main

import (
	"crypto/ed25519"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"pupitre.studio/agent/internal/release"
)

const (
	privateKeyVariable = "PUPITRE_RELEASE_PRIVATE_KEY"
	adminTokenVariable = "PUPITRE_ADMIN_TOKEN"
	platformVariable   = "PUPITRE_PLATFORM_URL"
)

type environment func(string) string

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(args []string, stdout, stderr io.Writer, env environment) int {
	if len(args) < 1 {
		usage(stderr)

		return 2
	}

	switch args[0] {
	case "keygen":
		return runKeygen(stdout, stderr)
	case "public-key":
		return runPublicKey(stdout, stderr, env)
	case "sign":
		return runSign(args[1:], stdout, stderr, env)
	case "publish":
		return runPublish(args[1:], stdout, stderr, env)
	case "promote":
		return runPromote(args[1:], stdout, stderr, env)
	}

	usage(stderr)

	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: release <keygen|public-key|sign --version=X [--channel=beta] [--out=FILE] [--release=FILE] BINARY...|publish [--api=URL] FILE|promote --version=X [--channel=stable] [--api=URL]>")
}

// The pair is written to standard output and nowhere else: the private half belongs in a secret store, never in a file this repository could pick up.
func runKeygen(stdout, stderr io.Writer) int {
	public, private, err := release.GenerateKeyPair()
	if err != nil {
		return fail(stderr, err)
	}

	fmt.Fprintln(stdout, "public "+public)
	fmt.Fprintln(stdout, "private "+private)

	return 0
}

func runPublicKey(stdout, stderr io.Writer, env environment) int {
	private, err := privateKey(env)
	if err != nil {
		return fail(stderr, err)
	}

	fmt.Fprintln(stdout, release.PublicKeyOf(private))

	return 0
}

func runSign(args []string, stdout, stderr io.Writer, env environment) int {
	flags := flag.NewFlagSet("sign", flag.ContinueOnError)
	flags.SetOutput(stderr)

	version := flags.String("version", "", "published version, in semver")
	channel := flags.String("channel", release.DefaultChannel, "publication channel")
	out := flags.String("out", "", "file to write the publications to; standard output by default")
	manifest := flags.String("release", "", "release.json file the app reads next to the binaries it ships")

	if err := flags.Parse(args); err != nil {
		return 2
	}

	if flags.NArg() == 0 {
		return fail(stderr, fmt.Errorf("no binary to sign"))
	}

	private, err := privateKey(env)
	if err != nil {
		return fail(stderr, err)
	}

	publications := make([]release.Publication, 0, flags.NArg())

	for _, path := range flags.Args() {
		arch, err := release.ArchOf(path)
		if err != nil {
			return fail(stderr, err)
		}

		binary, err := os.ReadFile(path)
		if err != nil {
			return fail(stderr, err)
		}

		publication, err := release.Sign(private, *version, arch, *channel, binary)
		if err != nil {
			return fail(stderr, err)
		}

		fmt.Fprintf(stderr, "%s signed for %s %s, fingerprint %s\n", path, *version, arch, publication.SHA256)

		publications = append(publications, publication)
	}

	if *manifest != "" {
		if err := writeManifest(*manifest, publications); err != nil {
			return fail(stderr, err)
		}

		fmt.Fprintf(stderr, "%s written for the app\n", *manifest)
	}

	encoded, err := json.MarshalIndent(publications, "", "  ")
	if err != nil {
		return fail(stderr, err)
	}

	encoded = append(encoded, '\n')

	if *out == "" {
		fmt.Fprint(stdout, string(encoded))

		return 0
	}

	if err := os.WriteFile(*out, encoded, 0o644); err != nil {
		return fail(stderr, err)
	}

	return 0
}

func runPublish(args []string, stdout, stderr io.Writer, env environment) int {
	flags := flag.NewFlagSet("publish", flag.ContinueOnError)
	flags.SetOutput(stderr)

	api := flags.String("api", "", "URL of the platform API")

	if err := flags.Parse(args); err != nil {
		return 2
	}

	if flags.NArg() != 1 {
		return fail(stderr, fmt.Errorf("exactly one publications file is expected"))
	}

	client, err := apiClient(*api, env)
	if err != nil {
		return fail(stderr, err)
	}

	publications, err := readPublications(flags.Arg(0))
	if err != nil {
		return fail(stderr, err)
	}

	for _, publication := range publications {
		published, created, err := client.Publish(publication)
		if err != nil {
			return fail(stderr, err)
		}

		fmt.Fprintf(stdout, "%s %s %s %s\n", state(created), published.Version, published.Arch, published.Channel)
	}

	return 0
}

func runPromote(args []string, stdout, stderr io.Writer, env environment) int {
	flags := flag.NewFlagSet("promote", flag.ContinueOnError)
	flags.SetOutput(stderr)

	version := flags.String("version", "", "version to promote")
	channel := flags.String("channel", "stable", "target channel")
	api := flags.String("api", "", "URL of the platform API")

	if err := flags.Parse(args); err != nil {
		return 2
	}

	if *version == "" {
		return fail(stderr, fmt.Errorf("no version to promote"))
	}

	client, err := apiClient(*api, env)
	if err != nil {
		return fail(stderr, err)
	}

	promoted, err := client.Promote(*version, *channel)
	if err != nil {
		return fail(stderr, err)
	}

	for _, publication := range promoted {
		fmt.Fprintf(stdout, "promue %s %s %s\n", publication.Version, publication.Arch, publication.Channel)
	}

	return 0
}

func writeManifest(path string, publications []release.Publication) error {
	manifest, err := release.ManifestOf(publications)
	if err != nil {
		return err
	}

	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, append(encoded, '\n'), 0o644)
}

func readPublications(path string) ([]release.Publication, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var publications []release.Publication
	if err := json.Unmarshal(content, &publications); err != nil {
		return nil, fmt.Errorf("%s : %w", path, err)
	}

	if len(publications) == 0 {
		return nil, fmt.Errorf("%s : aucune publication", path)
	}

	return publications, nil
}

// The private key and the platform token are read from the environment only: a flag would leave them in the process list and in the workflow logs.
func privateKey(env environment) (ed25519.PrivateKey, error) {
	encoded := env(privateKeyVariable)
	if encoded == "" {
		return nil, fmt.Errorf("%s is empty: the signing key comes from the secret, not from a file in the repository", privateKeyVariable)
	}

	return release.ParsePrivateKey(encoded)
}

func apiClient(baseURL string, env environment) (release.API, error) {
	token := env(adminTokenVariable)
	if token == "" {
		return release.API{}, fmt.Errorf("%s is empty: publishing requires a platform administrator token", adminTokenVariable)
	}

	if baseURL == "" {
		baseURL = env(platformVariable)
	}

	return release.API{BaseURL: baseURL, Token: token}, nil
}

func state(created bool) string {
	if created {
		return "published"
	}

	return "already published"
}

func fail(stderr io.Writer, err error) int {
	fmt.Fprintln(stderr, err)

	return 1
}
