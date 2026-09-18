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

// The template is versioned by the repository, the values live in the vault: the file produced is the only place the two ever meet.
// Env writes the environment file of a project's root, or of one of its processes when it is named: the process's folder is looked at first, the root next.
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

	home := envHome(ctx, dir, root)
	target := home + "/" + targetName
	template := hasTemplate(ctx, home)

	if file.Exists(ctx, target) && !force {
		return read(ctx, target, template)
	}

	switch {
	case file.Exists(ctx, home+"/"+templateName) && installed(ctx):
		return inject(ctx, name, home, root, target)
	case file.Exists(ctx, home+"/"+exampleName):
		return copyExample(ctx, name, home, target)
	case template:
		return Result{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("onepassword.template.uninjectable", name, templateName)).
			WithFix(i18n.T("onepassword.template.uninjectable.fix", exampleName))
	case file.Exists(ctx, target):
		return read(ctx, target, false)
	}

	return Result{Path: target, Keys: []string{}}, nil
}

// A monorepo keeps one environment file at its root and its workspaces point back at it; the project folder is looked at first, the root next.
func envHome(ctx *modules.Context, dir, root string) string {
	if hasTemplate(ctx, dir) || !hasTemplate(ctx, root) {
		return dir
	}

	return root
}

func hasTemplate(ctx *modules.Context, dir string) bool {
	return file.Exists(ctx, dir+"/"+templateName) || file.Exists(ctx, dir+"/"+exampleName)
}

// op inject reads the template on its standard input and answers the filled file on its own: neither one is ever journalled.
func inject(ctx *modules.Context, name, home, root, target string) (Result, error) {
	raw, err := file.Read(ctx, home+"/"+templateName)
	if err != nil {
		return Result{}, err
	}

	ctx.Logf("%s : op inject %s", name, home+"/"+templateName)

	out, err := ctx.Sys().Run(sys.Command{
		User:  shell.User,
		Dir:   home,
		Argv:  []string{program, "inject"},
		Stdin: substitute(ctx, raw, root),
		Env:   environment(serviceToken(ctx)),
	})
	if err != nil || strings.TrimSpace(out.Stdout) == "" {
		if file.Exists(ctx, home+"/"+exampleName) {
			ctx.Warn(i18n.T("onepassword.inject.fallback", name, targetName, exampleName))

			return copyExample(ctx, name, home, target)
		}

		return Result{}, protocol.NewError(contract.ErrorInternal, i18n.T("onepassword.inject.empty", name)).
			WithFix(i18n.T("onepassword.inject.empty.fix", shell.User))
	}

	return write(ctx, target, []byte(out.Stdout))
}

// The template carries {{OP_VAULT}} and {{OP_ITEM}} placeholders, and op inject refuses those braces; the repository's op.config.json says what they stand for.
func substitute(ctx *modules.Context, template []byte, root string) []byte {
	var config struct {
		Vault string `json:"vault"`
		Item  string `json:"item"`
	}

	if raw, err := file.Read(ctx, root+"/"+configName); err == nil {
		json.Unmarshal(raw, &config)
	}

	replaced := strings.NewReplacer("{{OP_VAULT}}", config.Vault, "{{OP_ITEM}}", config.Item).Replace(string(template))

	return []byte(replaced)
}

// A machine without a secret manager still deserves a startable project: the versioned example is copied, and the values are to be filled in by hand.
func copyExample(ctx *modules.Context, name, home, target string) (Result, error) {
	raw, err := file.Read(ctx, home+"/"+exampleName)
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

func read(ctx *modules.Context, target string, template bool) (Result, error) {
	raw, err := file.Read(ctx, target)
	if err != nil {
		return Result{}, err
	}

	return Result{Path: target, Written: false, Keys: keys(raw), Template: template}, nil
}

// The names of the variables, in the order the file gives them, and never a single value.
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
