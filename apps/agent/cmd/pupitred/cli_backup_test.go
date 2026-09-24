package main

import (
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/backup/seal"
)

const (
	fixturePassphrase = "correct horse battery staple"
	fixtureSalt       = "lneDgZnxLTb17pcdSfaKvA=="
	fixturePrivate    = "3/kJOuP+i9Ij0TrB+P4qgR/v3lb1+P8Tc5eNFVeKsEk="
	fixtureRecipient  = "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw="
)

// sealedPart writes a part as a backup does: gzip, then sealed for the fixtures' recipient.
func sealedPart(t *testing.T, plain string) string {
	t.Helper()

	recipient, err := seal.DecodeKey(fixtureRecipient)
	if err != nil {
		t.Fatal(err)
	}

	var sealed bytes.Buffer
	writer, err := seal.NewWriter(&sealed, recipient, seal.Options{})
	if err != nil {
		t.Fatal(err)
	}

	zipped := gzip.NewWriter(writer)
	if _, err := zipped.Write([]byte(plain)); err != nil {
		t.Fatal(err)
	}
	if err := zipped.Close(); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	path := filepath.Join(t.TempDir(), "db-postgres-shop.pupitre")
	if err := os.WriteFile(path, sealed.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}

	return path
}

func open(args []string, secret string) (int, string, string) {
	var stdout, stderr bytes.Buffer
	code := run(append([]string{"backup", "open"}, args...), strings.NewReader(secret+"\n"), &stdout, &stderr)

	return code, stdout.String(), stderr.String()
}

func TestAPartOpensWithoutPupitreFromThePassphraseOrTheKey(t *testing.T) {
	path := sealedPart(t, "PGDMP the dump")

	if code, out, stderr := open([]string{"--salt=" + fixtureSalt, path}, fixturePassphrase); code != 0 || out != "PGDMP the dump" {
		t.Fatalf("by passphrase: %d %q %s", code, out, stderr)
	}

	if code, out, stderr := open([]string{"--private-key", path}, fixturePrivate); code != 0 || out != "PGDMP the dump" {
		t.Fatalf("by key: %d %q %s", code, out, stderr)
	}
}

func TestAWrongPassphraseOrAForeignFileIsSaidAsSuch(t *testing.T) {
	path := sealedPart(t, "PGDMP the dump")

	if code, out, _ := open([]string{"--salt=" + fixtureSalt, "--iterations=1000", path}, fixturePassphrase); code != 1 || out != "" {
		t.Fatalf("another key: %d %q", code, out)
	}

	foreign := filepath.Join(t.TempDir(), "notes.txt")
	if err := os.WriteFile(foreign, []byte("nothing sealed in here, only words and more words"), 0o600); err != nil {
		t.Fatal(err)
	}

	if code, _, stderr := open([]string{"--private-key", foreign}, fixturePrivate); code != 1 || stderr == "" {
		t.Fatalf("a foreign file: %d %s", code, stderr)
	}

	if code, _, _ := open([]string{path}, fixturePassphrase); code != 2 {
		t.Fatal("without a salt nor a key, the usage")
	}
}
