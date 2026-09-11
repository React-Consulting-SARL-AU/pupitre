package mise

import (
	"errors"
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

const (
	BinDir   = shell.Home + "/.local/bin"
	Path     = BinDir + "/mise"
	DataDir  = shell.Home + "/.local/share/mise"
	ShimsDir = DataDir + "/shims"

	Latest = "latest"

	program     = "mise"
	versionURL  = "https://mise.jdx.dev/VERSION"
	releasesURL = "https://github.com/jdx/mise/releases/download/v"
	sumsName    = "SHASUMS256.txt"
)

var versionShape = regexp.MustCompile(`^[0-9]{4}\.[0-9]{1,2}\.[0-9]+$`)

func Present(ctx *modules.Context) bool {
	return file.Exists(ctx, Path)
}

// mise publishes one static binary per release and the SHA-256 of each beside it, the way its own installer reads them: the binary is refused unless the two agree.
func Ensure(ctx *modules.Context) error {
	return ctx.Step("install-mise", func() (modules.Outcome, error) {
		if Present(ctx) {
			return modules.Skipped, nil
		}

		for _, dir := range []string{BinDir, DataDir} {
			if _, err := file.EnsureOwned(ctx, dir, shell.User, shell.User, 0o755); err != nil {
				return modules.Failed, err
			}
		}

		version, err := latestVersion(ctx)
		if err != nil {
			return modules.Failed, err
		}

		digest, err := publishedDigest(ctx, version)
		if err != nil {
			return modules.Failed, err
		}

		staged, done, err := download.Verified(ctx, program, releasesURL+version+"/"+asset(version), digest)
		if err != nil {
			return modules.Failed, err
		}
		defer done()

		if err := download.Install(ctx, staged, Path, 0o755, shell.User); err != nil {
			return modules.Failed, err
		}

		if !Present(ctx) {
			return modules.Failed, errors.New(i18n.T("modules.mise.missing_after_download", Path))
		}

		return modules.Done, nil
	})
}

func latestVersion(ctx *modules.Context) (string, error) {
	version, err := download.Text(ctx, versionURL)
	if err != nil {
		return "", err
	}

	if !versionShape.MatchString(version) {
		return "", errors.New(i18n.T("modules.mise.version_unreadable", version))
	}

	return version, nil
}

func publishedDigest(ctx *modules.Context, version string) (string, error) {
	sums, err := download.Text(ctx, releasesURL+version+"/"+sumsName)
	if err != nil {
		return "", err
	}

	digest, published := download.Published(sums, asset(version))
	if !published {
		return "", errors.New(i18n.T("modules.download.checksum_unpublished", asset(version), sumsName))
	}

	return digest, nil
}

func asset(version string) string {
	if runtime.GOARCH == "arm64" {
		return "mise-v" + version + "-linux-arm64"
	}

	return "mise-v" + version + "-linux-x64"
}

// What the machine really carries, read back from mise rather than from what the app asked for.
func Installed(ctx *modules.Context) map[string]string {
	out, err := user.Run(ctx, shell.User, program, "ls", "--installed")
	if err != nil {
		return map[string]string{}
	}

	tools := map[string]string{}
	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			tools[fields[0]] = fields[1]
		}
	}

	return tools
}

func Use(ctx *modules.Context, tool, version string) error {
	_, err := user.Run(ctx, shell.User, program, "use", "-g", "-y", tool+"@"+version)

	return err
}

func Upgrade(ctx *modules.Context, tools ...string) error {
	_, err := user.Run(ctx, shell.User, append([]string{program, "upgrade"}, tools...)...)

	return err
}

func Uninstall(ctx *modules.Context, tool, version string) error {
	_, err := user.Run(ctx, shell.User, program, "uninstall", tool+"@"+version)

	return err
}

func Where(ctx *modules.Context, tool string) string {
	out, err := user.Run(ctx, shell.User, program, "where", tool)
	if err != nil {
		return ""
	}

	lines := strings.Fields(strings.TrimSpace(out))
	if len(lines) == 0 {
		return ""
	}

	return lines[len(lines)-1]
}

// A pinned major is satisfied by any patch under it; a tool asked for at latest is satisfied by being there at all.
func Matches(installed, wanted string) bool {
	if installed == "" {
		return false
	}

	if wanted == Latest {
		return true
	}

	return installed == wanted || strings.HasPrefix(installed, wanted+".")
}

// Add installs a tool and checks mise really put it there; mise exiting 0 is not proof.
func Add(ctx *modules.Context, step, tool, wanted string) (bool, error) {
	added := false

	err := ctx.Step(step, func() (modules.Outcome, error) {
		if Matches(Installed(ctx)[tool], wanted) {
			return modules.Skipped, nil
		}

		if err := Use(ctx, tool, wanted); err != nil {
			return modules.Failed, err
		}

		if !Matches(Installed(ctx)[tool], wanted) {
			return modules.Failed, errors.New(i18n.T("modules.mise.tool_not_installed", tool, wanted))
		}

		added = true

		return modules.Done, nil
	})

	return added, err
}

func Remove(ctx *modules.Context, step, tool string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		installed := Installed(ctx)[tool]
		if installed == "" {
			return modules.Skipped, nil
		}

		return modules.Done, Uninstall(ctx, tool, installed)
	})
}
