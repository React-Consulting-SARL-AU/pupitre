package onepassword

import (
	"encoding/json"
	"pupitre.studio/agent/internal/i18n"
	"regexp"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	templateName = ".env.1password.tpl"
	exampleName  = ".env.example"
	targetName   = ".env.local"
	configName   = "op.config.json"
)

var keyPattern = regexp.MustCompile(`(?m)^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=`)

type Result struct {
	Path     string   `json:"path"`
	Written  bool     `json:"written"`
	Keys     []string `json:"keys"`
	Template bool     `json:"template"`
}

func Env(ctx *modules.Context, name, id string, force bool) (Result, error) {
	project, known := registry.Load(ctx, registry.Paths{}).Get(name)
	if !known {
		return Result{}, registry.NotFound(name)
	}

	root := project.Path(registry.Paths{}.Resolved().Projects)
	dir := root

	if id != "" {
		process, declared := project.Process(id)
		if !declared {
			return Result{}, protocol.NewError(contract.ErrorProjectNotFound, i18n.T("state.process.unknown", id, name)).
				WithFix(i18n.T("state.process.unknown.fix"))
		}

		dir = process.Path(root)
	}

	repo := repository{root: root}
	home := repo.envHome(ctx, dir)
	target := home + "/" + targetName
	template := repo.hasTemplate(ctx, home)

	if repo.has(ctx, target) && !force {
		return read(ctx, repo, target, template)
	}

	switch {
	case repo.has(ctx, home+"/"+templateName) && installed(ctx):
		return inject(ctx, name, home, repo, target)
	case repo.has(ctx, home+"/"+exampleName):
		return copyExample(ctx, name, home, repo, target)
	case template:
		return Result{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("onepassword.template.uninjectable", name, templateName)).
			WithFix(i18n.T("onepassword.template.uninjectable.fix", exampleName))
	case repo.has(ctx, target):
		return read(ctx, repo, target, false)
	}

	return Result{Path: target, Keys: []string{}}, nil
}

// Reads stay inside the repository root: a link it carries is followed only while it stays there, never out to the machine.
type repository struct {
	root string
}

func (r repository) rel(path string) string {
	return strings.TrimPrefix(strings.TrimPrefix(path, r.root), "/")
}

func (r repository) has(ctx *modules.Context, path string) bool {
	_, err := ctx.Sys().StatIn(r.root, r.rel(path))

	return err == nil
}

func (r repository) read(ctx *modules.Context, path string) ([]byte, error) {
	return ctx.Sys().ReadFileIn(r.root, r.rel(path))
}

// A monorepo keeps one environment file at its root that its workspaces point back at.
func (r repository) envHome(ctx *modules.Context, dir string) string {
	if r.hasTemplate(ctx, dir) || !r.hasTemplate(ctx, r.root) {
		return dir
	}

	return r.root
}

func (r repository) hasTemplate(ctx *modules.Context, dir string) bool {
	return r.has(ctx, dir+"/"+templateName) || r.has(ctx, dir+"/"+exampleName)
}

// The template goes in on stdin and the filled file comes back on stdout, so neither is ever journalled.
func inject(ctx *modules.Context, name, home string, repo repository, target string) (Result, error) {
	raw, err := repo.read(ctx, home+"/"+templateName)
	if err != nil {
		return Result{}, err
	}

	ctx.Logf("%s : op inject %s", name, home+"/"+templateName)

	out, err := ctx.Sys().Run(sys.Command{
		User:  shell.User,
		Dir:   home,
		Argv:  []string{program, "inject"},
		Stdin: substitute(ctx, raw, repo),
		Env:   environment(serviceToken(ctx)),
	})
	if err != nil || strings.TrimSpace(out.Stdout) == "" {
		if repo.has(ctx, home+"/"+exampleName) {
			ctx.Warn(i18n.T("onepassword.inject.fallback", name, targetName, exampleName))

			return copyExample(ctx, name, home, repo, target)
		}

		return Result{}, protocol.NewError(contract.ErrorInternal, i18n.T("onepassword.inject.empty", name)).
			WithFix(i18n.T("onepassword.inject.empty.fix", shell.User))
	}

	return write(ctx, target, []byte(out.Stdout))
}

// op inject refuses the {{OP_VAULT}} and {{OP_ITEM}} placeholders; op.config.json says what they stand for.
func substitute(ctx *modules.Context, template []byte, repo repository) []byte {
	var config struct {
		Vault string `json:"vault"`
		Item  string `json:"item"`
	}

	if raw, err := repo.read(ctx, repo.root+"/"+configName); err == nil {
		json.Unmarshal(raw, &config)
	}

	replaced := strings.NewReplacer("{{OP_VAULT}}", config.Vault, "{{OP_ITEM}}", config.Item).Replace(string(template))

	return []byte(replaced)
}

// Without op the versioned example is copied so the project still starts; values are filled in by hand.
func copyExample(ctx *modules.Context, name, home string, repo repository, target string) (Result, error) {
	raw, err := repo.read(ctx, home+"/"+exampleName)
	if err != nil {
		return Result{}, err
	}

	ctx.Logf("%s: %s copied from %s", name, targetName, exampleName)

	return write(ctx, target, raw)
}

func write(ctx *modules.Context, target string, content []byte) (Result, error) {
	if len(content) > 0 && content[len(content)-1] != '\n' {
		content = append(content, '\n')
	}

	if err := file.WriteAtomic(ctx, target, content, 0o600); err != nil {
		return Result{}, err
	}

	if err := file.Chown(ctx, target, shell.User, shell.User); err != nil {
		return Result{}, err
	}

	return Result{Path: target, Written: true, Keys: keys(content), Template: true}, nil
}

func read(ctx *modules.Context, repo repository, target string, template bool) (Result, error) {
	raw, err := repo.read(ctx, target)
	if err != nil {
		return Result{}, err
	}

	return Result{Path: target, Written: false, Keys: keys(raw), Template: template}, nil
}

// Names only, in file order: a value never leaves the file.
func keys(content []byte) []string {
	seen := map[string]bool{}
	names := []string{}

	for _, match := range keyPattern.FindAllStringSubmatch(string(content), -1) {
		if !seen[match[1]] {
			seen[match[1]] = true
			names = append(names, match[1])
		}
	}

	return names
}
