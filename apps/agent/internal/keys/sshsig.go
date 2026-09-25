package keys

import (
	"crypto"
	"crypto/ecdsa"
	edwards "crypto/ed25519"
	"crypto/elliptic"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"math/big"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/contract"
)

// The namespace and the first line of the signed message live here rather than in schema.json: every string the contract exports ends up in the binary.
const (
	ApprovalNamespace = "pupitre-key-approval"
	ApprovalHeader    = "pupitre-key-approval-v1"
)

const (
	armorBegin     = "-----BEGIN SSH SIGNATURE-----"
	armorEnd       = "-----END SSH SIGNATURE-----"
	sshsigMagic    = "SSHSIG"
	sshsigVersion  = 1
	ed25519KeyType = "ssh-ed25519"
	ecdsaKeyPrefix = "ecdsa-sha2-"
)

var (
	ErrSignatureUnreadable = errors.New("unreadable SSH signature")
	ErrSignatureNamespace  = errors.New("the signature was made for another namespace")
	ErrSignatureHash       = errors.New("the signature uses a hash the agent does not accept")
	ErrSignatureInvalid    = errors.New("the signature does not verify")
	ErrKeyUnsupported      = errors.New("the key type is refused")
)

type curve struct {
	curve  elliptic.Curve
	digest crypto.Hash
}

var curves = map[string]curve{
	"nistp256": {elliptic.P256(), crypto.SHA256},
	"nistp384": {elliptic.P384(), crypto.SHA384},
	"nistp521": {elliptic.P521(), crypto.SHA512},
}

// Envelope is an SSHSIG read for its shape: the key that claims to have signed, and what it claims to have signed under.
type Envelope struct {
	PublicKey []byte
	Namespace string
	Hash      string

	signatureType string
	signature     []byte
}

// VerifySignature reads an armored SSHSIG and checks it signs message under namespace with the key it carries.
func VerifySignature(armored, namespace string, message []byte) (Envelope, error) {
	envelope, err := ParseSignature(armored)
	if err != nil {
		return Envelope{}, err
	}

	return envelope, envelope.Verify(namespace, message)
}

func ParseSignature(armored string) (Envelope, error) {
	blob, err := unarmor(armored)
	if err != nil {
		return Envelope{}, err
	}

	rest, magic := strings.CutPrefix(string(blob), sshsigMagic)
	if !magic {
		return Envelope{}, ErrSignatureUnreadable
	}

	body := &wire{rest: []byte(rest)}
	version := body.uint32()
	envelope := Envelope{
		PublicKey: body.bytes(),
		Namespace: string(body.bytes()),
	}
	reserved := body.bytes()
	envelope.Hash = string(body.bytes())
	signature := &wire{rest: body.bytes()}

	envelope.signatureType = string(signature.bytes())
	envelope.signature = signature.bytes()

	if version != sshsigVersion || len(reserved) != 0 || !body.done() || !signature.done() {
		return Envelope{}, ErrSignatureUnreadable
	}

	return envelope, nil
}

func (e Envelope) Verify(namespace string, message []byte) error {
	if e.Namespace != namespace {
		return ErrSignatureNamespace
	}

	digest, err := messageDigest(e.Hash, message)
	if err != nil {
		return err
	}

	key, err := parsePublicKey(e.PublicKey)
	if err != nil {
		return err
	}

	if e.signatureType != key.keyType {
		return ErrSignatureInvalid
	}

	if !key.verify(signedData(e.Namespace, e.Hash, digest), e.signature) {
		return ErrSignatureInvalid
	}

	return nil
}

func unarmor(armored string) ([]byte, error) {
	text := strings.TrimSpace(armored)

	body, begins := strings.CutPrefix(text, armorBegin)
	body, ends := strings.CutSuffix(body, armorEnd)
	if !begins || !ends {
		return nil, ErrSignatureUnreadable
	}

	blob, err := base64.StdEncoding.Strict().DecodeString(strings.Join(strings.Fields(body), ""))
	if err != nil {
		return nil, ErrSignatureUnreadable
	}

	return blob, nil
}

func messageDigest(hash string, message []byte) ([]byte, error) {
	if !slices.Contains(contract.KeyApprovalRules.Hashes, hash) {
		return nil, ErrSignatureHash
	}

	switch hash {
	case "sha512":
		sum := sha512.Sum512(message)

		return sum[:], nil
	case "sha256":
		sum := sha256.Sum256(message)

		return sum[:], nil
	}

	return nil, ErrSignatureHash
}

// What the key actually signs: the message's digest wrapped with the namespace, so a signature made for anything else never counts here.
func signedData(namespace, hash string, digest []byte) []byte {
	data := []byte(sshsigMagic)
	data = appendString(data, []byte(namespace))
	data = appendString(data, nil)
	data = appendString(data, []byte(hash))

	return appendString(data, digest)
}

func appendString(data, value []byte) []byte {
	data = binary.BigEndian.AppendUint32(data, uint32(len(value)))

	return append(data, value...)
}

type publicKey struct {
	keyType string
	verify  func(data, signature []byte) bool
}

// Ed25519 and ECDSA on the NIST curves, the types an approval admits; every field is exactly what its type holds, and nothing trails.
func parsePublicKey(blob []byte) (publicKey, error) {
	body := &wire{rest: blob}
	keyType := string(body.bytes())

	if !slices.Contains(contract.KeyApprovalRules.KeyTypes, keyType) {
		return publicKey{}, ErrKeyUnsupported
	}

	if keyType == ed25519KeyType {
		point := body.bytes()
		if !body.done() || len(point) != edwards.PublicKeySize {
			return publicKey{}, ErrSignatureUnreadable
		}

		return publicKey{keyType: keyType, verify: func(data, signature []byte) bool {
			return len(signature) == edwards.SignatureSize && edwards.Verify(edwards.PublicKey(point), data, signature)
		}}, nil
	}

	name := string(body.bytes())
	point := body.bytes()
	known, found := curves[name]
	if !body.done() || !found || keyType != ecdsaKeyPrefix+name {
		return publicKey{}, ErrSignatureUnreadable
	}

	key, err := ecdsa.ParseUncompressedPublicKey(known.curve, point)
	if err != nil {
		return publicKey{}, ErrSignatureUnreadable
	}

	return publicKey{keyType: keyType, verify: func(data, signature []byte) bool {
		return verifyECDSA(key, known.digest, data, signature)
	}}, nil
}

func verifyECDSA(key *ecdsa.PublicKey, digest crypto.Hash, data, signature []byte) bool {
	body := &wire{rest: signature}
	r, s := mpint(body.bytes()), mpint(body.bytes())
	if !body.done() || r == nil || s == nil {
		return false
	}

	hasher := digest.New()
	hasher.Write(data)

	return ecdsa.Verify(key, hasher.Sum(nil), r, s)
}

// A positive mpint in its shortest form, as OpenSSH writes one; anything else is nil.
func mpint(raw []byte) *big.Int {
	if len(raw) == 0 || raw[0]&0x80 != 0 {
		return nil
	}

	if len(raw) > 1 && raw[0] == 0 && raw[1]&0x80 == 0 {
		return nil
	}

	return new(big.Int).SetBytes(raw)
}

// wire reads the length-prefixed strings of the SSH format; one short read breaks it for good.
type wire struct {
	rest   []byte
	broken bool
}

func (w *wire) uint32() uint32 {
	if w.broken || len(w.rest) < 4 {
		w.broken = true

		return 0
	}

	value := binary.BigEndian.Uint32(w.rest)
	w.rest = w.rest[4:]

	return value
}

func (w *wire) bytes() []byte {
	length := w.uint32()
	if w.broken || uint64(length) > uint64(len(w.rest)) {
		w.broken = true

		return nil
	}

	value := w.rest[:length]
	w.rest = w.rest[length:]

	return value
}

func (w *wire) done() bool {
	return !w.broken && len(w.rest) == 0
}
