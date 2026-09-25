// Package providers reads the "vendor:key" entries a form composes for an agent that talks to model providers, and renders them as the environment the agent reads.
package providers

import (
	"sort"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
)

// Shape is the pattern a manifest holds an entry to: a vendor name, a colon, the key.
const Shape = `^[A-Za-z0-9 ._-]+:.+$`

type Provider struct {
	Name string
	Key  string
}

// The vendor half of an entry names the environment key; the other half is the secret and never leaves this value.
func (p Provider) EnvKey(prefix string) string {
	return prefix + p.Name + "_API_KEY"
}

func Parse(entries []string) []Provider {
	seen := map[string]Provider{}

	for _, entry := range entries {
		name, key, found := strings.Cut(strings.TrimSpace(entry), ":")
		if !found {
			continue
		}

		name, key = normalize(name), strings.TrimSpace(key)
		if name == "" || key == "" {
			continue
		}

		seen[name] = Provider{Name: name, Key: key}
	}

	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)

	found := make([]Provider, 0, len(names))
	for _, name := range names {
		found = append(found, seen[name])
	}

	return found
}

func normalize(name string) string {
	var out strings.Builder
	for _, letter := range strings.ToUpper(strings.TrimSpace(name)) {
		switch {
		case letter >= 'A' && letter <= 'Z', letter >= '0' && letter <= '9':
			out.WriteRune(letter)
		case letter == '-' || letter == '_' || letter == ' ' || letter == '.':
			out.WriteByte('_')
		}
	}

	return strings.Trim(out.String(), "_")
}

// Store puts every provider's key in /etc/pupitre/env under prefix and takes
// out the keys of the providers the form no longer names: a vendor withdrawn
// leaves nothing of itself behind. It says whether the file changed.
func Store(ctx sys.Context, prefix string, found []Provider) (bool, error) {
	changed := false
	kept := map[string]bool{}

	for _, entry := range found {
		kept[entry.EnvKey(prefix)] = true

		stored, err := env.Set(ctx, entry.EnvKey(prefix), entry.Key)
		if err != nil {
			return false, err
		}

		changed = changed || stored
	}

	keys, err := env.Keys(ctx)
	if err != nil {
		return false, err
	}

	for _, key := range keys {
		if !strings.HasPrefix(key, prefix) || kept[key] {
			continue
		}

		removed, err := env.Unset(ctx, key)
		if err != nil {
			return false, err
		}

		changed = changed || removed
	}

	return changed, nil
}

// WriteStep lays the rendered keys where the agent reads them, in a folder and a file that are owner's alone, and says whether they changed.
func WriteStep(ctx *modules.Context, content []byte, dir, path, owner string) (bool, error) {
	rewritten := false

	err := ctx.Step("write-providers", func() (modules.Outcome, error) {
		if file.Same(ctx, path, content) {
			return modules.Skipped, nil
		}

		rewritten = true

		if err := ctx.Sys().MkdirAll(dir, 0o700); err != nil {
			return modules.Failed, err
		}

		if err := file.Chown(ctx, dir, owner, owner); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, path, content, 0o600); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, path, owner, owner)
	})

	return rewritten, err
}

// StoreStep keeps the keys in /etc/pupitre/env under prefix, so the service page can reveal them.
func StoreStep(ctx *modules.Context, prefix string, found []Provider) error {
	return ctx.Step("store-providers", func() (modules.Outcome, error) {
		stored, err := Store(ctx, prefix, found)
		if err != nil {
			return modules.Failed, err
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// Render writes one KEY=value line per provider, under prefix, as an EnvironmentFile reads it.
func Render(found []Provider, prefix string) []byte {
	var out strings.Builder
	for _, entry := range found {
		out.WriteString(entry.EnvKey(prefix) + "=" + entry.Key + "\n")
	}

	return []byte(out.String())
}
