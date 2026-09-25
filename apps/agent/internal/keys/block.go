package keys

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io/fs"
	"path/filepath"
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

// Lines outside the marked block belong to the client and are never touched.
func Sync(ctx sys.Context, target Target, wanted []Key) (bool, error) {
	current, err := read(ctx, target.Path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}

	updated := file.WithBlock(current, Block, Render(wanted))
	if bytes.Equal(updated, current) {
		return false, nil
	}

	if err := file.WriteAtomic(ctx, target.Path, updated, FileMode); err != nil {
		return false, err
	}

	if target.Owner == "" {
		return true, nil
	}

	return true, file.Chown(ctx, target.Path, target.Owner, target.Owner)
}

func Listed(ctx sys.Context, path string) []Key {
	current, err := read(ctx, path)
	if err != nil {
		return nil
	}

	raw, found := file.BlockOf(current, Block)
	if !found {
		return nil
	}

	return Parse(raw).Keys
}

// Root reads a file the user owns: a link they planted must not lead the read out of their .ssh folder.
func read(ctx sys.Context, path string) ([]byte, error) {
	return ctx.Sys().ReadFileIn(filepath.Dir(path), filepath.Base(path))
}

// Sorted and deduplicated so a reordered answer does not rewrite the file every thirty seconds.
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
