package keys

import (
	"bytes"
	"encoding/base64"
	"errors"
	"regexp"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
)

const issuedAtLayout = "2006-01-02T15:04:05Z"

var (
	ErrKeyRefused         = errors.New("the key is not a bare ed25519 or ecdsa key")
	ErrApprovalShape      = errors.New("the approval is not the shape the contract fixes")
	ErrApprovalServer     = errors.New("the approval names another server")
	ErrApprovalKey        = errors.New("the approval names another key")
	ErrApprovalUser       = errors.New("the approval names another user")
	ErrApprovalExpired    = errors.New("the approval is too old")
	ErrApprovalEarly      = errors.New("the approval is dated in the future")
	ErrApprovalSigner     = errors.New("the approval is signed by a key this server does not trust")
	ErrApprovalSignerKey  = errors.New("the signature carries another key than the signer it names")
	ErrApprovalAfterwards = errors.New("the key was removed after the approval was issued")
)

var (
	approvedKey = regexp.MustCompile(contract.KeyApprovalRules.KeyPattern)
	serverID    = regexp.MustCompile(contract.KeyApprovalRules.ServerIDPattern)
)

// ValidServerID says whether an identifier is one the platform draws: nothing else becomes a file name, a bucket prefix or a signed field.
func ValidServerID(id string) bool {
	return serverID.MatchString(id)
}

// Bare is the key as an approval names it: its type and its body, without options or comment.
func (k Key) Bare() string {
	return k.Type + " " + k.Blob
}

// ParseApproved reads a key the way an approval and the trust store hold one: `type base64`, an admitted type, and a body that is exactly that key.
func ParseApproved(line string) (Key, error) {
	if !approvedKey.MatchString(line) {
		return Key{}, ErrKeyRefused
	}

	keyType, body, _ := strings.Cut(line, " ")

	blob, err := base64.StdEncoding.Strict().DecodeString(body)
	if err != nil {
		return Key{}, ErrKeyRefused
	}

	parsed, err := parsePublicKey(blob)
	if err != nil || parsed.keyType != keyType {
		return Key{}, ErrKeyRefused
	}

	return Key{Type: keyType, Blob: body}, nil
}

// ApprovalMessage is the exact bytes a device signs: five lines, each ended by a line feed.
func ApprovalMessage(approval contract.KeyApproval) []byte {
	return []byte(strings.Join([]string{
		ApprovalHeader,
		"server_id:" + approval.ServerID,
		"public_key:" + approval.PublicKey,
		"user_id:" + approval.UserID,
		"issued_at:" + approval.IssuedAt,
		"",
	}, "\n"))
}

// Verifier holds what an approval is checked against: this server's own identifier, the keys it trusts to sign, and when each key was last removed.
type Verifier struct {
	ServerID string
	Trusted  []Key
	Removed  func(fingerprint string) (time.Time, bool)
	Now      time.Time
}

// Admits says whether approval lets key in for userID on this server; the first rule that fails is the answer.
func (v Verifier) Admits(key Key, userID string, approval contract.KeyApproval) error {
	if contract.ValidateValue("KeyApproval", approval) != nil {
		return ErrApprovalShape
	}

	if !ValidServerID(v.ServerID) || approval.ServerID != v.ServerID {
		return ErrApprovalServer
	}

	if approval.PublicKey != key.Bare() {
		return ErrApprovalKey
	}

	if approval.UserID != userID {
		return ErrApprovalUser
	}

	issued, err := v.dated(approval.IssuedAt)
	if err != nil {
		return err
	}

	signer, found := v.signer(approval.Signer)
	if !found {
		return ErrApprovalSigner
	}

	envelope, err := ParseSignature(approval.Signature)
	if err != nil {
		return err
	}

	if !bytes.Equal(envelope.PublicKey, signer) {
		return ErrApprovalSignerKey
	}

	if err := envelope.Verify(ApprovalNamespace, ApprovalMessage(approval)); err != nil {
		return err
	}

	if v.Removed != nil {
		if removed, gone := v.Removed(key.Fingerprint()); gone && !issued.After(removed) {
			return ErrApprovalAfterwards
		}
	}

	return nil
}

func (v Verifier) dated(issuedAt string) (time.Time, error) {
	issued, err := time.Parse(issuedAtLayout, issuedAt)
	if err != nil {
		return time.Time{}, ErrApprovalShape
	}

	rules := contract.KeyApprovalRules

	if v.Now.Sub(issued) > time.Duration(rules.MaxAgeSeconds)*time.Second {
		return time.Time{}, ErrApprovalExpired
	}

	if issued.Sub(v.Now) > time.Duration(rules.FutureSkewSeconds)*time.Second {
		return time.Time{}, ErrApprovalEarly
	}

	return issued, nil
}

func (v Verifier) signer(fingerprint string) ([]byte, bool) {
	for _, trusted := range v.Trusted {
		if trusted.Fingerprint() != fingerprint {
			continue
		}

		blob, err := base64.StdEncoding.DecodeString(trusted.Blob)

		return blob, err == nil
	}

	return nil, false
}
