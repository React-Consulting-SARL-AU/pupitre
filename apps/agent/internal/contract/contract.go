package contract

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed schema.json
var raw []byte

var spec = load()

var ProtocolVersion = spec.Protocol

type schemaDocument struct {
	Protocol int                        `json:"protocol"`
	Defs     map[string]json.RawMessage `json:"$defs"`
}

func load() schemaDocument {
	var doc schemaDocument
	if err := json.Unmarshal(raw, &doc); err != nil {
		panic("contract: schema.json is not valid JSON: " + err.Error())
	}

	return doc
}

func Definition(name string) (json.RawMessage, bool) {
	def, ok := spec.Defs[name]

	return def, ok
}

func ParamsDefinition(cmd string) string {
	return definitionName(cmd) + "Params"
}

func definitionName(cmd string) string {
	parts := strings.FieldsFunc(cmd, func(r rune) bool { return r == '.' || r == '_' })

	var name strings.Builder
	for _, part := range parts {
		name.WriteString(strings.ToUpper(part[:1]))
		name.WriteString(part[1:])
	}

	return name.String()
}
