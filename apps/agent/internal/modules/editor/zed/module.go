package zed

import (
	"fmt"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
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

		return modules.Done, download(ctx, version)
	})
}

func download(ctx *modules.Context, version string) error {
	binary := binaryPath(version)

	if err := ctx.Sys().MkdirAll(ServerDir, 0o755); err != nil {
		return err
	}

	if err := file.Chown(ctx, ServerDir, shell.User, shell.User); err != nil {
		return err
	}

	if _, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", binary+".gz", assetURL(version)); err != nil {
		return err
	}

	if _, err := user.Run(ctx, shell.User, "gunzip", "-f", binary+".gz"); err != nil {
		return err
	}

	if !file.Exists(ctx, binary) {
		return fmt.Errorf("the Zed remote server %s is missing from %s after decompression", version, ServerDir)
	}

	if _, err := user.Run(ctx, shell.User, "chmod", "0755", binary); err != nil {
		return err
	}

	return file.Chown(ctx, binary, shell.User, shell.User)
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

// A pinned version is downloaded as it is asked for; latest is resolved through the redirect, whose target names the release.
func resolve(ctx *modules.Context) (string, error) {
	wanted := strings.TrimSpace(ctx.String("version"))
	if wanted == "" {
		wanted = latest
	}

	if wanted != latest {
		return strings.TrimPrefix(wanted, "v"), nil
	}

	out, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", "/dev/null", "-w", "%{url_effective}", assetURL(latest))
	if err != nil {
		return "", err
	}

	version := versionOf(out)
	if version == "" {
		return "", fmt.Errorf("unreadable Zed version in %q", strings.TrimSpace(out))
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
