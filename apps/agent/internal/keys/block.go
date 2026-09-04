package keys

import (
	"crypto/sha256"
	"encoding/base64"
	"io/fs"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	Block    = "keys"
	FileMode = fs.FileMode(0o600)
)

func (k Key) Fingerprint() string {
	raw, err := base64.StdEncoding.DecodeString(k.Blob)
	if err != nil {
		return ""
	}

	sum := sha256.Sum256(raw)

	return "SHA256:" + base64.RawStdEncoding.EncodeToString(sum[:])
}

type Target struct {
	Path  string
	Owner string
}

// The block is the whole of what the platform owns in authorized_keys; every line outside it belongs to the client and is never touched.
func Sync(ctx sys.Context, target Target, wanted []Key) (bool, error) {
	changed, err := file.EnsureBlockMode(ctx, target.Path, Block, Render(wanted), FileMode)
	if err != nil || !changed {
		return false, err
	}

	if target.Owner == "" {
		return true, nil
	}

	return true, file.Chown(ctx, target.Path, target.Owner, target.Owner)
}

func Listed(ctx sys.Context, path string) []Key {
	raw, found := file.ReadBlock(ctx, path, Block)
	if !found {
		return nil
	}

	return Parse(raw).Keys
}

// Sorted and deduplicated, so a platform that answers in another order does not rewrite the file every thirty seconds.
func Render(wanted []Key) []byte {
	lines := make([]string, 0, len(wanted))
	seen := map[string]bool{}

	for _, key := range wanted {
		if key.Type == "" || seen[key.Blob] {
			continue
		}

		seen[key.Blob] = true
		lines = append(lines, key.Line())
	}

	sort.Strings(lines)

	if len(lines) == 0 {
		return nil
	}

	return []byte(strings.Join(lines, "\n") + "\n")
}

func ParseAll(lines []string) ([]Key, []string) {
	var parsed []Key
	var refused []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		key, err := ParseLine(trimmed)
		if err != nil {
			refused = append(refused, trimmed)
			continue
		}

		parsed = append(parsed, key)
	}

	return parsed, refused
}
