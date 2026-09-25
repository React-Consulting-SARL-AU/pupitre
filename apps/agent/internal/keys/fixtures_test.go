package keys_test

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/keys"
)

// Signed by the real `ssh-keygen -Y sign`, exported by `bun run contracts:export`.
type approvalFixtures struct {
	Message   string                          `json:"message"`
	Signers   map[string]string               `json:"signers"`
	Approvals map[string]contract.KeyApproval `json:"approvals"`
}

var issued = time.Date(2026, time.September, 25, 10, 0, 0, 0, time.UTC)

func fixtures(t *testing.T) approvalFixtures {
	t.Helper()

	raw, err := os.ReadFile("../contract/key-approval.fixtures.json")
	if err != nil {
		t.Fatal(err)
	}

	var loaded approvalFixtures
	if err := json.Unmarshal(raw, &loaded); err != nil {
		t.Fatal(err)
	}

	return loaded
}

func approved(t *testing.T, line string) keys.Key {
	t.Helper()

	key, err := keys.ParseApproved(line)
	if err != nil {
		t.Fatalf("%s: %v", line, err)
	}

	return key
}

func blobOf(t *testing.T, line string) []byte {
	t.Helper()

	blob, err := base64.StdEncoding.DecodeString(strings.Fields(line)[1])
	if err != nil {
		t.Fatal(err)
	}

	return blob
}

type envelope struct {
	publicKey, namespace, reserved, hash, signature []byte
	trailing                                        []byte
}

func split(t *testing.T, armored string) envelope {
	t.Helper()

	body := strings.TrimSpace(armored)
	body = strings.TrimPrefix(body, "-----BEGIN SSH SIGNATURE-----")
	body = strings.TrimSuffix(body, "-----END SSH SIGNATURE-----")

	blob, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(body), ""))
	if err != nil || string(blob[:6]) != "SSHSIG" {
		t.Fatalf("unreadable fixture: %v", err)
	}

	rest := blob[10:]
	next := func() []byte {
		length := binary.BigEndian.Uint32(rest)
		value := rest[4 : 4+length]
		rest = rest[4+length:]

		return append([]byte(nil), value...)
	}

	return envelope{publicKey: next(), namespace: next(), reserved: next(), hash: next(), signature: next()}
}

func (e envelope) armor() string {
	blob := []byte("SSHSIG")
	blob = binary.BigEndian.AppendUint32(blob, 1)

	for _, field := range [][]byte{e.publicKey, e.namespace, e.reserved, e.hash, e.signature} {
		blob = wireString(blob, field)
	}

	blob = append(blob, e.trailing...)

	encoded := base64.StdEncoding.EncodeToString(blob)

	var lines []string
	for len(encoded) > 70 {
		lines = append(lines, encoded[:70])
		encoded = encoded[70:]
	}
	lines = append(lines, encoded)

	return "-----BEGIN SSH SIGNATURE-----\n" + strings.Join(lines, "\n") + "\n-----END SSH SIGNATURE-----\n"
}

func wireString(data, value []byte) []byte {
	data = binary.BigEndian.AppendUint32(data, uint32(len(value)))

	return append(data, value...)
}

func wireFields(raw []byte) [][]byte {
	var fields [][]byte

	for len(raw) >= 4 {
		length := binary.BigEndian.Uint32(raw)
		fields = append(fields, append([]byte(nil), raw[4:4+length]...))
		raw = raw[4+length:]
	}

	return fields
}

func joinWire(fields ...[]byte) []byte {
	var raw []byte
	for _, field := range fields {
		raw = wireString(raw, field)
	}

	return raw
}
