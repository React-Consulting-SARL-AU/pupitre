package jetbrains

import (
	"errors"
	"path"
	"regexp"
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
	// Gateway looks for an installed backend here only; anywhere else it downloads its own again.
	CacheDir = shell.Home + "/.cache/JetBrains/RemoteDev/dist"

	markerName    = ".installed.txt"
	buildName     = "build.txt"
	partialSuffix = ".partial"
)

var ourVersion = regexp.MustCompile(contract.PatternVersionOrLatest)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	build := installedBuild(ctx)
	if build == "" {
		return modules.Status{}, nil
	}

	dist := distDir(ctx)

	return modules.Status{
		Installed:  true,
		Configured: file.Exists(ctx, dist+"/"+markerName) && file.Exists(ctx, optionsPath(ctx)),
		Version:    build,
		Path:       dist,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-backend", func() (modules.Outcome, error) {
		if installedBuild(ctx) != "" {
			return modules.Skipped, nil
		}

		found, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		return modules.Done, installBackend(ctx, found)
	})
}

// Extracted beside the dist and moved in whole: a cut-short download never passes for a backend, and an upgrade keeps the old one.
func installBackend(ctx *modules.Context, found release) error {
	dist := distDir(ctx)
	partial := dist + partialSuffix

	if err := file.MkdirOwned(ctx, CacheDir, shell.User, shell.User, 0o755); err != nil {
		return err
	}

	if _, err := user.Run(ctx, shell.User, "rm", "-rf", partial); err != nil {
		return err
	}

	if err := file.MkdirOwned(ctx, partial, shell.User, shell.User, 0o755); err != nil {
		return err
	}

	if err := extractInto(ctx, found, partial); err != nil {
		user.Run(ctx, shell.User, "rm", "-rf", partial)

		return err
	}

	if err := remove(ctx); err != nil {
		return err
	}

	return ctx.Sys().RenameIn(CacheDir, path.Base(partial), path.Base(dist))
}

func extractInto(ctx *modules.Context, found release, dir string) error {
	digest, err := publishedDigest(ctx, found)
	if err != nil {
		return err
	}

	staged, done, err := download.Verified(ctx, archiveName(ctx), found.link, digest)
	if err != nil {
		return err
	}
	defer done()

	if err := download.Extract(ctx, staged, dir, 1, shell.User); err != nil {
		return err
	}

	if !file.Exists(ctx, dir+"/"+buildName) {
		return errors.New(i18n.T("modules.jetbrains.missing_after_extract", found.version, dir))
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

// Gateway takes a distribution with this marker as fully extracted and offers it instead of downloading its own.
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

		return modules.Done, installBackend(ctx, found)
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// Only the distributions this module laid go, under any IDE and version; what Gateway downloaded itself stays.
func (Module) Uninstall(ctx *modules.Context) error {
	return ctx.Step("remove-backend", func() (modules.Outcome, error) {
		laid := laidDistributions(ctx)
		if len(laid) == 0 {
			return modules.Skipped, nil
		}

		for _, dist := range laid {
			if _, err := user.Run(ctx, shell.User, "rm", "-rf", dist); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})
}

// Ours are named <ide>-<version>; Gateway names its own after the build.
func laidDistributions(ctx *modules.Context) []string {
	entries, err := ctx.Sys().ReadDir(CacheDir)
	if err != nil {
		return nil
	}

	var laid []string

	for _, entry := range entries {
		ide, version, found := strings.Cut(entry.Name, "-")
		if _, offered := ides[ide]; !entry.Dir || !found || !offered || !ourVersion.MatchString(version) {
			continue
		}

		laid = append(laid, CacheDir+"/"+entry.Name)
	}

	return laid
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

// Named after the requested version, not the build, so a replay finds it without asking JetBrains.
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
