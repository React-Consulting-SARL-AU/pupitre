package contract

// BackupConstants is the format of a backup as packages/shared fixes it: the
// container, the key derivation, the identifiers and what an archive leaves out.
type BackupConstants struct {
	Format           int                `json:"format"`
	Container        BackupContainer    `json:"container"`
	KDF              BackupKDFConstants `json:"kdf"`
	IDPattern        string             `json:"id_pattern"`
	ExtraPathPattern string             `json:"extra_path_pattern"`
	DatabaseItem     string             `json:"database_item_pattern"`
	ProjectItem      string             `json:"project_item_pattern"`
	EndpointPattern  string             `json:"endpoint_pattern"`
	BucketPattern    string             `json:"bucket_pattern"`
	RegionPattern    string             `json:"region_pattern"`
	ExcludedDirs     []string           `json:"excluded_dirs"`
	HomePaths        []string           `json:"home_paths"`
	HomeExcluded     []string           `json:"home_excluded"`
}

type BackupContainer struct {
	Magic         string `json:"magic"`
	HeaderBytes   int    `json:"headerBytes"`
	ChunkBytes    int    `json:"chunkBytes"`
	MinChunkBytes int    `json:"minChunkBytes"`
	MaxChunkBytes int    `json:"maxChunkBytes"`
	TagBytes      int    `json:"tagBytes"`
	Info          string `json:"info"`
}

type BackupKDFConstants struct {
	Alg        string `json:"alg"`
	Iterations int    `json:"iterations"`
	SaltBytes  int    `json:"saltBytes"`
	KeyBytes   int    `json:"keyBytes"`
}

var Backup = constOf[BackupConstants]("Backup")

const (
	BackupTriggerSchedule = "schedule"
	BackupTriggerManual   = "manual"

	BackupPartSetup    = "setup"
	BackupPartHome     = "home"
	BackupPartDatabase = "database"
	BackupPartProject  = "project"
	BackupPartPath     = "path"

	BackupProjectsFull = "full"
	BackupProjectsEnv  = "env"
	BackupProjectsNone = "none"

	BackupDumpPgCustom     = "pg_custom"
	BackupDumpPgRoles      = "pg_roles"
	BackupDumpSQL          = "sql"
	BackupDumpMySQLUsers   = "mysql_users"
	BackupDumpMongoArchive = "mongo_archive"
	BackupDumpRDB          = "rdb"

	// BackupWholeServer names a database part that belongs to the whole engine: the Postgres roles, the Redis snapshot.
	BackupWholeServer = "*"

	BackupManifestKey = "manifest.json"
)

type BackupGitState struct {
	Repo   string `json:"repo"`
	Branch string `json:"branch"`
	Dirty  int    `json:"dirty"`
	Ahead  int    `json:"ahead"`
}

// BackupPart is one object of a backup; the fields a kind does not carry stay empty and are left out.
type BackupPart struct {
	Kind        string          `json:"kind"`
	Key         string          `json:"key"`
	Bytes       int64           `json:"bytes"`
	SHA256      string          `json:"sha256"`
	Fingerprint string          `json:"fingerprint,omitempty"`
	Engine      string          `json:"engine,omitempty"`
	Name        string          `json:"name,omitempty"`
	Format      string          `json:"format,omitempty"`
	Mode        string          `json:"mode,omitempty"`
	Git         *BackupGitState `json:"git,omitempty"`
	Path        string          `json:"path,omitempty"`
	Paths       []string        `json:"paths,omitempty"`
}

type BackupServer struct {
	ID             string `json:"id"`
	Hostname       string `json:"hostname"`
	Arch           string `json:"arch"`
	AgentVersion   string `json:"agent_version"`
	ConfigRevision int    `json:"config_revision"`
}

type BackupKDF struct {
	Alg        string `json:"alg"`
	Iterations int    `json:"iterations"`
	Salt       string `json:"salt"`
}

type BackupManifest struct {
	Format    int          `json:"format"`
	ID        string       `json:"id"`
	CreatedAt string       `json:"created_at"`
	Trigger   string       `json:"trigger"`
	Server    BackupServer `json:"server"`
	Recipient string       `json:"recipient"`
	KDF       BackupKDF    `json:"kdf"`
	Modules   []string     `json:"modules"`
	Running   []string     `json:"running"`
	Parts     []BackupPart `json:"parts"`
	Warnings  []string     `json:"warnings"`
	// Excluded is absent from a backup made before the settings could leave anything out.
	Excluded *BackupExcluded `json:"excluded,omitempty"`
}

// BackupExcluded names what the settings left out, as they name it: a project's name, `engine:name` or `redis:*` for a database.
type BackupExcluded struct {
	Projects  []string `json:"projects"`
	Databases []string `json:"databases"`
}

// DatabaseItem is how the settings name a database; `*` names the Redis snapshot.
func DatabaseItem(engine, name string) string {
	return engine + ":" + name
}

type BackupContentProject struct {
	Name     string `json:"name"`
	Repo     bool   `json:"repo"`
	Included bool   `json:"included"`
}

type BackupContentDatabase struct {
	Engine   string `json:"engine"`
	Name     string `json:"name"`
	Item     string `json:"item"`
	Included bool   `json:"included"`
}

type BackupContentsResult struct {
	Projects   []BackupContentProject  `json:"projects"`
	Databases  []BackupContentDatabase `json:"databases"`
	Unreadable []string                `json:"unreadable"`
}

type BackupLocation struct {
	Endpoint  string `json:"endpoint"`
	Region    string `json:"region"`
	Bucket    string `json:"bucket"`
	Key       string `json:"key"`
	PathStyle bool   `json:"path_style"`
	SHA256    string `json:"sha256,omitempty"`
}

type BackupCounts struct {
	Setup     bool `json:"setup"`
	Home      bool `json:"home"`
	Databases int  `json:"databases"`
	Projects  int  `json:"projects"`
	Paths     int  `json:"paths"`
}

type BackupDeclaration struct {
	ID             string         `json:"id"`
	CreatedAt      string         `json:"created_at"`
	Trigger        string         `json:"trigger"`
	Bytes          int64          `json:"bytes"`
	Counts         BackupCounts   `json:"counts"`
	ConfigRevision int            `json:"config_revision"`
	AgentVersion   string         `json:"agent_version"`
	Recipient      string         `json:"recipient"`
	KDFSalt        string         `json:"kdf_salt"`
	Location       BackupLocation `json:"location"`
}

type BackupBeat struct {
	IntervalHours int    `json:"interval_hours"`
	LastRunAt     string `json:"last_run_at,omitempty"`
	LastOKAt      string `json:"last_ok_at,omitempty"`
	LastError     string `json:"last_error,omitempty"`
	LastWarnings  int    `json:"last_warnings,omitempty"`
}

// BackupSecrets is the secret line of a command that reads a bucket; PrivateKey travels only for a restore.
type BackupSecrets struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	PrivateKey      string `json:"private_key,omitempty"`
}

type BackupLastRun struct {
	At       string   `json:"at"`
	OK       bool     `json:"ok"`
	ID       string   `json:"id,omitempty"`
	Bytes    int64    `json:"bytes,omitempty"`
	Error    string   `json:"error,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

type BackupStatusResult struct {
	Configured    bool           `json:"configured"`
	IntervalHours int            `json:"interval_hours"`
	Keep          int            `json:"keep"`
	NextRunAt     string         `json:"next_run_at,omitempty"`
	Running       bool           `json:"running"`
	Last          *BackupLastRun `json:"last,omitempty"`
}

type BackupRunResult struct {
	ID       string       `json:"id"`
	Key      string       `json:"key"`
	Bytes    int64        `json:"bytes"`
	Parts    []BackupPart `json:"parts"`
	Warnings []string     `json:"warnings"`
	Declared bool         `json:"declared"`
}

type BackupDeleteResult struct {
	Deleted bool `json:"deleted"`
}

type BackupRestoreSetupResult struct {
	ID       string       `json:"id"`
	Modules  []string     `json:"modules"`
	Defer    []string     `json:"defer"`
	Extra    []string     `json:"extra"`
	Projects []string     `json:"projects"`
	Dropped  []string     `json:"dropped"`
	Parts    []BackupPart `json:"parts"`
	Warnings []string     `json:"warnings"`
}

type BackupRestoreDataResult struct {
	Restored []string `json:"restored"`
	Failed   []string `json:"failed"`
	Started  []string `json:"started"`
	Warnings []string `json:"warnings"`
}

// CountsOf is the summary the platform keeps: how many of each, never a name.
func CountsOf(parts []BackupPart) BackupCounts {
	counts := BackupCounts{}

	for _, part := range parts {
		switch part.Kind {
		case BackupPartSetup:
			counts.Setup = true
		case BackupPartHome:
			counts.Home = true
		case BackupPartDatabase:
			counts.Databases++
		case BackupPartProject:
			counts.Projects++
		case BackupPartPath:
			counts.Paths++
		}
	}

	return counts
}
