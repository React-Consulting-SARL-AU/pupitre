package main

import (
	"bytes"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/selfupdate"
)

const pushedHello = `{"id":1,"ok":true,"result":{"agent_version":"1.1.0","protocol":2,"entitlement":"restricted","capabilities":["hello"]}}` + "\n"

func TestBinaryInstallPlacesThePushedAgentAndPrintsItsDigest(t *testing.T) {
	fake, _ := setupCLI(t)
	fake.Files[selfupdate.DefaultBinaryPath] = []byte("\x7fELF ancien agent")
	fake.Replies[selfupdate.DefaultBinaryPath+" serve"] = pushedHello
	pushed := []byte("\x7fELF nouvel agent")

	var stdout, stderr bytes.Buffer
	code := run([]string{"binary", "install", "--privileged"}, pushedWith(`{"version":"1.1.0"}`, pushed), &stdout, &stderr)

	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}

	if want := selfupdate.Fingerprint(pushed) + "  " + selfupdate.DefaultBinaryPath + "\n"; stdout.String() != want {
		t.Fatalf("stdout = %q, want %q", stdout.String(), want)
	}

	if !bytes.Equal(fake.Files[selfupdate.DefaultBinaryPath], pushed) {
		t.Fatalf("binary = %q", fake.Files[selfupdate.DefaultBinaryPath])
	}
}

func pushedWith(header string, binary []byte) *bytes.Reader {
	return bytes.NewReader(append([]byte(header+"\n"), binary...))
}

// Exit 2 is kept for what the command line itself gets wrong: the app reads it as an agent too old to know the command.
// sudo lets dev run `pupitred binary install` exactly, so nothing on the command line may loosen a check.
func TestBinaryInstallSaysWhatItNeedsBeforeReadingAnything(t *testing.T) {
	for _, args := range [][]string{
		{"binary"},
		{"binary", "install", "--version=1.1.0"},
		{"binary", "install", "--signature=AAAA"},
		{"binary", "install", "--force"},
		{"binary", "install", "--allow-downgrade", "--allow-downgrade"},
		{"binary", "remove"},
	} {
		setupCLI(t)

		var stdout, stderr bytes.Buffer
		if code := run(args, pushedWith(`{"version":"1.1.0"}`, []byte("\x7fELF")), &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Errorf("%v: exit %d, stdout %q", args, code, stdout.String())
		}
	}
}

// A test binary carries no release key, like a build of the repository: it places a binary only on the path the password opens.
func TestAnUnsignedBinaryIsPlacedOnlyOnThePrivilegedPath(t *testing.T) {
	for _, args := range [][]string{{"binary", "install"}, {"binary", "install", "--privileged"}} {
		fake, _ := setupCLI(t)
		fake.Files[selfupdate.DefaultBinaryPath] = []byte("\x7fELF ancien agent")
		fake.Replies[selfupdate.DefaultBinaryPath+" serve"] = pushedHello
		pushed := []byte("\x7fELF agent du dépôt")

		var stdout, stderr bytes.Buffer
		code := run(args, pushedWith(`{"version":"1.1.0"}`, pushed), &stdout, &stderr)

		privileged := len(args) == 3
		if privileged && (code != 0 || !bytes.Equal(fake.Files[selfupdate.DefaultBinaryPath], pushed)) {
			t.Fatalf("%v: exit %d, stderr %q", args, code, stderr.String())
		}

		if !privileged && (code != 1 || !strings.Contains(stderr.String(), "--privileged") || !bytes.Equal(fake.Files[selfupdate.DefaultBinaryPath], []byte("\x7fELF ancien agent"))) {
			t.Fatalf("%v placed an unsigned binary without the password: exit %d, stderr %q", args, code, stderr.String())
		}
	}
}

func TestBinaryInstallReadsWhatTheSignatureCoversOnItsFirstLine(t *testing.T) {
	for name, header := range map[string]string{
		"no header line":       "",
		"no version":           `{"signature":"AAAA"}`,
		"an unknown field":     `{"version":"1.1.0","allow_downgrade":true}`,
		"not json":             `version=1.1.0`,
		"a version with space": `{"version":"1.1.0 --allow-downgrade"}`,
	} {
		t.Run(name, func(t *testing.T) {
			fake, _ := setupCLI(t)
			fake.Files[selfupdate.DefaultBinaryPath] = []byte("\x7fELF ancien agent")
			fake.Replies[selfupdate.DefaultBinaryPath+" serve"] = pushedHello

			input := pushedWith(header, []byte("\x7fELF nouvel agent"))
			if header == "" {
				input = bytes.NewReader([]byte("\x7fELF nouvel agent"))
			}

			var stdout, stderr bytes.Buffer
			if code := run([]string{"binary", "install"}, input, &stdout, &stderr); code != 1 || stdout.Len() != 0 || stderr.Len() == 0 {
				t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
			}

			if string(fake.Files[selfupdate.DefaultBinaryPath]) != "\x7fELF ancien agent" {
				t.Fatal("the agent was replaced")
			}
		})
	}
}

// The password never travels, not even its hash in params: a line on the secret stream, refused whole when it is not a crypt hash.
func TestHardenSudoTakesItsHashOnTheSecretLine(t *testing.T) {
	fake, dir := setupCLI(t)

	lines := serveOn(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"harden.sudo","params":{"user":"dev","secrets_stdin":true}}`,
		`{"password_hash":"k7mp-q2xw-9hdt-3vzc-u8fa-6rne"}`,
	)

	if code := errorCode(t, lines[len(lines)-1]); code != "bad_request" {
		t.Fatalf("harden.sudo: %s", lines[len(lines)-1])
	}

	if strings.Contains(strings.Join(lines, "\n"), "k7mp") || strings.Contains(string(fake.Files[dir+"/pupitre.log"]), "k7mp") {
		t.Fatal("the refused value was repeated")
	}

	for _, call := range fake.Calls {
		if call.Argv[0] == "chpasswd" {
			t.Fatal("chpasswd ran on a refused line")
		}
	}
}

func TestBinaryInstallRefusalIsNotAUsageError(t *testing.T) {
	fake, _ := setupCLI(t)
	fake.Files[selfupdate.DefaultBinaryPath] = []byte("\x7fELF ancien agent")
	fake.Replies[selfupdate.DefaultBinaryPath+" serve"] = pushedHello

	var stdout, stderr bytes.Buffer
	code := run([]string{"binary", "install"}, strings.NewReader(`{"version":"1.1.0"}`+"\n"), &stdout, &stderr)

	if code != 1 || stdout.Len() != 0 || stderr.Len() == 0 {
		t.Fatalf("exit %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
	}

	if string(fake.Files[selfupdate.DefaultBinaryPath]) != "\x7fELF ancien agent" {
		t.Fatal("an empty push replaced the agent")
	}
}
