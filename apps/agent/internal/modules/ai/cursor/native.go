package cursor

import (
	"errors"
	"path"
	"regexp"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

// The version is read off the installer script, never run; with no checksum published, TLS alone vouches for the tarball.
const (
	installerURL = "https://cursor.com/install"
	downloadsURL = "https://downloads.cursor.com/lab"
	archiveName  = "agent-cli-package.tar.gz"

	binDir      = shell.Home + "/.local/bin"
	BinPath     = binDir + "/agent"
	LegacyPath  = binDir + "/" + Program
	versionsDir = shell.Home + "/.local/share/cursor-agent/versions"
)

var (
	versionShape = regexp.MustCompile(`^\d{4}\.\d{2}\.\d{2}-[0-9a-f]+$`)
	scriptedURL  = regexp.MustCompile(`downloads\.cursor\.com/lab/([^/"\s]+)/`)
)

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "arm64"
	}

	return "x64"
}

func versionDir(version string) string {
	return versionsDir + "/" + version
}

func binaryPath(version string) string {
	return versionDir(version) + "/" + Program
}

func archiveURL(version string) string {
	return downloadsURL + "/" + version + "/linux/" + platform() + "/" + archiveName
}

// Reading the version off the link costs nothing where starting the CLI costs a second.
func installedVersion(ctx *modules.Context) string {
	out, err := user.Run(ctx, shell.User, "readlink", LegacyPath)
	if err != nil {
		return ""
	}

	target := strings.TrimSpace(out)
	version := path.Base(path.Dir(target))
	if !versionShape.MatchString(version) || !file.Exists(ctx, target) {
		return ""
	}

	return version
}

func latestVersion(ctx *modules.Context) (string, error) {
	script, err := download.Text(ctx, installerURL)
	if err != nil {
		return "", err
	}

	match := scriptedURL.FindStringSubmatch(script)
	if match == nil || !versionShape.MatchString(match[1]) {
		return "", errors.New(i18n.T("modules.cursor.version_unreadable"))
	}

	return match[1], nil
}

func installVersion(ctx *modules.Context, version string) error {
	dir := versionDir(version)

	if err := file.MkdirOwned(ctx, dir, shell.User, shell.User, 0o755); err != nil {
		return err
	}

	staged, done, err := download.Fetch(ctx, Program+"-"+version+".tar.gz", archiveURL(version))
	if err != nil {
		return err
	}
	defer done()

	if err := download.Extract(ctx, staged, dir, 1, shell.User); err != nil {
		return err
	}

	if !file.Exists(ctx, binaryPath(version)) {
		return errors.New(i18n.T("modules.cursor.missing_after_install", version, dir))
	}

	return link(ctx, version)
}

func link(ctx *modules.Context, version string) error {
	if err := file.MkdirOwned(ctx, binDir, shell.User, shell.User, 0o755); err != nil {
		return err
	}

	for _, name := range []string{BinPath, LegacyPath} {
		if _, err := user.Run(ctx, shell.User, "ln", "-sfn", binaryPath(version), name); err != nil {
			return err
		}
	}

	return nil
}

func installCLI(ctx *modules.Context) error {
	return ctx.Step("install-cli", func() (modules.Outcome, error) {
		if installedVersion(ctx) != "" {
			return modules.Skipped, nil
		}

		version, err := latestVersion(ctx)
		if err != nil {
			return modules.Failed, err
		}

		return modules.Done, installVersion(ctx, version)
	})
}

// The previous version goes once the new one holds the links: never two copies of a 180 MB tool.
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

		if err := installVersion(ctx, latest); err != nil {
			return modules.Failed, err
		}

		_, err = user.Run(ctx, shell.User, "rm", "-rf", versionDir(installed))

		return modules.Done, err
	})
}

func removeCLI(ctx *modules.Context) error {
	return ctx.Step("remove-cli", func() (modules.Outcome, error) {
		if installedVersion(ctx) == "" && !file.Exists(ctx, versionsDir) {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, "rm", "-rf", BinPath, LegacyPath, path.Dir(versionsDir)); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}
