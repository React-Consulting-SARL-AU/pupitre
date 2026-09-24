package s3

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	algorithm = "AWS4-HMAC-SHA256"
	service   = "s3"
	scopeEnd  = "aws4_request"

	amzDateFormat = "20060102T150405Z"
	dayFormat     = "20060102"

	headerDate    = "X-Amz-Date"
	headerPayload = "X-Amz-Content-Sha256"

	// UnsignedPayload leaves a part's body out of the signature: hashing 8 MiB twice buys nothing TLS does not already.
	UnsignedPayload = "UNSIGNED-PAYLOAD"
)

// EmptyPayload is the digest of no body at all.
var EmptyPayload = hashHex(nil)

var ErrUnsigned = errors.New("the request carries no signature this client would have made")

type credentials struct {
	accessKey string
	secret    string
	region    string
}

// sign adds the date, the payload digest and the Authorization header; every header already set on the request is signed with them.
func (c credentials) sign(request *http.Request, payload string, now time.Time) {
	stamp := now.UTC().Format(amzDateFormat)

	request.Header.Set(headerDate, stamp)
	request.Header.Set(headerPayload, payload)

	names := signedNames(request)
	signature := c.signature(request, names, payload, stamp)

	request.Header.Set("Authorization", algorithm+" Credential="+c.accessKey+"/"+c.scope(stamp)+", SignedHeaders="+strings.Join(names, ";")+", Signature="+signature)
}

func (c credentials) scope(stamp string) string {
	return stamp[:len(dayFormat)] + "/" + c.region + "/" + service + "/" + scopeEnd
}

func (c credentials) signature(request *http.Request, names []string, payload, stamp string) string {
	canonical := strings.Join([]string{
		request.Method,
		request.URL.EscapedPath(),
		canonicalQuery(request.URL.Query()),
		canonicalHeaders(request, names),
		strings.Join(names, ";"),
		payload,
	}, "\n")

	toSign := strings.Join([]string{algorithm, stamp, c.scope(stamp), hashHex([]byte(canonical))}, "\n")

	key := mac([]byte("AWS4"+c.secret), stamp[:len(dayFormat)])
	key = mac(key, c.region)
	key = mac(key, service)
	key = mac(key, scopeEnd)

	return hex.EncodeToString(mac(key, toSign))
}

// Verify recomputes the signature of a request as a server would, from what the request itself carries.
func Verify(request *http.Request, accessKey, secret, region string) error {
	authorization := request.Header.Get("Authorization")
	prefix := algorithm + " Credential=" + accessKey + "/"
	if !strings.HasPrefix(authorization, prefix) {
		return ErrUnsigned
	}

	_, signed, found := strings.Cut(authorization, "SignedHeaders=")
	if !found {
		return ErrUnsigned
	}

	names, signature, found := strings.Cut(signed, ", Signature=")
	if !found {
		return ErrUnsigned
	}

	holder := credentials{accessKey: accessKey, secret: secret, region: region}
	stamp := request.Header.Get(headerDate)
	if len(stamp) != len(amzDateFormat) {
		return ErrUnsigned
	}

	expected := holder.signature(request, strings.Split(names, ";"), request.Header.Get(headerPayload), stamp)
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return ErrUnsigned
	}

	return nil
}

func signedNames(request *http.Request) []string {
	names := []string{"host"}
	for name := range request.Header {
		lower := strings.ToLower(name)
		if lower == "authorization" || lower == "user-agent" || lower == "accept-encoding" {
			continue
		}

		names = append(names, lower)
	}

	sort.Strings(names)

	return names
}

func canonicalHeaders(request *http.Request, names []string) string {
	var lines strings.Builder

	for _, name := range names {
		value := request.Host
		if name != "host" {
			value = strings.Join(request.Header.Values(name), ",")
		}

		lines.WriteString(name + ":" + strings.Join(strings.Fields(value), " ") + "\n")
	}

	return lines.String()
}

func canonicalQuery(values url.Values) string {
	pairs := make([]string, 0, len(values))

	for key, list := range values {
		for _, value := range list {
			pairs = append(pairs, escape(key, true)+"="+escape(value, true))
		}
	}

	sort.Strings(pairs)

	return strings.Join(pairs, "&")
}

// escape is the URI encoding of SigV4: every byte but the unreserved ones, and the slash kept in a path.
func escape(value string, slash bool) string {
	var encoded strings.Builder

	for _, char := range []byte(value) {
		switch {
		case 'A' <= char && char <= 'Z', 'a' <= char && char <= 'z', '0' <= char && char <= '9', char == '-', char == '_', char == '.', char == '~':
			encoded.WriteByte(char)
		case char == '/' && !slash:
			encoded.WriteByte(char)
		default:
			encoded.WriteString("%" + strings.ToUpper(hex.EncodeToString([]byte{char})))
		}
	}

	return encoded.String()
}

func mac(key []byte, data string) []byte {
	hash := hmac.New(sha256.New, key)
	hash.Write([]byte(data))

	return hash.Sum(nil)
}

func hashHex(data []byte) string {
	sum := sha256.Sum256(data)

	return hex.EncodeToString(sum[:])
}
