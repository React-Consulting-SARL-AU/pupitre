package shell

import (
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	User = "dev"
	Home = "/home/dev"

	// zsh reads .zshenv for every shell; .zshrc is skipped by `ssh host 'node -v'`, so a runtime activated only there stays invisible.
	EnvPath = Home + "/.zshenv"

	LocalBin  = "$HOME/.local/bin"
	MiseShims = "$HOME/.local/share/mise/shims"
	BunBin    = "$HOME/.bun/bin"
)

func EnsureBlock(ctx *modules.Context, step, name string, content []byte) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		changed, err := file.EnsureBlock(ctx, EnvPath, name, content)
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, file.Chown(ctx, EnvPath, User, User)
	})
}

func RemoveBlock(ctx *modules.Context, step, name string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		removed, err := file.RemoveBlock(ctx, EnvPath, name)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func HasBlock(ctx *modules.Context, name string) bool {
	return file.HasBlock(ctx, EnvPath, name)
}

// Guarded so three runtime blocks in the same file never stack the same directory twice.
func PathLines(dirs ...string) string {
	var lines []string
	for i := len(dirs) - 1; i >= 0; i-- {
		lines = append(lines, fmt.Sprintf(`[[ ":$PATH:" == *":%s:"* ]] || export PATH="%s:$PATH"`, dirs[i], dirs[i]))
	}

	return strings.Join(lines, "\n") + "\n"
}

func Export(key, value string) string {
	return fmt.Sprintf("export %s=%q\n", key, value)
}
