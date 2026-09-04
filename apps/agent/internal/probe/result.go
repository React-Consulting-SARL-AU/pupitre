package probe

import (
	"bytes"
	"encoding/json"
)

type Port struct {
	Port    int    `json:"port"`
	Process string `json:"process,omitempty"`
}

// A JSON number with one decimal: probe.sh and the Go probe format gigabytes identically, byte for byte.
type Decimal string

func (d Decimal) MarshalJSON() ([]byte, error) {
	if d == "" {
		return []byte("0.0"), nil
	}

	return []byte(d), nil
}

func (d *Decimal) UnmarshalJSON(raw []byte) error {
	*d = Decimal(bytes.Trim(raw, `"`))

	return nil
}

type Result struct {
	OS               string   `json:"os"`
	Version          string   `json:"version"`
	Arch             string   `json:"arch"`
	RAMMB            int      `json:"ram_mb"`
	DiskFreeGB       Decimal  `json:"disk_free_gb"`
	Sudo             bool     `json:"sudo"`
	Ports            []Port   `json:"ports"`
	Docker           bool     `json:"docker"`
	Panel            *string  `json:"panel"`
	AgentVersion     *string  `json:"agent_version"`
	InstalledModules []string `json:"installed_modules"`
	Verdict          Verdict  `json:"verdict"`
}

func (r Result) JSON() ([]byte, error) {
	var out bytes.Buffer

	encoder := json.NewEncoder(&out)
	encoder.SetEscapeHTML(false)

	if err := encoder.Encode(r); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}

func optional(value string) *string {
	if value == "" {
		return nil
	}

	return &value
}
