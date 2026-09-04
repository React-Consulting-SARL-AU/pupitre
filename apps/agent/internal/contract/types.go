package contract

import "encoding/json"

type Manifest struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"`
	Name      string    `json:"name"`
	Summary   string    `json:"summary"`
	Requires  []string  `json:"requires"`
	Conflicts []string  `json:"conflicts"`
	Resources Resources `json:"resources"`
	Arch      []string  `json:"arch"`
	Fields    []Field   `json:"fields"`
	Provides  []string  `json:"provides"`
	Mandatory bool      `json:"mandatory"`
	Since     string    `json:"since"`
}

type Resources struct {
	RAMMB  int `json:"ram_mb"`
	DiskMB int `json:"disk_mb"`
}

var Categories = []string{"core", "runtime", "database", "ai", "editor", "exposure", "tool"}

var Architectures = []string{"amd64", "arm64"}

const (
	FieldText    = "text"
	FieldNumber  = "number"
	FieldSelect  = "select"
	FieldSecret  = "secret"
	FieldVersion = "version"
	FieldBoolean = "boolean"
)

type Field struct {
	Key      string
	Kind     string
	Label    string
	Help     string
	Required bool
	Default  any
	Options  []string
	Generate bool
}

// The schema is a oneOf with additionalProperties:false per kind, so each kind serialises only its own keys.
func (f Field) MarshalJSON() ([]byte, error) {
	object := map[string]any{"key": f.Key, "kind": f.Kind, "label": f.Label}
	if f.Help != "" {
		object["help"] = f.Help
	}

	switch f.Kind {
	case FieldSecret:
		object["required"] = f.Required
		if f.Generate {
			object["generate"] = true
		}
	case FieldVersion:
		object["options"] = emptyIfNil(f.Options)
		object["default"] = f.Default
	default:
		object["required"] = f.Required
		if f.Default != nil {
			object["default"] = f.Default
		}
		if f.Options != nil {
			object["options"] = f.Options
		}
	}

	return json.Marshal(object)
}

func (f *Field) UnmarshalJSON(data []byte) error {
	var object struct {
		Key      string   `json:"key"`
		Kind     string   `json:"kind"`
		Label    string   `json:"label"`
		Help     string   `json:"help"`
		Required bool     `json:"required"`
		Default  any      `json:"default"`
		Options  []string `json:"options"`
		Generate bool     `json:"generate"`
	}

	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}

	*f = Field(object)

	return nil
}

func (m Manifest) MarshalJSON() ([]byte, error) {
	type plain Manifest

	normalized := plain(m)
	normalized.Requires = emptyIfNil(m.Requires)
	normalized.Conflicts = emptyIfNil(m.Conflicts)
	normalized.Arch = emptyIfNil(m.Arch)
	normalized.Provides = emptyIfNil(m.Provides)
	if normalized.Fields == nil {
		normalized.Fields = []Field{}
	}

	return json.Marshal(normalized)
}

type Preset struct {
	ID        string   `json:"id"`
	Modules   []string `json:"modules"`
	ChooseOne []string `json:"choose_one,omitempty"`
}

type Catalog struct {
	Modules []Manifest `json:"modules"`
	Presets []Preset   `json:"presets"`
}

func (c Catalog) MarshalJSON() ([]byte, error) {
	type plain Catalog

	normalized := plain(c)
	if normalized.Modules == nil {
		normalized.Modules = []Manifest{}
	}
	if normalized.Presets == nil {
		normalized.Presets = []Preset{}
	}

	return json.Marshal(normalized)
}

type StepStatus string

const (
	StepStart StepStatus = "start"
	StepOK    StepStatus = "ok"
	StepSkip  StepStatus = "skip"
	StepFail  StepStatus = "fail"
)

type StepEvent struct {
	Module string     `json:"module"`
	Step   string     `json:"step"`
	Status StepStatus `json:"status"`
	Ms     int64      `json:"ms"`
	Replay string     `json:"replay,omitempty"`
}

type InstallResult struct {
	Failed     []string `json:"failed"`
	Warned     []string `json:"warned"`
	ReportPath string   `json:"report_path"`
}

type UninstallResult struct {
	Failed []string `json:"failed"`
}

type ModuleStatus string

const (
	ModuleOK   ModuleStatus = "ok"
	ModuleSkip ModuleStatus = "skip"
	ModuleWarn ModuleStatus = "warn"
	ModuleFail ModuleStatus = "fail"
)

type ReportStep struct {
	Step    string     `json:"step"`
	Status  StepStatus `json:"status"`
	Ms      int64      `json:"ms"`
	Replay  string     `json:"replay,omitempty"`
	Message string     `json:"message,omitempty"`
}

type ModuleReport struct {
	ID     string       `json:"id"`
	Status ModuleStatus `json:"status"`
	Steps  []ReportStep `json:"steps"`
}

type Report struct {
	StartedAt    string         `json:"started_at"`
	FinishedAt   string         `json:"finished_at"`
	AgentVersion string         `json:"agent_version"`
	Modules      []ModuleReport `json:"modules"`
	Failed       []string       `json:"failed"`
	Warned       []string       `json:"warned"`
	ReportPath   string         `json:"report_path"`
}

func (r Report) MarshalJSON() ([]byte, error) {
	type plain Report

	normalized := plain(r)
	normalized.Failed = emptyIfNil(r.Failed)
	normalized.Warned = emptyIfNil(r.Warned)
	if normalized.Modules == nil {
		normalized.Modules = []ModuleReport{}
	}
	for i := range normalized.Modules {
		if normalized.Modules[i].Steps == nil {
			normalized.Modules[i].Steps = []ReportStep{}
		}
	}

	return json.Marshal(normalized)
}

type ServiceState string

const (
	ServiceRunning ServiceState = "running"
	ServiceStopped ServiceState = "stopped"
	ServiceFailed  ServiceState = "failed"
	ServiceUnknown ServiceState = "unknown"
)

type ServiceStatus struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	State       ServiceState      `json:"state"`
	Version     string            `json:"version,omitempty"`
	Port        int               `json:"port,omitempty"`
	Unit        string            `json:"unit,omitempty"`
	Credentials map[string]string `json:"credentials,omitempty"`
}

func emptyIfNil(values []string) []string {
	if values == nil {
		return []string{}
	}

	return values
}

func ToJSONValue(value any) (any, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}

	return Decode(encoded)
}

func ValidateValue(definition string, value any) error {
	decoded, err := ToJSONValue(value)
	if err != nil {
		return err
	}

	return Validate(definition, decoded)
}
