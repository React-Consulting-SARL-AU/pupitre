package daemon_test

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha512"
	"encoding/base64"
	"encoding/binary"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	serverID    = "cm0k2x9q80000a1b2c3d4e5f6"
	otherServer = "cz9y8x7w6v5u4t3s2r1q0p9o8"
	jordan      = "Xq3v9LmN2pR7tY5wZ8aB1cD4"
)

// device holds a private key the way a laptop does, and signs approvals the way the app does with `ssh-keygen -Y sign`.
type device struct {
	private ed25519.PrivateKey
	line    string
}

func newDevice(seed byte) device {
	private := ed25519.NewKeyFromSeed(bytes.Repeat([]byte{seed}, ed25519.SeedSize))
	blob := wire(wire(nil, []byte("ssh-ed25519")), private.Public().(ed25519.PublicKey))

	return device{private: private, line: "ssh-ed25519 " + base64.StdEncoding.EncodeToString(blob)}
}

var (
	laptopDevice  = newDevice(1)
	desktopDevice = newDevice(2)
	phoneDevice   = newDevice(3)
)

func (d device) key(t *testing.T) keys.Key {
	t.Helper()

	key, err := keys.ParseApproved(d.line)
	if err != nil {
		t.Fatal(err)
	}

	return key
}

func (d device) fingerprint(t *testing.T) string {
	return d.key(t).Fingerprint()
}

func (d device) approves(t *testing.T, other device, at time.Time) contract.KeyApproval {
	return d.approvesOn(t, serverID, other, at)
}

func (d device) approvesOn(t *testing.T, server string, other device, at time.Time) contract.KeyApproval {
	t.Helper()

	approval := contract.KeyApproval{
		ServerID:  server,
		PublicKey: other.line,
		UserID:    jordan,
		IssuedAt:  at.UTC().Format("2006-01-02T15:04:05Z"),
		Signer:    d.fingerprint(t),
	}

	digest := sha512.Sum512(keys.ApprovalMessage(approval))
	signed := []byte("SSHSIG")
	for _, field := range [][]byte{[]byte(keys.ApprovalNamespace), nil, []byte("sha512"), digest[:]} {
		signed = wire(signed, field)
	}

	publicBlob, _ := base64.StdEncoding.DecodeString(strings.Fields(d.line)[1])
	signature := wire(wire(nil, []byte("ssh-ed25519")), ed25519.Sign(d.private, signed))

	blob := binary.BigEndian.AppendUint32([]byte("SSHSIG"), 1)
	for _, field := range [][]byte{publicBlob, []byte(keys.ApprovalNamespace), nil, []byte("sha512"), signature} {
		blob = wire(blob, field)
	}

	encoded := base64.StdEncoding.EncodeToString(blob)
	var lines []string
	for len(encoded) > 70 {
		lines, encoded = append(lines, encoded[:70]), encoded[70:]
	}
	lines = append(lines, encoded)

	approval.Signature = "-----BEGIN SSH SIGNATURE-----\n" + strings.Join(lines, "\n") + "\n-----END SSH SIGNATURE-----\n"

	return approval
}

func wire(data, value []byte) []byte {
	data = binary.BigEndian.AppendUint32(data, uint32(len(value)))

	return append(data, value...)
}

func asked(d device, approvals ...contract.KeyApproval) contract.AgentStateKey {
	if approvals == nil {
		approvals = []contract.KeyApproval{}
	}

	return contract.AgentStateKey{PublicKey: d.line, UserID: jordan, DeviceID: "device", Approvals: approvals}
}

// trusting lays devices the way an onboarding does: trusted, and in the block.
func (b *bench) trusting(t *testing.T, devices ...device) {
	t.Helper()

	ctx := modtest.NewSysContext(b.fake)
	trust, err := keys.LoadTrust(b.fake, keys.DefaultSignersPath)
	if err != nil {
		t.Fatal(err)
	}

	block := keys.Listed(ctx, keys.DefaultPath)
	for _, d := range devices {
		trust.Add(d.key(t), keys.ViaOnboarding, b.now)
		block = append(block, d.key(t))
	}

	if err := trust.Save(ctx, keys.DefaultSignersPath, b.now); err != nil {
		t.Fatal(err)
	}

	if _, err := keys.Sync(ctx, keys.Target{Path: keys.DefaultPath}, block); err != nil {
		t.Fatal(err)
	}
}

func (b *bench) trust(t *testing.T) keys.Trust {
	t.Helper()

	trust, err := keys.LoadTrust(b.fake, keys.DefaultSignersPath)
	if err != nil {
		t.Fatal(err)
	}

	return trust
}

func (b *bench) opens(d device) bool {
	return strings.Contains(b.authorized(), d.line)
}
