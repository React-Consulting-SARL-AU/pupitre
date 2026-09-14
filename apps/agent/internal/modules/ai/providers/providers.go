// Package providers reads the "vendor:key" entries a form composes for an agent that talks to model providers, and renders them as the environment the agent reads.
package providers

import (
	"sort"
	"strings"
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

// Render writes one KEY=value line per provider, under prefix, as an EnvironmentFile reads it.
func Render(found []Provider, prefix string) []byte {
	var out strings.Builder
	for _, entry := range found {
		out.WriteString(entry.EnvKey(prefix) + "=" + entry.Key + "\n")
	}

	return []byte(out.String())
}
