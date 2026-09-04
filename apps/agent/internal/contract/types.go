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
	FieldList    = "list"

	ItemsText   = "text"
	ItemsSecret = "secret"
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
	Items    string
	Min      int
	Max      int
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
	case FieldList:
		object["required"] = f.Required
		object["items"] = f.Items
		if f.Min > 0 {
			object["min"] = f.Min
		}
		if f.Max > 0 {
			object["max"] = f.Max
		}
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
		Items    string   `json:"items"`
		Min      int      `json:"min"`
		Max      int      `json:"max"`
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
	Name      string   `json:"name"`
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

type ProjectState string

const (
	ProjectOnline   ProjectState = "online"
	ProjectStarting ProjectState = "starting"
	ProjectFailed   ProjectState = "failed"
	ProjectStopped  ProjectState = "stopped"
	ProjectDown     ProjectState = "down"
	ProjectExternal ProjectState = "external"
	ProjectService  ProjectState = "service"
)

var ProjectStates = []ProjectState{
	ProjectOnline,
	ProjectStarting,
	ProjectFailed,
	ProjectStopped,
	ProjectDown,
	ProjectExternal,
	ProjectService,
}

var PackageManagers = []string{"bun", "pnpm", "npm", "gradle", "uv", "service", "none"}

type Project struct {
	Name      string       `json:"name"`
	Dir       string       `json:"dir"`
	Path      string       `json:"path"`
	Repo      string       `json:"repo,omitempty"`
	PkgMgr    string       `json:"pkgmgr"`
	Host      string       `json:"host"`
	Port      int          `json:"port"`
	Subdomain string       `json:"subdomain,omitempty"`
	Cmd       string       `json:"cmd"`
	Install   string       `json:"install,omitempty"`
	State     ProjectState `json:"state"`
	URL       string       `json:"url,omitempty"`
	Branch    string       `json:"branch,omitempty"`
	PID       int          `json:"pid,omitempty"`
	RAMMB     int          `json:"ram_mb,omitempty"`
	UptimeS   int          `json:"uptime_s,omitempty"`
}

type ProjectStateEntry struct {
	Name  string       `json:"name"`
	State ProjectState `json:"state"`
	Port  int          `json:"port,omitempty"`
}

type ProjectActionResult struct {
	State    ProjectState        `json:"state"`
	Port     int                 `json:"port,omitempty"`
	Projects []ProjectStateEntry `json:"projects,omitempty"`
}

type Machine struct {
	Hostname     string     `json:"hostname"`
	OS           string     `json:"os"`
	Version      string     `json:"version"`
	Arch         string     `json:"arch"`
	Cores        int        `json:"cores"`
	UptimeS      int        `json:"uptime_s"`
	Load         [3]float64 `json:"load"`
	RAMTotalMB   int        `json:"ram_total_mb"`
	RAMUsedMB    int        `json:"ram_used_mb"`
	SwapMB       int        `json:"swap_mb"`
	DiskTotalGB  float64    `json:"disk_total_gb"`
	DiskFreeGB   float64    `json:"disk_free_gb"`
	AgentVersion string     `json:"agent_version"`
}

type Session struct {
	PID     int    `json:"pid"`
	Seconds int    `json:"seconds"`
	RAMMB   int    `json:"ram_mb"`
	Kind    string `json:"kind"`
	Project string `json:"project,omitempty"`
	Command string `json:"command"`
}

type Snapshot struct {
	Machine     Machine         `json:"machine"`
	Services    []ServiceStatus `json:"services"`
	Projects    []Project       `json:"projects"`
	Sessions    []Session       `json:"sessions"`
	Entitlement Entitlement     `json:"entitlement"`
}

type Status struct {
	Services []ServiceStatus `json:"services"`
	Projects []Project       `json:"projects"`
}

type Process struct {
	PID     int     `json:"pid"`
	CPU     float64 `json:"cpu"`
	RAMMB   int     `json:"ram_mb"`
	Command string  `json:"command"`
	Project string  `json:"project"`
}

type Shot struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt string `json:"created_at"`
}

type ProjectBranches struct {
	Repo    bool     `json:"repo"`
	Root    string   `json:"root"`
	Current string   `json:"current"`
	Dirty   bool     `json:"dirty"`
	Local   []string `json:"local"`
	Remote  []string `json:"remote"`
}

type ProjectCheckout struct {
	Branch string `json:"branch"`
}

type ProjectGitStatus struct {
	Repo     bool   `json:"repo"`
	Root     string `json:"root"`
	Current  string `json:"current"`
	Upstream string `json:"upstream"`
	Behind   int    `json:"behind"`
	Ahead    int    `json:"ahead"`
	Dirty    bool   `json:"dirty"`
	Changed  int    `json:"changed"`
	Last     int    `json:"last"`
	Subject  string `json:"subject"`
	Problem  string `json:"problem"`
}

type FileStage string

const (
	StageStaged    FileStage = "staged"
	StageUnstaged  FileStage = "unstaged"
	StageUntracked FileStage = "untracked"
)

type FileChange struct {
	Path    string    `json:"path"`
	Code    string    `json:"code"`
	Stage   FileStage `json:"stage"`
	Added   int       `json:"added"`
	Removed int       `json:"removed"`
	Binary  bool      `json:"binary"`
	From    string    `json:"from,omitempty"`
}

type ProjectWorkingTree struct {
	Repo     bool         `json:"repo"`
	Root     string       `json:"root"`
	Branch   string       `json:"branch"`
	Upstream string       `json:"upstream"`
	Ahead    int          `json:"ahead"`
	Behind   int          `json:"behind"`
	Files    []FileChange `json:"files"`
}

type ProjectDiff struct {
	Path    string `json:"path"`
	Patch   string `json:"patch"`
	Binary  bool   `json:"binary"`
	Problem string `json:"problem"`
}

type ProjectSync struct {
	Pulled    bool         `json:"pulled"`
	Installed bool         `json:"installed"`
	State     ProjectState `json:"state"`
}

type SubCommand struct {
	Name string     `json:"name"`
	Help string     `json:"help"`
	Args [][]string `json:"args"`
}

type Completions struct {
	Command  string       `json:"command"`
	Sub      []SubCommand `json:"sub"`
	Projects []string     `json:"projects"`
	Root     string       `json:"root"`
	Path     string       `json:"path"`
	Paths    []string     `json:"paths"`
}

type DoctorCheck struct {
	Name    string `json:"name"`
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
	Fix     string `json:"fix,omitempty"`
}

type Diag struct {
	GeneratedAt string `json:"generated_at"`
	Report      string `json:"report"`
}
