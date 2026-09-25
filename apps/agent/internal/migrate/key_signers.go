package migrate

import (
	"path/filepath"
	"slices"
	"strings"
	"time"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/sys/file"
)

// The key types a device could hold when approvals arrived; the list is frozen with this migration.
var grandfatheredTypes = []string{"ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521"}

// Before approvals, every key of the managed block opened the server. Those
// that could sign one become its first signers, so updating the agent locks
// nobody out. An RSA key, or one held back by options, opens the server as it
// did until the platform stops asking for it, and signs nothing.
func keySigners(ctx *Context) error {
	if ctx.Exists(TargetSigners) {
		return nil
	}

	path := ctx.Paths.Resolved().Keys

	raw, err := ctx.Sys().ReadFileIn(filepath.Dir(path), filepath.Base(path))
	if err != nil {
		ctx.Logf("no signer seeded, %s unread: %s", path, err)

		return nil
	}

	block, found := file.BlockOf(raw, keys.Block)
	if !found {
		return nil
	}

	since := ctx.Now().UTC().Format(time.RFC3339)
	seen := map[string]bool{}
	signers := []any{}

	for _, line := range strings.Split(string(block), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || !slices.Contains(grandfatheredTypes, fields[0]) {
			continue
		}

		key, err := keys.ParseApproved(fields[0] + " " + fields[1])
		if err != nil || seen[key.Blob] {
			continue
		}

		seen[key.Blob] = true
		signers = append(signers, map[string]any{"public_key": key.Bare(), "via": keys.ViaMigration, "since": since})
	}

	if len(signers) == 0 {
		return nil
	}

	return ctx.SetJSON(TargetSigners, map[string]any{"signers": signers, "removed": []any{}})
}
