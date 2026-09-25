package backup

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/s3"
)

const probeTimeout = 30 * time.Second

type Settings struct {
	Endpoint        string
	Region          string
	Bucket          string
	Prefix          string
	PathStyle       bool
	AccessKeyID     string
	SecretAccessKey string
	Recipient       string
	Salt            string
	IntervalHours   int
	Hour            int
	Keep            int
	Databases       bool
	Home            bool
	Projects        string
	ExtraPaths      []string
	// Exclusions by name, so a project or database created later is backed up by default.
	ExcludeProjects  []string
	ExcludeDatabases []string
}

func (s Settings) LeavesOutProject(name string) bool {
	return slices.Contains(s.ExcludeProjects, name)
}

// item is `engine:name`, or `redis:*` for the Redis snapshot.
func (s Settings) LeavesOutDatabase(item string) bool {
	return slices.Contains(s.ExcludeDatabases, item)
}

func Read(ctx *modules.Context) Settings {
	settings := Settings{
		Endpoint:         strings.TrimSpace(ctx.String("endpoint")),
		Region:           strings.TrimSpace(ctx.String("region")),
		Bucket:           strings.TrimSpace(ctx.String("bucket")),
		Prefix:           strings.Trim(strings.TrimSpace(ctx.String("prefix")), "/"),
		PathStyle:        ctx.Bool("path_style"),
		AccessKeyID:      strings.TrimSpace(ctx.String("access_key_id")),
		SecretAccessKey:  ctx.Secret("secret_access_key"),
		Recipient:        strings.TrimSpace(ctx.String("recipient")),
		Salt:             strings.TrimSpace(ctx.String("kdf_salt")),
		IntervalHours:    within(ctx.Int("interval_hours"), 0, MaxInterval, DefaultInterval),
		Hour:             within(ctx.Int("hour"), 0, lastHour, DefaultHour),
		Keep:             within(ctx.Int("keep"), 1, MaxKeep, DefaultKeep),
		Databases:        ctx.Bool("databases"),
		Home:             ctx.Bool("home"),
		Projects:         projectsMode(ctx.Bool("projects"), ctx.Bool("projects_env_only")),
		ExtraPaths:       ctx.StringList("extra_paths"),
		ExcludeProjects:  ctx.StringList("exclude_projects"),
		ExcludeDatabases: ctx.StringList("exclude_databases"),
	}

	if settings.Region == "" {
		settings.Region = DefaultRegion
	}

	if settings.Prefix == "" {
		settings.Prefix = DefaultPrefix
	}

	return settings
}

func projectsMode(carried, envOnly bool) string {
	switch {
	case !carried:
		return ProjectsNone
	case envOnly:
		return ProjectsEnv
	}

	return ProjectsFull
}

func within(value, least, most, fallback int) int {
	if value < least || value > most {
		return fallback
	}

	return value
}

func (s Settings) Configured() bool {
	return Addressable(s.Endpoint, s.Bucket, s.Region) && s.AccessKeyID != "" && s.SecretAccessKey != "" && s.Recipient != "" && s.Salt != ""
}

var (
	endpointPattern = regexp.MustCompile(contract.Backup.EndpointPattern)
	bucketPattern   = regexp.MustCompile(contract.Backup.BucketPattern)
	regionPattern   = regexp.MustCompile(contract.Backup.RegionPattern)
)

// Rechecked here so a hand-edited install.json cannot aim backups at a non-HTTPS endpoint.
func Addressable(endpoint, bucket, region string) bool {
	return endpointPattern.MatchString(endpoint) && bucketPattern.MatchString(bucket) && regionPattern.MatchString(region)
}

func (s Settings) Client() s3.Client {
	return s3.Client{
		Endpoint:        s.Endpoint,
		Region:          s.Region,
		Bucket:          s.Bucket,
		AccessKeyID:     s.AccessKeyID,
		SecretAccessKey: s.SecretAccessKey,
		PathStyle:       s.PathStyle,
	}
}

func (s Settings) ServerPrefix(serverID string) string {
	return s.Prefix + "/" + serverID + "/"
}

func Probe(ctx context.Context, client s3.Client, prefix string) error {
	bounded, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	if err := client.HeadBucket(bounded); err != nil {
		return err
	}

	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		return err
	}

	key := prefix + ".probe-" + hex.EncodeToString(suffix)
	if err := client.Put(bounded, key, []byte("pupitre"), "text/plain"); err != nil {
		return err
	}

	return client.Delete(bounded, key)
}

func probePrefix(ctx *modules.Context, settings Settings) string {
	if id := platform.LoadServerID(ctx.Sys(), ""); id != "" {
		return settings.ServerPrefix(id)
	}

	return settings.Prefix + "/"
}

func Refusal(err error) (string, string) {
	var failure *s3.Error
	detail := err.Error()

	if errors.As(err, &failure) && failure.Message != "" {
		detail = failure.Code + " : " + failure.Message
	}

	switch s3.KindOf(err) {
	case s3.KindUnreachable:
		return i18n.T("backup.storage.unreachable", detail), i18n.T("backup.storage.unreachable.fix")
	case s3.KindNoBucket:
		return i18n.T("backup.storage.bucket"), i18n.T("backup.storage.bucket.fix")
	case s3.KindDenied:
		return i18n.T("backup.storage.denied", detail), i18n.T("backup.storage.denied.fix")
	case s3.KindBadKey:
		return i18n.T("backup.storage.key"), i18n.T("backup.storage.key.fix")
	case s3.KindBadSecret:
		return i18n.T("backup.storage.secret"), i18n.T("backup.storage.secret.fix")
	case s3.KindSkewed:
		return i18n.T("backup.storage.skewed"), i18n.T("backup.storage.skewed.fix")
	case s3.KindWrongRegion:
		return i18n.T("backup.storage.region", regionOf(failure)), i18n.T("backup.storage.region.fix")
	}

	return i18n.T("backup.storage.other", detail), i18n.T("backup.storage.other.fix")
}

func regionOf(failure *s3.Error) string {
	if failure == nil || failure.Region == "" {
		return "?"
	}

	return failure.Region
}

func StorageRefused(err error) error {
	message, fix := Refusal(err)

	return protocol.NewError(contract.ErrorStorageRefused, message).WithFix(fix)
}
