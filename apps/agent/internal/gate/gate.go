package gate

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"regexp"
	"slices"
	"strconv"
)

const (
	Unit = "pupitre-gate"

	// Only this folder of /etc/pupitre is visible to the gate's sandbox.
	Dir        = "/etc/pupitre/gate"
	AccessPath = Dir + "/access.json"
	RoutesPath = Dir + "/routes.json"

	Port = 8098

	Header         = "Pupitre-Key"
	Query          = "pupitre_key"
	Cookie         = "__Host-pupitre"
	IdentityHeader = "Pupitre-Identity"
	ReservedPath   = "/.pupitre/"
	LoginPath      = ReservedPath + "login"

	secretBytes = 32
)

var Address = "127.0.0.1:" + strconv.Itoa(Port)

var keyPattern = regexp.MustCompile(`^ppk_([a-z0-9]{12})_[a-z0-9]{32}$`)

// Projects nil opens every project of the server, those added later included.
type Key struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Hash      string   `json:"hash"`
	Projects  []string `json:"projects"`
	CreatedAt string   `json:"created_at"`
}

func (k Key) Opens(project string) bool {
	return k.Projects == nil || slices.Contains(k.Projects, project)
}

type Access struct {
	// Signs the cookie that stands for a key once a browser has shown it.
	Secret string `json:"secret"`
	Keys   []Key  `json:"keys"`
}

func (a Access) Find(id string) (Key, bool) {
	for _, key := range a.Keys {
		if key.ID == id {
			return key, true
		}
	}

	return Key{}, false
}

type Route struct {
	Hostname  string `json:"hostname"`
	Upstream  string `json:"upstream"`
	Project   string `json:"project"`
	Protected bool   `json:"protected"`
}

type Routes struct {
	Routes []Route `json:"routes"`
}

func KeyID(key string) (string, bool) {
	match := keyPattern.FindStringSubmatch(key)
	if match == nil {
		return "", false
	}

	return match[1], true
}

func Hash(key string) string {
	sum := sha256.Sum256([]byte(key))

	return hex.EncodeToString(sum[:])
}

func sameHash(key string, hash string) bool {
	return subtle.ConstantTimeCompare([]byte(Hash(key)), []byte(hash)) == 1
}

// The hash is signed along: a revoked key re-created under the same id does not revive old cookies.
func cookieValue(secret string, key Key) string {
	return key.ID + "." + base64.RawURLEncoding.EncodeToString(cookieMAC(secret, key))
}

func cookieMAC(secret string, key Key) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("pupitre-gate-cookie:" + key.ID + ":" + key.Hash))

	return mac.Sum(nil)
}

func validCookie(secret string, key Key, signature string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil {
		return false
	}

	return hmac.Equal(decoded, cookieMAC(secret, key))
}
