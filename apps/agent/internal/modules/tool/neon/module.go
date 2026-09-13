package neon

import (
	"encoding/json"
	"fmt"
	"path"
	"runtime"
	"strings"
	"sync"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	BinaryPath = "/usr/local/bin/neon"
	// The help the CLI prints names itself neonctl; both names must answer.
	LinkPath = "/usr/local/bin/neonctl"

	assetName = "neonctl"
	assetURL  = "https://github.com/neondatabase/neonctl/releases/latest/download/neonctl-linux-"

	keyKey    = "NEON_API_KEY"
	keyPrefix = "NEON_"
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !file.Exists(ctx, BinaryPath) {
		return modules.Status{}, nil
	}

	_, stored, err := env.Get(ctx, keyKey)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Configured: stored, Version: version(ctx)}, nil
}

// The CLI is a bundled Node program that takes half a second to say its
// version, and a snapshot asks every few seconds: the answer is kept for as
// long as the binary on disk is the same one, size and date.
var known struct {
	sync.Mutex
	stamp   string
	version string
}

func version(ctx *modules.Context) string {
	stamp := stampOf(ctx)

	known.Lock()
	defer known.Unlock()

	if stamp != "" && stamp == known.stamp {
		return known.version
	}

	out, err := sys.Exec(ctx, sys.Command{Argv: []string{BinaryPath, "--version"}})
	if err != nil {
		return ""
	}

	known.stamp = stamp
	known.version = strings.TrimSpace(out.Stdout)

	return known.version
}

func stampOf(ctx *modules.Context) string {
	node, err := ctx.Sys().StatIn(path.Dir(BinaryPath), path.Base(BinaryPath))
	if err != nil {
		return ""
	}

	return fmt.Sprintf("%d@%d", node.SizeBytes, node.ModifiedAt.UnixNano())
}

func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("install-neonctl", func() (modules.Outcome, error) {
		if file.Exists(ctx, BinaryPath) {
			return modules.Skipped, nil
		}

		staged, done, err := fetch(ctx)
		if err != nil {
			return modules.Failed, err
		}
		defer done()

		return modules.Done, download.Install(ctx, staged, BinaryPath, 0o755, "root")
	}); err != nil {
		return err
	}

	return ctx.Step("link-neonctl", func() (modules.Outcome, error) {
		if linkTarget(ctx) == BinaryPath {
			return modules.Skipped, nil
		}

		_, err := sys.Exec(ctx, sys.Command{Argv: []string{"ln", "-sfn", BinaryPath, LinkPath}})

		return modules.Done, err
	})
}

func linkTarget(ctx *modules.Context) string {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"readlink", LinkPath}})
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out.Stdout)
}

// Neon publishes no checksum beside its binaries: the transport is the only guarantee, so the download at least stays root's until it is in place.
func fetch(ctx *modules.Context) (string, func(), error) {
	return download.Fetch(ctx, assetName, asset())
}

// Neon publishes one binary per architecture, under the name Node gives it rather than the one Go uses.
func asset() string {
	if runtime.GOARCH == "arm64" {
		return assetURL + "arm64"
	}

	return assetURL + "x64"
}

// neonctl has no token login: it takes the key through NEON_API_KEY, so the dev shell must carry it, not only /etc/pupitre/env.
func (Module) Configure(ctx *modules.Context) error {
	if err := ctx.Step("store-key", func() (modules.Outcome, error) {
		changed, err := env.Set(ctx, keyKey, ctx.Secret("api_key"))
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("export-key", func() (modules.Outcome, error) {
		changed, err := shell.SetUserEnv(ctx, keyKey, ctx.Secret("api_key"))
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-neonctl", func() (modules.Outcome, error) {
		staged, done, err := fetch(ctx)
		if err != nil {
			return modules.Failed, err
		}
		defer done()

		fetched, err := file.Read(ctx, staged)
		if err != nil {
			return modules.Failed, err
		}

		if file.Same(ctx, BinaryPath, fetched) {
			return modules.Skipped, nil
		}

		return modules.Done, file.WriteAtomic(ctx, BinaryPath, fetched, 0o755)
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The Neon account belongs to the client: uninstalling gives back the machine and its secrets, never a project or a branch.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("remove-neonctl", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, BinaryPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("unlink-neonctl", func() (modules.Outcome, error) {
		if linkTarget(ctx) == "" {
			return modules.Skipped, nil
		}

		_, err := sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-f", LinkPath}})

		return modules.Done, err
	}); err != nil {
		return err
	}

	return ctx.Step("forget-key", func() (modules.Outcome, error) {
		keys, err := env.Keys(ctx)
		if err != nil {
			return modules.Failed, err
		}

		forgotten, err := shell.UnsetUserEnv(ctx, keyKey)
		if err != nil {
			return modules.Failed, err
		}

		for _, key := range keys {
			if !strings.HasPrefix(key, keyPrefix) {
				continue
			}

			removed, err := env.Unset(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			forgotten = forgotten || removed
		}

		if !forgotten {
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

	status.Credentials = map[string]string{i18n.T("module.tool.neon.api_key.label"): keyKey}

	return status, nil
}

// neonctl me is asked with the key the machine holds, and only then: without one the CLI opens a sign-in in a browser nobody is watching, and waits.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	key, _, _ := env.Get(ctx, keyKey)
	if key == "" {
		return login.SignedOut(i18n.T("login.token.absent", "Neon"))
	}

	out, err := login.Ask(ctx, []string{keyKey + "=" + key}, BinaryPath, "me", "-o", "json")

	var me struct {
		Login string `json:"login"`
		Email string `json:"email"`
	}
	if err != nil || json.Unmarshal([]byte(out.Stdout), &me) != nil {
		return login.Unknown(i18n.T("login.token.refused", "Neon"))
	}

	if me.Email != "" {
		return login.SignedIn(me.Email)
	}

	return login.SignedIn(me.Login)
}
