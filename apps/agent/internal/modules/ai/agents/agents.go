// Package agents lays down what the three coding agents read: the machine context, the Pupitre skills and the subagents.
package agents

import (
	"embed"
	"io/fs"
	"path"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	User = shell.User
	Home = shell.Home

	SkillsDir    = Home + "/.agents/skills"
	ProjectsDir  = Home + "/projects"
	GalleryDir   = Home + "/shots"
	contextMode  = 0o644
	skillsSuffix = ".md"
)

//go:embed content
var content embed.FS

// A target without a ContextFile has no global instructions of its own — Cursor keeps its user rules in the account — and reads as configured once its skills are down.
type Target struct {
	ConfigDir   string
	ContextFile string
	Skills      bool
	Subagents   bool
}

func (t Target) contextPath() string {
	return t.ConfigDir + "/" + t.ContextFile
}

func Deploy(ctx *modules.Context, target Target) error {
	if err := writeContext(ctx, target); err != nil {
		return err
	}

	if err := writeSkills(ctx, target); err != nil {
		return err
	}

	return writeSubagents(ctx, target)
}

func Configured(ctx *modules.Context, target Target) bool {
	if target.ContextFile == "" {
		return skillsPresent(ctx, target)
	}

	return file.Same(ctx, target.contextPath(), machineContext())
}

func skillsPresent(ctx *modules.Context, target Target) bool {
	for _, name := range names("content/skills") {
		body, err := content.ReadFile("content/skills/" + name)
		if err != nil || !file.Same(ctx, skillPath(target.ConfigDir+"/skills", name), body) {
			return false
		}
	}

	return true
}

func skillPath(dir, name string) string {
	return dir + "/" + strings.TrimSuffix(name, skillsSuffix) + "/SKILL.md"
}

func Forget(ctx *modules.Context, target Target) error {
	if target.ContextFile == "" {
		return nil
	}

	return ctx.Step("remove-context", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, target.contextPath())
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func writeContext(ctx *modules.Context, target Target) error {
	if target.ContextFile == "" {
		return nil
	}

	return ctx.Step("write-context", func() (modules.Outcome, error) {
		return place(ctx, target.contextPath(), machineContext())
	})
}

// Both folders hold real files rather than links: a skill copied twice is idempotent to compare, where a symlink is not readable as content.
func writeSkills(ctx *modules.Context, target Target) error {
	if !target.Skills {
		return nil
	}

	return ctx.Step("write-skills", func() (modules.Outcome, error) {
		outcome := modules.Skipped

		for _, name := range names("content/skills") {
			body, err := content.ReadFile("content/skills/" + name)
			if err != nil {
				return modules.Failed, err
			}

			for _, dir := range []string{SkillsDir, target.ConfigDir + "/skills"} {
				written, err := place(ctx, skillPath(dir, name), body)
				if err != nil {
					return modules.Failed, err
				}

				if written == modules.Done {
					outcome = modules.Done
				}
			}
		}

		return outcome, nil
	})
}

func writeSubagents(ctx *modules.Context, target Target) error {
	if !target.Subagents {
		return nil
	}

	return ctx.Step("write-subagents", func() (modules.Outcome, error) {
		outcome := modules.Skipped

		for _, name := range names("content/subagents") {
			body, err := content.ReadFile("content/subagents/" + name)
			if err != nil {
				return modules.Failed, err
			}

			written, err := place(ctx, target.ConfigDir+"/agents/"+name, body)
			if err != nil {
				return modules.Failed, err
			}

			if written == modules.Done {
				outcome = modules.Done
			}
		}

		return outcome, nil
	})
}

func place(ctx *modules.Context, target string, body []byte) (modules.Outcome, error) {
	if file.Same(ctx, target, body) {
		return modules.Skipped, nil
	}

	if err := file.MkdirOwned(ctx, path.Dir(target), User, User, 0o755); err != nil {
		return modules.Failed, err
	}

	if err := file.WriteAtomic(ctx, target, body, contextMode); err != nil {
		return modules.Failed, err
	}

	return modules.Done, file.Chown(ctx, target, User, User)
}

func names(dir string) []string {
	entries, err := fs.ReadDir(content, dir)
	if err != nil {
		return nil
	}

	found := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			found = append(found, entry.Name())
		}
	}
	sort.Strings(found)

	return found
}
