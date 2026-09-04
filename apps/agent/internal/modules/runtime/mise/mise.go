package mise

import (
	"fmt"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	BinDir   = shell.Home + "/.local/bin"
	Path     = BinDir + "/mise"
	ShimsDir = shell.Home + "/.local/share/mise/shims"

	Latest = "latest"

	program = "mise"
	baseURL = "https://mise.jdx.dev/mise-latest-linux-"
)

// mise publishes one static binary per architecture; fetching it keeps the install to an argv and leaves no script on the client's disk.
func downloadURL() string {
	if runtime.GOARCH == "arm64" {
		return baseURL + "arm64"
	}

	return baseURL + "x64"
}

func Present(ctx *modules.Context) bool {
	return file.Exists(ctx, Path)
}

func Ensure(ctx *modules.Context) error {
	return ctx.Step("install-mise", func() (modules.Outcome, error) {
		if Present(ctx) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(BinDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if err := file.Chown(ctx, BinDir, shell.User, shell.User); err != nil {
			return modules.Failed, err
		}

		if _, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", Path, downloadURL()); err != nil {
			return modules.Failed, err
		}

		if _, err := user.Run(ctx, shell.User, "chmod", "0755", Path); err != nil {
			return modules.Failed, err
		}

		if !Present(ctx) {
			return modules.Failed, fmt.Errorf("mise absent de %s après téléchargement", Path)
		}

		return modules.Done, file.Chown(ctx, Path, shell.User, shell.User)
	})
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
			return modules.Failed, fmt.Errorf("mise a rendu la main sans installer %s@%s", tool, wanted)
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
