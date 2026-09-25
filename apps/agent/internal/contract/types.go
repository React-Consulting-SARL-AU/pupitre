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
	// Connection names the third-party account the app must hold for this module; only such a module may carry a managed field.
	Connection string `json:"connection,omitempty"`
	// Runs says whether the module holds a process on the machine, or spawns one at any moment; a language or a CLI leaves nothing to watch.
	Runs      bool   `json:"runs"`
	Mandatory bool   `json:"mandatory"`
	Since     string `json:"since"`
}

type Resources struct {
	RAMMB  int `json:"ram_mb"`
	DiskMB int `json:"disk_mb"`
}

var Categories = []string{"core", "runtime", "database", "ai", "editor", "exposure", "tool"}

var Architectures = []string{"amd64", "arm64"}

const (
	ConnectionCloudflare  = "cloudflare"
	ConnectionWrangler    = "wrangler"
	ConnectionGitHub      = "github"
	ConnectionOnePassword = "1password"
	ConnectionNeon        = "neon"
	ConnectionVercel      = "vercel"
	ConnectionSupabase    = "supabase"
	ConnectionStripe      = "stripe"
	ConnectionBackup      = "backup"
)

var Connections = []string{ConnectionCloudflare, ConnectionWrangler, ConnectionGitHub, ConnectionOnePassword, ConnectionNeon, ConnectionVercel, ConnectionSupabase, ConnectionStripe, ConnectionBackup}

const (
	// PatternVersionOrLatest holds an editor's free version field: `latest`, or a version the client reads off their own client.
	PatternVersionOrLatest = `^(latest|[0-9]+\.[0-9]+(\.[0-9]+)?)$`

	// PatternExtensionID holds a marketplace identifier, publisher and name.
	PatternExtensionID = `^[A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9][A-Za-z0-9._-]*$`
)

const (
	FormatPort       = "port"
	FormatHostname   = "hostname"
	FormatDomain     = "domain"
	FormatEmail      = "email"
	FormatIdentifier = "identifier"
	FormatPath       = "path"
	FormatTimezone   = "timezone"
	FormatSize       = "size"
	FormatURL        = "url"
)

const (
	FieldText     = "text"
	FieldNumber   = "number"
	FieldSelect   = "select"
	FieldSecret   = "secret"
	FieldVersion  = "version"
	FieldVersions = "versions"
	FieldBoolean  = "boolean"
	FieldList     = "list"

	ItemsText   = "text"
	ItemsSecret = "secret"
)

// Hint is the long form of Help, shown behind a bubble: where a value is found, and the page that issues it.
type Hint struct {
	Text string `json:"text"`
	URL  string `json:"url,omitempty"`
}

type Field struct {
	Key       string
	Kind      string
	Label     string
	Help      string
	HintText  string
	HintURL   string
	Format    string
	Pattern   string
	MinLength int
	MaxLength int
	Required  bool
	Default   any
	Options   []string
	Generate  bool
	Items     string
	Min       int
	Max       int
	Managed   bool
}

// The schema is a oneOf with additionalProperties:false per kind, so each kind serialises only its own keys.
func (f Field) MarshalJSON() ([]byte, error) {
	object := map[string]any{"key": f.Key, "kind": f.Kind, "label": f.Label}
	if f.Help != "" {
		object["help"] = f.Help
	}
	if f.HintText != "" {
		hint := map[string]any{"text": f.HintText}
		if f.HintURL != "" {
			hint["url"] = f.HintURL
		}
		object["hint"] = hint
	}
	if f.Format != "" {
		object["format"] = f.Format
	}
	if f.Pattern != "" {
		object["pattern"] = f.Pattern
	}
	if f.MinLength > 0 {
		object["min_length"] = f.MinLength
	}
	if f.MaxLength > 0 {
		object["max_length"] = f.MaxLength
	}
	if f.Managed {
		object["managed"] = true
	}

	switch f.Kind {
	case FieldSecret:
		object["required"] = f.Required
		if f.Generate {
			object["generate"] = true
		}
	case FieldVersion, FieldVersions:
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
		if f.Min != 0 {
			object["min"] = f.Min
		}
		if f.Max != 0 {
			object["max"] = f.Max
		}
	}

	return json.Marshal(object)
}

func (f *Field) UnmarshalJSON(data []byte) error {
	var object struct {
		Key       string   `json:"key"`
		Kind      string   `json:"kind"`
		Label     string   `json:"label"`
		Help      string   `json:"help"`
		Hint      *Hint    `json:"hint"`
		Format    string   `json:"format"`
		Pattern   string   `json:"pattern"`
		MinLength int      `json:"min_length"`
		MaxLength int      `json:"max_length"`
		Required  bool     `json:"required"`
		Default   any      `json:"default"`
		Options   []string `json:"options"`
		Generate  bool     `json:"generate"`
		Items     string   `json:"items"`
		Min       int      `json:"min"`
		Max       int      `json:"max"`
		Managed   bool     `json:"managed"`
	}

	if err := json.Unmarshal(data, &object); err != nil {
		return err
	}

	*f = Field{
		Key:       object.Key,
		Kind:      object.Kind,
		Label:     object.Label,
		Help:      object.Help,
		Format:    object.Format,
		Pattern:   object.Pattern,
		MinLength: object.MinLength,
		MaxLength: object.MaxLength,
		Required:  object.Required,
		Default:   object.Default,
		Options:   object.Options,
		Generate:  object.Generate,
		Items:     object.Items,
		Min:       object.Min,
		Max:       object.Max,
		Managed:   object.Managed,
	}

	if object.Hint != nil {
		f.HintText = object.Hint.Text
		f.HintURL = object.Hint.URL
	}

	return nil
}

func (m Manifest) MarshalJSON() ([]byte, error) {
	type plain Manifest

	normalized := plain(m)
	normalized.Requires = emptyIfNil(m.Requires)
	normalized.Conflicts = emptyIfNil(m.Conflicts)
	normalized.Arch = emptyIfNil(m.Arch)
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
	Module  string     `json:"module"`
	Step    string     `json:"step"`
	Status  StepStatus `json:"status"`
	Ms      int64      `json:"ms"`
	Replay  string     `json:"replay,omitempty"`
	Message string     `json:"message,omitempty"`
}

// ModuleConfig is what the agent kept from the last request for a module: plain values, and the names of the secrets it holds — never their value.
type ModuleConfig struct {
	ID      string         `json:"id"`
	Values  map[string]any `json:"values"`
	Secrets []string       `json:"secrets"`
}

func (c ModuleConfig) MarshalJSON() ([]byte, error) {
	type plain ModuleConfig

	normalized := plain(c)
	if normalized.Values == nil {
		normalized.Values = map[string]any{}
	}
	normalized.Secrets = emptyIfNil(c.Secrets)

	return json.Marshal(normalized)
}

// InstallCheck is the same request as install, weighed and not run: what the fields get wrong, and what only the machine knows.
type InstallCheck struct {
	Problems []FieldProblem `json:"problems"`
	Warnings []string       `json:"warnings"`
}

func (c InstallCheck) MarshalJSON() ([]byte, error) {
	type plain InstallCheck

	normalized := plain(c)
	if normalized.Problems == nil {
		normalized.Problems = []FieldProblem{}
	}
	if normalized.Warnings == nil {
		normalized.Warnings = []string{}
	}

	return json.Marshal(normalized)
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

type LoginState string

const (
	LoginSignedIn  LoginState = "signed_in"
	LoginSignedOut LoginState = "signed_out"
	LoginUnknown   LoginState = "unknown"
)

// Login is what the CLI a module installs says of its own account: asked of the CLI, on service.status alone.
type Login struct {
	State   LoginState `json:"state"`
	Account string     `json:"account,omitempty"`
	Fix     string     `json:"fix,omitempty"`
}

type ServiceStatus struct {
	ID    string       `json:"id"`
	Name  string       `json:"name"`
	State ServiceState `json:"state"`
	// Configured says whether the module has been through its own settings: a
	// module the client asked to answer later sits installed and unconfigured.
	Configured bool `json:"configured"`
	// Runs and Connection carry the manifest's own answers, so that a screen showing what the machine is doing never has to read the catalogue.
	Runs       bool     `json:"runs"`
	Connection string   `json:"connection,omitempty"`
	Version    string   `json:"version,omitempty"`
	Versions   []string `json:"versions,omitempty"`
	Port       int      `json:"port,omitempty"`
	Unit       string   `json:"unit,omitempty"`
	// Path is the absolute folder the module laid when the reader's side has to be pointed at it: the backend JetBrains Gateway opens.
	Path        string            `json:"path,omitempty"`
	Credentials map[string]string `json:"credentials,omitempty"`
	Login       *Login            `json:"login,omitempty"`
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

type ProcessState string

const (
	ProcessOnline   ProcessState = "online"
	ProcessStarting ProcessState = "starting"
	ProcessFailed   ProcessState = "failed"
	ProcessStopped  ProcessState = "stopped"
	ProcessDown     ProcessState = "down"
	ProcessExternal ProcessState = "external"
	ProcessService  ProcessState = "service"
)

var ProcessStates = []ProcessState{
	ProcessOnline,
	ProcessStarting,
	ProcessFailed,
	ProcessStopped,
	ProcessDown,
	ProcessExternal,
	ProcessService,
}

// A project's state is read off its processes; partial is the one state a process never has by itself.
type ProjectState string

const (
	ProjectOnline   ProjectState = "online"
	ProjectStarting ProjectState = "starting"
	ProjectFailed   ProjectState = "failed"
	ProjectStopped  ProjectState = "stopped"
	ProjectDown     ProjectState = "down"
	ProjectExternal ProjectState = "external"
	ProjectService  ProjectState = "service"
	ProjectPartial  ProjectState = "partial"
)

var ProjectStates = []ProjectState{
	ProjectOnline,
	ProjectStarting,
	ProjectFailed,
	ProjectStopped,
	ProjectDown,
	ProjectExternal,
	ProjectService,
	ProjectPartial,
}

var PackageManagers = []string{"bun", "pnpm", "npm", "gradle", "uv", "service", "none"}

// A Route is one port a process listens on, and the whole name it answers to on the web when it has one.
type Route struct {
	Label    string `json:"label"`
	Port     int    `json:"port"`
	Hostname string `json:"hostname,omitempty"`
}

// A ProjectProcess is what runs in a project: one command, from one folder of it, on one main port.
type ProjectProcess struct {
	ID      string       `json:"id"`
	Dir     string       `json:"dir"`
	Path    string       `json:"path"`
	PkgMgr  string       `json:"pkgmgr"`
	Host    string       `json:"host"`
	Port    int          `json:"port"`
	Routes  []Route      `json:"routes"`
	Cmd     string       `json:"cmd"`
	Install string       `json:"install,omitempty"`
	State   ProcessState `json:"state"`
	URL     string       `json:"url,omitempty"`
	PID     int          `json:"pid,omitempty"`
	RAMMB   int          `json:"ram_mb,omitempty"`
	UptimeS int          `json:"uptime_s,omitempty"`
}

type Project struct {
	Name      string            `json:"name"`
	Dir       string            `json:"dir"`
	Path      string            `json:"path"`
	Repo      string            `json:"repo,omitempty"`
	Branch    string            `json:"branch,omitempty"`
	Processes []ProjectProcess  `json:"processes"`
	State     ProjectState      `json:"state"`
	URL       string            `json:"url,omitempty"`
	Boot      bool              `json:"boot"`
	Runtimes  map[string]string `json:"runtimes"`
}

type DetectedRoute struct {
	Label string `json:"label"`
	Port  int    `json:"port"`
}

// What one folder of a repository asks for: the root, or a folder of the first level that carries its own manifest.
type DetectedProcess struct {
	ID       string          `json:"id"`
	Dir      string          `json:"dir"`
	PkgMgr   string          `json:"pkgmgr"`
	Install  string          `json:"install,omitempty"`
	Cmd      string          `json:"cmd,omitempty"`
	PortHint int             `json:"port_hint,omitempty"`
	HostHint string          `json:"host_hint,omitempty"`
	Routes   []DetectedRoute `json:"routes,omitempty"`
}

type ProjectDetect struct {
	Processes []DetectedProcess `json:"processes"`
}

type ProjectStateEntry struct {
	Name  string       `json:"name"`
	State ProjectState `json:"state"`
}

type ProjectActionResult struct {
	State    ProjectState        `json:"state"`
	Projects []ProjectStateEntry `json:"projects,omitempty"`
}

type ProcessInstall struct {
	Process string `json:"process"`
	Command string `json:"command"`
}

type ProjectInstall struct {
	Done      bool             `json:"done"`
	Installed []ProcessInstall `json:"installed"`
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
	Sudo         SudoState  `json:"sudo,omitempty"`
}

type SudoState string

const (
	SudoPassword    SudoState = "password"
	SudoNopasswdAll SudoState = "nopasswd_all"
)

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

const (
	FileKindFile    = "file"
	FileKindDir     = "dir"
	FileKindLink    = "link"
	FileKindSpecial = "special"
)

// The permission bits as an octal string, `0644`: a number would read as decimal on both sides of the channel.
type FileEntry struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	SizeBytes  int64  `json:"size_bytes"`
	ModifiedAt string `json:"modified_at"`
	Mode       string `json:"mode"`
}

type FileList struct {
	Path      string      `json:"path"`
	Entries   []FileEntry `json:"entries"`
	Truncated bool        `json:"truncated"`
}

type FileStat struct {
	Path       string `json:"path"`
	Kind       string `json:"kind"`
	SizeBytes  int64  `json:"size_bytes"`
	ModifiedAt string `json:"modified_at"`
	Mode       string `json:"mode"`
	MediaType  string `json:"media_type,omitempty"`
	SHA256     string `json:"sha256,omitempty"`
}

type FileRead struct {
	Path      string `json:"path"`
	MediaType string `json:"media_type"`
	SizeBytes int64  `json:"size_bytes"`
	SHA256    string `json:"sha256"`
	Chunks    int    `json:"chunks"`
}

type FileWritten struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"size_bytes"`
	SHA256    string `json:"sha256"`
}

type FilePath struct {
	Path string `json:"path"`
}

type FileRemoved struct {
	Path    string `json:"path"`
	Removed int    `json:"removed"`
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

type ProjectDebug struct {
	State     ProcessState `json:"state"`
	Port      int          `json:"port"`
	DebugPort int          `json:"debug_port"`
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

const (
	RemedyPortTaken     = "port_taken"
	RemedyInvalidFields = "invalid_fields"
)

// The machine-readable half of a fix: what to do next as a value, so the app never reads a number out of a sentence.
type Remedy struct {
	Code     string         `json:"code"`
	PortFree int            `json:"port_free,omitempty"`
	Problems []FieldProblem `json:"problems,omitempty"`
}

func PortTaken(free int) *Remedy {
	return &Remedy{Code: RemedyPortTaken, PortFree: free}
}

// InvalidFields carries what the configuration got wrong, field by field, so the screen marks them instead of printing a sentence.
func InvalidFields(problems []FieldProblem) *Remedy {
	return &Remedy{Code: RemedyInvalidFields, Problems: problems}
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

type ProjectPull struct {
	Pulled bool         `json:"pulled"`
	State  ProjectState `json:"state"`
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

// ConfigState says where the configuration on a machine stands against the
// binary reading it. `pending` is a machine whose migrations have not run yet,
// `failed` one whose configuration was put back as it was because a migration
// refused, `ahead` one configured by a newer agent than the one now running.
type ConfigState string

const (
	ConfigCurrent ConfigState = "current"
	ConfigPending ConfigState = "pending"
	ConfigFailed  ConfigState = "failed"
	ConfigAhead   ConfigState = "ahead"
)

type ConfigRevision struct {
	Revision int         `json:"revision"`
	Expected int         `json:"expected"`
	State    ConfigState `json:"state"`
}

func (c ConfigRevision) Current() bool {
	return c.State == ConfigCurrent
}
