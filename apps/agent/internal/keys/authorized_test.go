package keys

import (
	"reflect"
	"testing"
)

const ed25519 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl jordan@laptop"

func TestParseLineAcceptsWellFormedKeys(t *testing.T) {
	key, err := ParseLine(ed25519)
	if err != nil || key.Type != "ssh-ed25519" || key.Comment != "jordan@laptop" || key.Options != "" {
		t.Fatalf("ParseLine = %+v, %v", key, err)
	}

	if key.Line() != ed25519 {
		t.Fatalf("Line = %q", key.Line())
	}

	restricted, err := ParseLine(`no-port-forwarding,command="echo hi" ` + ed25519)
	if err != nil || !restricted.Restricted() || restricted.Blob != key.Blob {
		t.Fatalf("restricted = %+v, %v", restricted, err)
	}
}

func TestParseLineRejectsMalformedKeys(t *testing.T) {
	for _, line := range []string{
		"",
		"ssh-ed25519",
		"ssh-ed25519 AAAA",
		"ssh-ed25519 not-base64!! comment",
		"ssh-rsa AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl",
		"ssh-foo AAAAC3NzaC1lZDI1NTE5AAAAILykUfO8a7qKBQHbW/KSfnaTtl1nAJxVpOzifJBri1Hl",
	} {
		if _, err := ParseLine(line); err == nil {
			t.Errorf("%q accepted", line)
		}
	}
}

func TestParseSkipsCommentsAndCountsMalformedLines(t *testing.T) {
	parsed := Parse([]byte("# comment\n\n" + ed25519 + "\nssh-ed25519 broken\n"))

	if len(parsed.Keys) != 1 || !reflect.DeepEqual(parsed.Malformed, []int{4}) {
		t.Fatalf("Parse = %+v", parsed)
	}

	if !parsed.Has(parsed.Keys[0]) || parsed.Has(Key{Type: "ssh-rsa", Blob: "x"}) {
		t.Fatal("Has answers wrong")
	}
}
