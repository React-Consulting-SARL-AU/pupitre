package mise

import (
	"errors"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	// Read first by mise and meant to stay out of git: what a project runs on, whatever the repository declares.
	LocalConfig = "mise.local.toml"

	excludeBlock = "runtimes"
)

// The file is the agent's alone: git is told to ignore it, mise to trust it.
func Pin(ctx sys.Context, root string, runtimes map[string]string) (bool, error) {
	path := root + "/" + LocalConfig

	if len(runtimes) == 0 {
		return file.Remove(ctx, path)
	}

	content, err := localConfig(runtimes)
	if err != nil {
		return false, err
	}

	if file.Same(ctx, path, content) {
		return false, nil
	}

	if err := file.WriteAtomic(ctx, path, content, 0o644); err != nil {
		return false, err
	}

	if err := file.Chown(ctx, path, shell.User, shell.User); err != nil {
		return false, err
	}

	if err := exclude(ctx, root); err != nil {
		return false, err
	}

	_, err = user.Run(ctx, shell.User, program, "trust", path)

	return true, err
}

func localConfig(runtimes map[string]string) ([]byte, error) {
	tools := make([]string, 0, len(runtimes))

	for tool := range runtimes {
		tools = append(tools, tool)
	}

	sort.Strings(tools)

	var out strings.Builder
	out.WriteString("[tools]\n")

	for _, tool := range tools {
		runtime, known := RuntimeOf(tool)
		if !known {
			return nil, errors.New("mise: " + tool + " is not a runtime")
		}

		out.WriteString(tool + " = \"" + runtime.Spec(runtimes[tool]) + "\"\n")
	}

	return []byte(out.String()), nil
}

// .git/info/exclude hides the file for this clone alone, so the repository never learns of it.
func exclude(ctx sys.Context, root string) error {
	if !file.Exists(ctx, root+"/.git") {
		return nil
	}

	if err := file.MkdirOwned(ctx, root+"/.git/info", shell.User, shell.User, 0o755); err != nil {
		return err
	}

	changed, err := file.EnsureBlock(ctx, root+"/.git/info/exclude", excludeBlock, []byte("/"+LocalConfig+"\n"))
	if err != nil || !changed {
		return err
	}

	return file.Chown(ctx, root+"/.git/info/exclude", shell.User, shell.User)
}
