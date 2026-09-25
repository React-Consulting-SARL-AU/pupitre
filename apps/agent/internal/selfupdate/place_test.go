package selfupdate_test

import (
	"crypto/ed25519"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/selfupdate"
)

func (b *bench) place(t *testing.T, staged selfupdate.Staged) (selfupdate.Result, error) {
	t.Helper()

	return selfupdate.New(b.options).Place(staged)
}

func TestPlaceInstallsAPushedBinarySignedByTheEmbeddedKey(t *testing.T) {
	b := newBench(t)

	result, err := b.place(t, selfupdate.Staged{Version: nextAgent, Signature: b.signature, Binary: newBinary})
	if err != nil {
		t.Fatalf("Place: %v", err)
	}

	if result.PreviousVersion != currentAgent || result.Version != nextAgent || !result.Restarting {
		t.Fatalf("result = %+v", result)
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) || b.fake.Restarts[unit] != 1 {
		t.Fatalf("binary %q, restarts %d", b.fake.Files[binaryPath], b.fake.Restarts[unit])
	}

	if len(b.requested) != 0 {
		t.Fatalf("a pushed binary asks nothing of the platform: %v", b.requested)
	}
}

func TestPlaceRefusesWhatTheSignatureDoesNotCover(t *testing.T) {
	_, stranger, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]func(b *bench) selfupdate.Staged{
		"other bytes": func(b *bench) selfupdate.Staged {
			return selfupdate.Staged{Version: nextAgent, Signature: b.signature, Binary: []byte("\x7fELF autre chose")}
		},
		"other version": func(b *bench) selfupdate.Staged {
			return selfupdate.Staged{Version: "1.2.0", Signature: b.signature, Binary: newBinary}
		},
		"other architecture": func(b *bench) selfupdate.Staged {
			return selfupdate.Staged{Version: nextAgent, Signature: sign(b.private, nextAgent, "arm64", selfupdate.Fingerprint(newBinary)), Binary: newBinary}
		},
		"other key": func(b *bench) selfupdate.Staged {
			return selfupdate.Staged{Version: nextAgent, Signature: sign(stranger, nextAgent, arch, selfupdate.Fingerprint(newBinary)), Binary: newBinary}
		},
	}

	for name, staged := range cases {
		t.Run(name, func(t *testing.T) {
			b := newBench(t)
			before := snapshot(b.fake)

			_, err := b.place(t, staged(b))
			if code := codeOf(t, err); code != contract.ErrorBadSignature {
				t.Fatalf("code = %s, err = %v", code, err)
			}

			assertUntouched(t, b, before)
		})
	}
}

func TestPlaceRefusesAnUnsignedBinaryWhenTheAgentHoldsTheKey(t *testing.T) {
	b := newBench(t)
	before := snapshot(b.fake)

	_, err := b.place(t, selfupdate.Staged{Version: nextAgent, Binary: newBinary})
	if code := codeOf(t, err); code != contract.ErrorBadSignature {
		t.Fatalf("code = %s, err = %v", code, err)
	}

	assertUntouched(t, b, before)
}

func TestPlaceHoldsTheFloorOfTheRunningVersion(t *testing.T) {
	b := newBench(t)
	signed := sign(b.private, olderAgent, arch, selfupdate.Fingerprint(newBinary))
	before := snapshot(b.fake)

	_, err := b.place(t, selfupdate.Staged{Version: olderAgent, Signature: signed, Binary: newBinary})
	if code := codeOf(t, err); code != contract.ErrorDowngradeRefused {
		t.Fatalf("code = %s, err = %v", code, err)
	}

	assertUntouched(t, b, before)
}

// A build from the repository carries no release key: it is the development agent, and takes the binary the development app pushes — on the path the password opens.
func TestPlaceWithoutAReleaseKeyTakesTheBinaryAsIsWhenPrivileged(t *testing.T) {
	b := newBench(t)
	b.options.PublicKey = nil

	if _, err := b.place(t, selfupdate.Staged{Version: nextAgent, Binary: newBinary, Privileged: true}); err != nil {
		t.Fatalf("Place: %v", err)
	}

	if string(b.fake.Files[binaryPath]) != string(newBinary) {
		t.Fatalf("binary %q", b.fake.Files[binaryPath])
	}
}

// Without a key nothing checks the bytes: on the line sudo lets dev run without a password, that would be any program as root.
func TestPlaceWithoutAReleaseKeyRefusesTheLineSudoOpensWithoutAPassword(t *testing.T) {
	b := newBench(t)
	b.options.PublicKey = nil
	before := snapshot(b.fake)

	_, err := b.place(t, selfupdate.Staged{Version: nextAgent, Binary: newBinary})
	if code := codeOf(t, err); code != contract.ErrorPrivilegeRequired {
		t.Fatalf("code = %s, err = %v", code, err)
	}

	assertUntouched(t, b, before)
}
