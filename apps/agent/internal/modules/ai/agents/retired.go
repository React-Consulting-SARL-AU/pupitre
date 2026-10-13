package agents

import (
	"strings"

	"pupitre.studio/agent/internal/modules"
)

// Skills an earlier agent deployed, known by their own front matter: a client's skill under the same name stays.
var retiredSkills = map[string]string{
	"capture": "description: Show an image or a web page from this server",
}

func retireSkills(ctx *modules.Context, target Target) error {
	if !target.Skills {
		return nil
	}

	return ctx.Step("retire-skills", func() (modules.Outcome, error) {
		left := retiredLeft(ctx, target)
		if len(left) == 0 {
			return modules.Skipped, nil
		}

		for _, folder := range left {
			if err := ctx.Sys().RemoveIn(Home, folder, true); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})
}

// Folders relative to dev's home, removed through os.Root so a link planted there leads nowhere.
func retiredLeft(ctx *modules.Context, target Target) []string {
	var left []string

	for name, signature := range retiredSkills {
		for _, dir := range []string{SkillsDir, target.ConfigDir + "/skills"} {
			folder := strings.TrimPrefix(dir, Home+"/") + "/" + name

			body, err := ctx.Sys().ReadFileIn(Home, folder+"/SKILL.md")
			if err == nil && strings.Contains(string(body), signature) {
				left = append(left, folder)
			}
		}
	}

	return left
}
