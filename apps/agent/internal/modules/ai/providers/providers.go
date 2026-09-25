package providers

import (
	"sort"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
)

const Shape = `^[A-Za-z0-9 ._-]+:.+$`

type Provider struct {
	Name string
	Key  string
}

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

// Also unsets the prefixed keys the form no longer names, so a withdrawn vendor leaves nothing behind.
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

// The service page reveals the keys from /etc/pupitre/env, not from the agent's own file.
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

func Render(found []Provider, prefix string) []byte {
	var out strings.Builder

	for _, entry := range found {
		out.WriteString(entry.EnvKey(prefix) + "=" + entry.Key + "\n")
	}

	return []byte(out.String())
}
