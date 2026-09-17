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
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	BinDir   = shell.Home + "/.local/bin"
	Path     = BinDir + "/mise"
	DataDir  = shell.Home + "/.local/share/mise"
	ShimsDir = DataDir + "/shims"

	// Where mise use -g writes the default of every tool.
	GlobalConfig = shell.Home + "/.config/mise/config.toml"

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

// What the machine really carries, read back from mise rather than from what
// the app asked for: one version per tool, the first mise lists. A runtime held
// at several reads them through Versions. A reader takes a listing mise refused
// as empty; a step asks installedTools and stops on it.
func Installed(ctx sys.Context) map[string]string {
	tools, _ := installedTools(ctx)

	return tools
}

func installedTools(ctx sys.Context) (map[string]string, error) {
	entries, err := listed(ctx)
	if err != nil {
		return nil, err
	}

	tools := map[string]string{}
	for _, entry := range entries {
		if _, seen := tools[entry.tool]; !seen {
			tools[entry.tool] = entry.version
		}
	}

	return tools, nil
}

// Versions lists every version mise holds of one tool, in the order mise prints them: ascending.
func Versions(ctx sys.Context, tool string) []string {
	versions, _ := versionsOf(ctx, tool)

	return versions
}

func versionsOf(ctx sys.Context, tool string) ([]string, error) {
	entries, err := listed(ctx)
	if err != nil {
		return nil, err
	}

	var versions []string
	for _, entry := range entries {
		if entry.tool == tool {
			versions = append(versions, entry.version)
		}
	}

	return versions, nil
}

type entry struct {
	tool, version string
}

func listed(ctx sys.Context) ([]entry, error) {
	out, err := user.Run(ctx, shell.User, program, "ls", "--installed")
	if err != nil {
		return nil, errors.New(i18n.T("modules.mise.list_failed", err.Error()))
	}

	var entries []entry
	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			entries = append(entries, entry{fields[0], fields[1]})
		}
	}

	return entries, nil
}

// Global reads the defaults mise use -g wrote, tool by requested version, from the configuration file rather than from a shell whose folder would decide the answer.
func Global(ctx sys.Context) map[string]string {
	raw, err := ctx.Sys().ReadFile(GlobalConfig)
	if err != nil {
		return map[string]string{}
	}

	tools := map[string]string{}
	inTools := false
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[") {
			inTools = line == "[tools]"
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !inTools || !found {
			continue
		}

		tools[strings.Trim(strings.TrimSpace(key), `"`)] = strings.Trim(strings.TrimSpace(value), `"`)
	}

	return tools
}

// Default is the installed version the machine's default request resolves to — the newest under it, or the newest of all when no request was written.
func Default(ctx sys.Context, tool string) string {
	installed := Versions(ctx, tool)
	if len(installed) == 0 {
		return ""
	}

	requested := Global(ctx)[tool]
	for i := len(installed) - 1; i >= 0; i-- {
		if requested == "" || Matches(installed[i], requested) {
			return installed[i]
		}
	}

	return installed[len(installed)-1]
}

func Use(ctx sys.Context, tool, version string) error {
	_, err := user.Run(ctx, shell.User, program, "use", "-g", "-y", tool+"@"+version)

	return err
}

// install puts a version beside the others without making it the default.
func install(ctx sys.Context, tool, version string) error {
	_, err := user.Run(ctx, shell.User, program, "install", "-y", tool+"@"+version)

	return err
}

func Upgrade(ctx sys.Context, tools ...string) error {
	_, err := user.Run(ctx, shell.User, append([]string{program, "upgrade"}, tools...)...)

	return err
}

func Uninstall(ctx sys.Context, tool, version string) error {
	_, err := user.Run(ctx, shell.User, program, "uninstall", tool+"@"+version)

	return err
}

// Exec runs a program under one version of a tool, whatever the default is: gem under the ruby that was just put.
func Exec(ctx sys.Context, tool, version string, argv ...string) error {
	_, err := user.Run(ctx, shell.User, append([]string{program, "x", tool + "@" + version, "--"}, argv...)...)

	return err
}

func Where(ctx sys.Context, tool string) string {
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
		installed, err := installedTools(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if Matches(installed[tool], wanted) {
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
		installed, err := installedTools(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if installed[tool] == "" {
			return modules.Skipped, nil
		}

		return modules.Done, Uninstall(ctx, tool, installed[tool])
	})
}
