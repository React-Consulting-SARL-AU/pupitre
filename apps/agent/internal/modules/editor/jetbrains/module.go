package jetbrains

import (
	"errors"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	// The folder JetBrains Gateway inspects for an already installed backend; a distribution laid anywhere else is downloaded again.
	CacheDir = shell.Home + "/.cache/JetBrains/RemoteDev/dist"

	markerName = ".installed.txt"
	buildName  = "build.txt"
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	dist := distDir(ctx)
	if !file.Exists(ctx, dist) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: file.Exists(ctx, dist+"/"+markerName) && file.Exists(ctx, optionsPath(ctx)),
		Version:    installedBuild(ctx),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-backend", func() (modules.Outcome, error) {
		if file.Exists(ctx, distDir(ctx)) {
			return modules.Skipped, nil
		}

		found, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		return modules.Done, installBackend(ctx, found)
	})
}

func installBackend(ctx *modules.Context, found release) error {
	dist := distDir(ctx)

	for _, dir := range []string{CacheDir, dist} {
		if err := ctx.Sys().MkdirAll(dir, 0o755); err != nil {
			return err
		}

		if err := file.Chown(ctx, dir, shell.User, shell.User); err != nil {
			return err
		}
	}

	digest, err := publishedDigest(ctx, found)
	if err != nil {
		return err
	}

	staged, done, err := download.Verified(ctx, archiveName(ctx), found.link, digest)
	if err != nil {
		return err
	}
	defer done()

	if err := download.Extract(ctx, staged, dist, 1, shell.User); err != nil {
		return err
	}

	if !file.Exists(ctx, dist) {
		return errors.New(i18n.T("modules.jetbrains.missing_after_extract", found.version, dist))
	}

	return nil
}

func (Module) Configure(ctx *modules.Context) error {
	if err := writeOptions(ctx); err != nil {
		return err
	}

	return markInstalled(ctx)
}

func writeOptions(ctx *modules.Context) error {
	return ctx.Step("write-vmoptions", func() (modules.Outcome, error) {
		path := optionsPath(ctx)
		content := vmoptions(heapMB(ctx))

		if file.Same(ctx, path, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(distDir(ctx)+"/bin", 0o755); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, path, content, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, path, shell.User, shell.User)
	})
}

// Gateway takes a distribution carrying this marker as fully extracted, and offers it instead of downloading its own.
func markInstalled(ctx *modules.Context) error {
	return ctx.Step("mark-backend", func() (modules.Outcome, error) {
		dist := distDir(ctx)
		marker := dist + "/" + markerName
		content := []byte(dist + "\n")

		if file.Same(ctx, marker, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, marker, content, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, marker, shell.User, shell.User)
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-backend", func() (modules.Outcome, error) {
		found, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if strings.HasSuffix(installedBuild(ctx), found.build) {
			return modules.Skipped, nil
		}

		if err := remove(ctx); err != nil {
			return modules.Failed, err
		}

		return modules.Done, installBackend(ctx, found)
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The dist folder is Gateway's; only the distribution this module laid there goes.
func (Module) Uninstall(ctx *modules.Context) error {
	return ctx.Step("remove-backend", func() (modules.Outcome, error) {
		if !file.Exists(ctx, distDir(ctx)) {
			return modules.Skipped, nil
		}

		return modules.Done, remove(ctx)
	})
}

func remove(ctx *modules.Context) error {
	_, err := user.Run(ctx, shell.User, "rm", "-rf", distDir(ctx))

	return err
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

// One folder per IDE and per requested version, so Gateway lists what it can open and a replay finds it without asking JetBrains anything.
func distDir(ctx *modules.Context) string {
	return CacheDir + "/" + ctx.String("ide") + "-" + wantedVersion(ctx)
}

func optionsPath(ctx *modules.Context) string {
	return distDir(ctx) + "/bin/" + chosen(ctx).product + "64.vmoptions"
}

func archiveName(ctx *modules.Context) string {
	return "jetbrains-" + ctx.String("ide") + ".tar.gz"
}

func installedBuild(ctx *modules.Context) string {
	raw, err := file.Read(ctx, distDir(ctx)+"/"+buildName)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}
