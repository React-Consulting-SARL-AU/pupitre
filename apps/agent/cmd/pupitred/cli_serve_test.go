package main

import (
	"bytes"
	"strings"
	"testing"
)

const helloLine = `{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`

// sudo runs `pupitred serve` exactly without a password: that line is the limited session, and --privileged is only reached through the password.
func TestServeIsLimitedUnlessPrivilegedIsAsked(t *testing.T) {
	cases := map[string]struct {
		args    []string
		limited bool
	}{
		"the line sudo runs without a password": {args: nil, limited: true},
		"the line the password opens":           {args: []string{"--privileged"}, limited: false},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			limited, ok := serveMode(tc.args)
			if !ok || limited != tc.limited {
				t.Fatalf("serveMode(%v) = %v, %v", tc.args, limited, ok)
			}
		})
	}
}

func TestServeRefusesAnyOtherArgument(t *testing.T) {
	for _, args := range [][]string{{"--root"}, {"--privileged", "--privileged"}, {"privileged"}, {"--privileged=true"}} {
		setupCLI(t)

		var stdout, stderr bytes.Buffer
		if code := run(append([]string{"serve"}, args...), strings.NewReader(helloLine+"\n"), &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Errorf("serve %v: exit %d, stdout %q", args, code, stdout.String())
		}
	}
}

func TestTheLimitedSessionRefusesToTrustAKey(t *testing.T) {
	fake, _ := setupCLI(t)

	var out bytes.Buffer
	input := strings.Join([]string{
		helloLine,
		`{"id":2,"cmd":"keys.trust","params":{"public_key":"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"}}`,
		`{"id":3,"cmd":"snapshot"}`,
	}, "\n") + "\n"

	if err := newServer(newEngine(), true).Serve(strings.NewReader(input), &out); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if code := errorCode(t, lines[1]); code != "privilege_required" {
		t.Fatalf("keys.trust = %s", lines[1])
	}

	if response := decodeResponse(t, lines[2]); response["ok"] != true {
		t.Fatalf("snapshot = %s", lines[2])
	}

	for path := range fake.Files {
		if strings.Contains(path, "signers") {
			t.Fatalf("a signer was written: %s", path)
		}
	}
}
