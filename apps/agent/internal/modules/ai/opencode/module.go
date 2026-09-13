package opencode

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/shell"
)

const (
	Program = "opencode"

	configDir = agents.Home + "/.config/opencode"
)

var (
	target = agents.Target{ConfigDir: configDir, ContextFile: "AGENTS.md", Skills: true}

	ansi       = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)
	credential = regexp.MustCompile(`^(.+?) (oauth|api|wellknown)$`)
	tally      = regexp.MustCompile(`^(\d+) credentials?$`)
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	version := installedVersion(ctx)
	if version == "" {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID) && agents.Configured(ctx, target),
		Version:    version,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return installCLI(ctx)
}

// Nothing to sign in — OpenCode starts on its free models — but ~/.local/bin reaches the path only through a runtime module, so this one says so itself for a machine that has none.
func (Module) Configure(ctx *modules.Context) error {
	if err := shell.EnsureBlock(ctx, "write-shell-env", ID, []byte(shell.PathLines(shell.LocalBin))); err != nil {
		return err
	}

	return agents.Deploy(ctx, target)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := upgradeCLI(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The credentials and the sessions under ~/.local/share/opencode stay, as does what the client put in ~/.config/opencode: only the binary and the context this module wrote go.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := removeCLI(ctx); err != nil {
		return err
	}

	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	return agents.Forget(ctx, target)
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	return status, nil
}

// opencode auth list prints one line per provider it holds a credential for and how many there are; it never reaches a provider. Signed in is any provider at all, named by their list.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	out, _ := login.Ask(ctx, nil, Program, "auth", "list")

	providers, count, counted := readCredentials(out.Stdout)
	if !counted {
		return login.Unknown(i18n.T("login.unanswered", "OpenCode", Program+" auth list"))
	}

	if count == 0 {
		return login.SignedOut(i18n.T("login.opencode.fix"))
	}

	return login.SignedIn(strings.Join(providers, ", "))
}

func readCredentials(output string) (providers []string, count int, counted bool) {
	for _, raw := range strings.Split(output, "\n") {
		line := plain(raw)

		if match := tally.FindStringSubmatch(line); match != nil {
			count, _ = strconv.Atoi(match[1])
			counted = true

			continue
		}

		if match := credential.FindStringSubmatch(line); match != nil && !counted {
			providers = append(providers, match[1])
		}
	}

	return providers, count, counted
}

// A line without its colours and without the box the prompt draws around it.
func plain(line string) string {
	stripped := strings.TrimSpace(ansi.ReplaceAllString(line, ""))

	return strings.TrimLeftFunc(stripped, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}
