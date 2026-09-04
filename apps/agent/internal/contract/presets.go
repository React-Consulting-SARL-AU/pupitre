package contract

import "encoding/json"

var Presets = loadPresets()

var MandatoryModules = []string{"core.system", "core.hardening"}

func loadPresets() []Preset {
	raw, ok := Definition("Presets")
	if !ok {
		panic("contract: schema.json has no Presets definition")
	}

	var exported struct {
		Const []Preset `json:"const"`
	}
	if err := json.Unmarshal(raw, &exported); err != nil {
		panic("contract: Presets definition is unreadable: " + err.Error())
	}

	return exported.Const
}
