package zed

import (
	"errors"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	// Where Zed looks for a server before uploading or downloading one, named after the release channel and the exact version of the client.
	ServerDir = shell.Home + "/.zed_server"

	pointerPath = ServerDir + "/pupitre-release.txt"
	binaryName  = "zed-remote-server-stable-"

	latest     = "latest"
	releaseURL = "https://zed.dev/api/releases/stable"
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	installed := recorded(ctx)
	if installed == "" || !file.Exists(ctx, binaryPath(installed)) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: file.Exists(ctx, pointerPath),
		Version:    installed,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-remote-server", func() (modules.Outcome, error) {
		version, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if file.Exists(ctx, binaryPath(version)) {
			return modules.Skipped, nil
		}

		return modules.Done, installServer(ctx, version)
	})
}

// Zed publishes no checksum beside its server: the transport is the only guarantee, so the download at least stays root's until it is in place.
func installServer(ctx *modules.Context, version string) error {
	binary := binaryPath(version)

	if err := ctx.Sys().MkdirAll(ServerDir, 0o755); err != nil {
		return err
	}

	if err := file.Chown(ctx, ServerDir, shell.User, shell.User); err != nil {
		return err
	}

	staged, done, err := download.Fetch(ctx, binaryName+version+".gz", assetURL(version))
	if err != nil {
		return err
	}
	defer done()

	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"gunzip", "-f", staged}}); err != nil {
		return err
	}

	plain := strings.TrimSuffix(staged, ".gz")
	defer file.Remove(ctx, plain)

	if err := download.Install(ctx, plain, binary, 0o755, shell.User); err != nil {
		return err
	}

	if !file.Exists(ctx, binary) {
		return errors.New(i18n.T("modules.zed.missing_after_download", version, ServerDir))
	}

	return nil
}

func (Module) Configure(ctx *modules.Context) error {
	return ctx.Step("record-release", func() (modules.Outcome, error) {
		version, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		content := []byte(version + "\n")
		if file.Same(ctx, pointerPath, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, pointerPath, content, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, pointerPath, shell.User, shell.User)
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := m.Install(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// Only the server this module downloaded goes; another version the client put there is not ours to remove.
func (Module) Uninstall(ctx *modules.Context) error {
	installed := recorded(ctx)

	if err := ctx.Step("remove-remote-server", func() (modules.Outcome, error) {
		if installed == "" {
			return modules.Skipped, nil
		}

		removed, err := file.Remove(ctx, binaryPath(installed))
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

	return ctx.Step("forget-release", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, pointerPath)
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

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	return status, nil
}

func binaryPath(version string) string {
	return ServerDir + "/" + binaryName + version
}

func recorded(ctx *modules.Context) string {
	raw, err := file.Read(ctx, pointerPath)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}

// A pinned version is downloaded as it is asked for; latest is resolved from
// the first redirect alone: zed.dev points at the GitHub release, whose path
// names the version, and GitHub then sends the download on to a storage host
// whose path names nothing.
func resolve(ctx *modules.Context) (string, error) {
	wanted := strings.TrimSpace(ctx.String("version"))
	if wanted == "" {
		wanted = latest
	}

	if wanted != latest {
		return strings.TrimPrefix(wanted, "v"), nil
	}

	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsS", "--proto", "=https", "--tlsv1.2", "-o", "/dev/null", "-w", "%{redirect_url}", assetURL(latest)}})
	if err != nil {
		return "", err
	}

	version := versionOf(out.Stdout)
	if version == "" {
		return "", errors.New(i18n.T("modules.zed.version_unreadable", strings.TrimSpace(out.Stdout)))
	}

	return version, nil
}

func versionOf(redirect string) string {
	for _, segment := range strings.Split(strings.TrimSpace(redirect), "/") {
		if strings.HasPrefix(segment, "v") && strings.Contains(segment, ".") {
			return strings.TrimPrefix(segment, "v")
		}
	}

	return ""
}

func assetURL(version string) string {
	return releaseURL + "/" + version + "/zed-remote-server-linux-" + platform() + ".gz"
}

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "aarch64"
	}

	return "x86_64"
}
