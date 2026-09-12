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
	}

	usage(stderr)

	return 2
}

func usage(stderr io.Writer) {
	fmt.Fprintln(stderr, "usage: release <keygen|public-key|sign --version=X [--channel=beta] [--out=FILE] [--release=FILE] BINARY...>")
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

// The private key is read from the environment only: a flag would leave it in the process list and in the workflow logs.
func privateKey(env environment) (ed25519.PrivateKey, error) {
	encoded := env(privateKeyVariable)
	if encoded == "" {
		return nil, fmt.Errorf("%s is empty: the signing key comes from the secret, not from a file in the repository", privateKeyVariable)
	}

	return release.ParsePrivateKey(encoded)
}

func fail(stderr io.Writer, err error) int {
	fmt.Fprintln(stderr, err)

	return 1
}
