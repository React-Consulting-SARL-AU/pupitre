package keys

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"strings"
)

type Key struct {
	Options string
	Type    string
	Blob    string
	Comment string
}

var types = map[string]bool{
	"ssh-ed25519":                        true,
	"ssh-rsa":                            true,
	"ssh-dss":                            true,
	"ecdsa-sha2-nistp256":                true,
	"ecdsa-sha2-nistp384":                true,
	"ecdsa-sha2-nistp521":                true,
	"sk-ssh-ed25519@openssh.com":         true,
	"sk-ecdsa-sha2-nistp256@openssh.com": true,
}

func (k Key) Line() string {
	fields := []string{k.Type, k.Blob}
	if k.Options != "" {
		fields = append([]string{k.Options}, fields...)
	}
	if k.Comment != "" {
		fields = append(fields, k.Comment)
	}

	return strings.Join(fields, " ")
}

func (k Key) Restricted() bool {
	return strings.Contains(k.Options, "command=")
}

func ParseLine(line string) (Key, error) {
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return Key{}, errors.New("type et clé attendus")
	}

	key := Key{}
	if !types[fields[0]] {
		key.Options, line = splitOptions(strings.TrimSpace(line))
		fields = strings.Fields(line)
	}

	if len(fields) < 2 || !types[fields[0]] {
		return Key{}, errors.New("type de clé inconnu")
	}

	key.Type, key.Blob = fields[0], fields[1]
	key.Comment = strings.Join(fields[2:], " ")

	if !blobMatches(key.Type, key.Blob) {
		return Key{}, errors.New("clé illisible : le contenu ne correspond pas à son type")
	}

	return key, nil
}

// Options may quote spaces, as in command="echo hi": the split ends at the first unquoted blank.
func splitOptions(line string) (string, string) {
	quoted := false
	for i, r := range line {
		switch {
		case r == '"':
			quoted = !quoted
		case !quoted && (r == ' ' || r == '\t'):
			return line[:i], line[i:]
		}
	}

	return line, ""
}

func blobMatches(keyType, blob string) bool {
	raw, err := base64.StdEncoding.DecodeString(blob)
	if err != nil || len(raw) < 4 {
		return false
	}

	length := int(binary.BigEndian.Uint32(raw[:4]))
	if length != len(keyType) || len(raw) < 4+length {
		return false
	}

	return string(raw[4:4+length]) == keyType
}

type Parsed struct {
	Keys      []Key
	Malformed []int
}

func Parse(content []byte) Parsed {
	var parsed Parsed

	for i, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		key, err := ParseLine(trimmed)
		if err != nil {
			parsed.Malformed = append(parsed.Malformed, i+1)
			continue
		}

		parsed.Keys = append(parsed.Keys, key)
	}

	return parsed
}

func (p Parsed) Has(key Key) bool {
	for _, existing := range p.Keys {
		if existing.Type == key.Type && existing.Blob == key.Blob {
			return true
		}
	}

	return false
}
