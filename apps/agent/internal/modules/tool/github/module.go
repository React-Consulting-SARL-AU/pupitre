package github

import (
	"encoding/json"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	pkg = "gh"

	keyURL      = "https://cli.github.com/packages/githubcli-archive-keyring.gpg"
	keyringDir  = "/etc/apt/keyrings"
	keyringPath = keyringDir + "/githubcli.gpg"
	sourcePath  = "/etc/apt/sources.list.d/github-cli.list"

	sshDir  = shell.Home + "/.ssh"
	keyPath = sshDir + "/id_ed25519"

	helper     = "!gh auth git-credential"
	helperKey  = "credential.https://github.com.helper"
	envKey     = "GITHUB_TOKEN"
	defaultTag = "pupitre"

	host = "github.com"
)

func sourceLine() string {
	return "deb [arch=" + runtime.GOARCH + " signed-by=" + keyringPath + "] https://cli.github.com/packages stable main\n"
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	_, stored, err := env.Get(ctx, envKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: stored}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-gh", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		if err := addRepository(ctx); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

// The key GitHub publishes is already a keyring: it is downloaded where apt expects it, and nothing is dearmoured.
func addRepository(ctx *modules.Context) error {
	if !file.Exists(ctx, keyringPath) {
		if err := ctx.Sys().MkdirAll(keyringDir, 0o755); err != nil {
			return err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", keyringPath, keyURL}}); err != nil {
			return err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"chmod", "0644", keyringPath}}); err != nil {
			return err
		}
	}

	if !file.Same(ctx, sourcePath, []byte(sourceLine())) {
		if err := file.WriteAtomic(ctx, sourcePath, []byte(sourceLine()), 0o644); err != nil {
			return err
		}
	}

	return apt.Refresh(ctx)
}

func (Module) Configure(ctx *modules.Context) error {
	if err := storeToken(ctx); err != nil {
		return err
	}

	if err := authenticate(ctx); err != nil {
		return err
	}

	if err := setupGitCredentials(ctx); err != nil {
		return err
	}

	if err := createKey(ctx); err != nil {
		return err
	}

	return registerKey(ctx)
}

func storeToken(ctx *modules.Context) error {
	return ctx.Step("store-token", func() (modules.Outcome, error) {
		stored, err := env.Set(ctx, envKey, ctx.Secret("token"))
		if err != nil {
			return modules.Failed, err
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// The token travels on the standard input: gh reads it there, and neither the journal nor a process listing ever sees it.
func authenticate(ctx *modules.Context) error {
	return ctx.Step("authenticate-gh", func() (modules.Outcome, error) {
		if accountLogin(ctx) != "" {
			return modules.Skipped, nil
		}

		input := user.Input{Stdin: []byte(ctx.Secret("token") + "\n")}
		if _, err := user.RunWith(ctx, shell.User, input, "gh", "auth", "login", "--with-token"); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

// The credential helper is what turns a HTTPS clone into a clone that needs no key at all.
func setupGitCredentials(ctx *modules.Context) error {
	return ctx.Step("setup-git-credentials", func() (modules.Outcome, error) {
		out, err := user.Run(ctx, shell.User, "git", "config", "--global", "--get", helperKey)
		if err == nil && strings.TrimSpace(out) == helper {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, "gh", "auth", "setup-git"); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func createKey(ctx *modules.Context) error {
	return ctx.Step("create-ssh-key", func() (modules.Outcome, error) {
		if file.Exists(ctx, keyPath) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(sshDir, 0o700); err != nil {
			return modules.Failed, err
		}

		if err := file.Chown(ctx, sshDir, shell.User, shell.User); err != nil {
			return modules.Failed, err
		}

		if _, err := user.Run(ctx, shell.User, "ssh-keygen", "-t", "ed25519", "-N", "", "-C", hostname(ctx), "-f", keyPath); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func registerKey(ctx *modules.Context) error {
	return ctx.Step("register-ssh-key", func() (modules.Outcome, error) {
		title := hostname(ctx)

		listed, err := user.Run(ctx, shell.User, "gh", "ssh-key", "list")
		if err == nil && strings.Contains(listed, title) {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, "gh", "ssh-key", "add", keyPath+".pub", "--title", title); err != nil {
			ctx.Warn(i18n.T("warn.github.key.refused"))

			return modules.Done, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-gh", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The SSH key of the machine and the key registered on the account outlive the module: they are the client's, and other hosts use them.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("remove-gh", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	return ctx.Step("forget-token", func() (modules.Outcome, error) {
		removed, err := env.Unset(ctx, envKey)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceStopped
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	if status.Configured {
		status.Credentials = map[string]string{i18n.T("module.tool.github.token.label"): envKey}
	}

	return status, nil
}

type authStatus struct {
	Hosts map[string][]struct {
		State string `json:"state"`
		Login string `json:"login"`
		Error string `json:"error"`
	} `json:"hosts"`
}

// gh auth status asks GitHub whose token it holds; --active keeps the account the clones use, and the JSON is printed signed in or not.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	out, _ := login.Ask(ctx, nil, "gh", "auth", "status", "--active", "--json", "hosts")

	var status authStatus
	if err := json.Unmarshal([]byte(out.Stdout), &status); err != nil {
		return login.Unknown(i18n.T("login.unanswered", "gh", "gh auth status"))
	}

	accounts := status.Hosts[host]
	if len(accounts) == 0 {
		return login.SignedOut(i18n.T("login.github.fix"))
	}

	switch active := accounts[0]; {
	case active.State == "success":
		return login.SignedIn(active.Login)
	case strings.Contains(active.Error, "401"):
		return login.SignedOut(i18n.T("login.github.fix"))
	}

	return login.Unknown(i18n.T("login.unanswered", "gh", "gh auth status"))
}

// gh api answers on the standard output and only when the token opens the account, which is the question here.
func accountLogin(ctx *modules.Context) string {
	out, err := user.Run(ctx, shell.User, "gh", "api", "user", "--jq", ".login")
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out)
}

func hostname(ctx *modules.Context) string {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"hostname", "-s"}})
	if err != nil || strings.TrimSpace(out.Stdout) == "" {
		return defaultTag
	}

	return strings.TrimSpace(out.Stdout)
}
