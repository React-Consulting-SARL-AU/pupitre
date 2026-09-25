package contract

import "encoding/json"

var Presets = constOf[[]Preset]("Presets")

var MandatoryModules = constOf[[]string]("MandatoryModules")

func constOf[T any](name string) T {
	var exported struct {
		Const T `json:"const"`
	}

	unmarshalDefinition(name, &exported)

	return exported.Const
}

func Enum(name string) []string {
	var exported struct {
		Enum []string `json:"enum"`
	}

	unmarshalDefinition(name, &exported)

	if len(exported.Enum) == 0 {
		panic("contract: " + name + " definition has no enum")
	}

	return exported.Enum
}

func unmarshalDefinition(name string, into any) {
	raw, ok := Definition(name)
	if !ok {
		panic("contract: schema.json has no " + name + " definition")
	}

	if err := json.Unmarshal(raw, into); err != nil {
		panic("contract: " + name + " definition is unreadable: " + err.Error())
	}
}
