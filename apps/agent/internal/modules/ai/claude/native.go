package claude

import (
	"encoding/json"
	"fmt"
	"regexp"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/runtime/shell"
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

func installedVersion(ctx *modules.Context) string {
	if !file.Exists(ctx, BinPath) {
		return ""
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

func fetch(ctx *modules.Context, url string) (string, error) {
	out, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", url)

	return strings.TrimSpace(out), err
}

func latestVersion(ctx *modules.Context) (string, error) {
	version, err := fetch(ctx, releasesURL+"/latest")
	if err != nil {
		return "", err
	}

	if !versionShape.MatchString(version) {
		return "", fmt.Errorf("downloads.claude.ai answered %q instead of a version", version)
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
		return "", fmt.Errorf("manifest of Claude Code %s unreadable: %w", version, err)
	}

	checksum := strings.ToLower(parsed.Platforms[platform()].Checksum)
	if len(checksum) != 64 {
		return "", fmt.Errorf("no %s build of Claude Code %s in the manifest", platform(), version)
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
		return "", fmt.Errorf("sha256sum said nothing of %s", path)
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

	if _, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", path, url); err != nil {
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
		return fmt.Errorf("checksum of Claude Code %s differs from the manifest: %s", version, actual)
	}

	if _, err := user.Run(ctx, shell.User, "chmod", "0755", path); err != nil {
		return err
	}

	if _, err := user.Run(ctx, shell.User, path, "install"); err != nil {
		return err
	}

	if !file.Exists(ctx, BinPath) {
		return fmt.Errorf("%s missing after the install of Claude Code %s", BinPath, version)
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
