package hermes

import (
	"sort"
	"strings"
)

const envPrefix = "HERMES_"

type provider struct {
	name string
	key  string
}

// The vendor half of an entry names the environment key; the other half is the secret and never leaves this value.
func (p provider) envKey() string {
	return envPrefix + p.name + "_API_KEY"
}

func providers(entries []string) []provider {
	seen := map[string]provider{}

	for _, entry := range entries {
		name, key, found := strings.Cut(strings.TrimSpace(entry), ":")
		if !found {
			continue
		}

		name, key = normalize(name), strings.TrimSpace(key)
		if name == "" || key == "" {
			continue
		}

		seen[name] = provider{name: name, key: key}
	}

	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)

	found := make([]provider, 0, len(names))
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

func renderEnvironment(found []provider) []byte {
	var out strings.Builder
	for _, entry := range found {
		out.WriteString(entry.envKey() + "=" + entry.key + "\n")
	}

	return []byte(out.String())
}
