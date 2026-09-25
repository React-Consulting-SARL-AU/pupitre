package claude

import (
	"encoding/json"
	"errors"
	"path"
	"regexp"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

// Claude Code ships as one native binary per platform, published next to a
// manifest of checksums. That is the path Anthropic's own installer takes, and
// the only one that works here: the npm package finishes its install in a
// postinstall script, and mise never runs those.
const (
	releasesURL  = "https://downloads.claude.ai/claude-code-releases"
	downloadsDir = agents.Home + "/.claude/downloads"
	BinPath      = shell.Home + "/.local/bin/" + Program
	versionsDir  = shell.Home + "/.local/share/claude"
)

var versionShape = regexp.MustCompile(`^\d+\.\d+\.\d+(-\S+)?$`)

type releaseManifest struct {
	Platforms map[string]struct {
		Checksum string `json:"checksum"`
	} `json:"platforms"`
}

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "linux-arm64"
	}

	return "linux-x64"
}

// The installer leaves ~/.local/bin/claude as a link into the versions
// directory, named after the version it points to: reading the link costs a
// millisecond where starting the CLI costs a second, and a snapshot asks every
// few seconds. A binary that is not such a link is asked itself.
func installedVersion(ctx *modules.Context) string {
	if !file.Exists(ctx, BinPath) {
		return ""
	}

	if version := linkedVersion(ctx); version != "" {
		return version
	}

	out, err := user.Run(ctx, shell.User, Program, "--version")
	if err != nil {
		return ""
	}

	fields := strings.Fields(out)
	if len(fields) == 0 {
		return ""
	}

	return fields[0]
}

func linkedVersion(ctx *modules.Context) string {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"readlink", BinPath}})
	if err != nil {
		return ""
	}

	version := path.Base(strings.TrimSpace(out.Stdout))
	if !versionShape.MatchString(version) {
		return ""
	}

	return version
}

func fetch(ctx *modules.Context, url string) (string, error) {
	out, err := user.Run(ctx, shell.User, sys.CurlText(url)...)

	return strings.TrimSpace(out), err
}

func latestVersion(ctx *modules.Context) (string, error) {
	version, err := fetch(ctx, releasesURL+"/latest")
	if err != nil {
		return "", err
	}

	if !versionShape.MatchString(version) {
		return "", errors.New(i18n.T("modules.claude.version_unreadable", version))
	}

	return version, nil
}

func expectedChecksum(ctx *modules.Context, version string) (string, error) {
	raw, err := fetch(ctx, releasesURL+"/"+version+"/manifest.json")
	if err != nil {
		return "", err
	}

	var parsed releaseManifest
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return "", errors.New(i18n.T("modules.claude.manifest_unreadable", version, err.Error()))
	}

	checksum := strings.ToLower(parsed.Platforms[platform()].Checksum)
	if len(checksum) != 64 {
		return "", errors.New(i18n.T("modules.claude.build_missing", platform(), version))
	}

	return checksum, nil
}

func checksumOf(ctx *modules.Context, path string) (string, error) {
	out, err := user.Run(ctx, shell.User, "sha256sum", path)
	if err != nil {
		return "", err
	}

	fields := strings.Fields(out)
	if len(fields) == 0 {
		return "", errors.New(i18n.T("modules.download.checksum_missing", path))
	}

	return strings.ToLower(fields[0]), nil
}

// installVersion downloads the binary, refuses it unless its checksum is the
// one the manifest announces, then lets it lay itself down under ~/.local.
func installVersion(ctx *modules.Context, version string) error {
	checksum, err := expectedChecksum(ctx, version)
	if err != nil {
		return err
	}

	if err := file.MkdirOwned(ctx, downloadsDir, shell.User, shell.User, 0o755); err != nil {
		return err
	}

	path := downloadsDir + "/" + Program + "-" + version + "-" + platform()
	url := releasesURL + "/" + version + "/" + platform() + "/" + Program

	if _, err := user.Run(ctx, shell.User, sys.CurlFile(path, url)...); err != nil {
		return err
	}

	defer func() {
		_, _ = user.Run(ctx, shell.User, "rm", "-f", path)
	}()

	actual, err := checksumOf(ctx, path)
	if err != nil {
		return err
	}

	if actual != checksum {
		return errors.New(i18n.T("modules.claude.checksum_mismatch", version, actual))
	}

	if _, err := user.Run(ctx, shell.User, "chmod", "0755", path); err != nil {
		return err
	}

	if _, err := user.Run(ctx, shell.User, path, "install"); err != nil {
		return err
	}

	if !file.Exists(ctx, BinPath) {
		return errors.New(i18n.T("modules.claude.missing_after_install", BinPath, version))
	}

	return nil
}

func installCLI(ctx *modules.Context) error {
	return ctx.Step("install-cli", func() (modules.Outcome, error) {
		if file.Exists(ctx, BinPath) {
			return modules.Skipped, nil
		}

		version, err := latestVersion(ctx)
		if err != nil {
			return modules.Failed, err
		}

		return modules.Done, installVersion(ctx, version)
	})
}

func upgradeCLI(ctx *modules.Context) error {
	return ctx.Step("upgrade-cli", func() (modules.Outcome, error) {
		installed := installedVersion(ctx)
		if installed == "" {
			return modules.Skipped, nil
		}

		latest, err := latestVersion(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if latest == installed {
			return modules.Skipped, nil
		}

		return modules.Done, installVersion(ctx, latest)
	})
}

// The conversations and the credentials under ~/.claude stay; the binary and the versions it keeps go.
func removeCLI(ctx *modules.Context) error {
	return ctx.Step("remove-cli", func() (modules.Outcome, error) {
		if !file.Exists(ctx, BinPath) && !file.Exists(ctx, versionsDir) {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, "rm", "-rf", BinPath, versionsDir); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}
