package java

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	gradleDir  = shell.Home + "/.gradle"
	gradlePath = gradleDir + "/gradle.properties"
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !mise.Present(ctx) {
		return modules.Status{}, nil
	}

	held := mise.Java.Held(ctx)
	if len(held) == 0 {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: shell.HasBlock(ctx, ID) && file.HasBlock(ctx, gradlePath, ID),
		Version:    mise.Java.Describe(ctx),
		Versions:   held,
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := mise.Ensure(ctx); err != nil {
		return err
	}

	_, err := mise.Java.Install(ctx)

	return err
}

func (Module) Configure(ctx *modules.Context) error {
	if err := shell.EnsureBlock(ctx, "write-shell-env", ID, block(home(ctx))); err != nil {
		return err
	}

	return ctx.Step("write-gradle-properties", func() (modules.Outcome, error) {
		if !file.Exists(ctx, gradleDir) {
			if err := ctx.Sys().MkdirAll(gradleDir, 0o755); err != nil {
				return modules.Failed, err
			}

			if err := file.Chown(ctx, gradleDir, shell.User, shell.User); err != nil {
				return modules.Failed, err
			}
		}

		changed, err := file.EnsureBlock(ctx, gradlePath, ID, gradleProperties(heapMB(ctx)))
		if err != nil {
			return modules.Failed, err
		}

		if !changed {
			return modules.Skipped, nil
		}

		return modules.Done, file.Chown(ctx, gradlePath, shell.User, shell.User)
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := mise.Java.Upgrade(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The Gradle caches and whatever the client added to gradle.properties stay; only this module's block goes.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := shell.RemoveBlock(ctx, "remove-shell-env", ID); err != nil {
		return err
	}

	if err := ctx.Step("remove-gradle-properties", func() (modules.Outcome, error) {
		removed, err := file.RemoveBlock(ctx, gradlePath, ID)
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

	return mise.Java.Uninstall(ctx)
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

func home(ctx *modules.Context) string {
	resolved := mise.Where(ctx, "java")
	if resolved == "" {
		ctx.Warn(i18n.T("warn.java.home.missing"))
	}

	return resolved
}

// JAVA_HOME is resolved by mise as each shell opens, so gradlew in a project pinned to another major finds that one and not the machine's default.
const javaHomeLine = `export JAVA_HOME="$(mise where java 2>/dev/null)"` + "\n"

func block(javaHome string) []byte {
	content := shell.PathLines(shell.LocalBin, shell.MiseShims)
	if javaHome != "" {
		content += javaHomeLine
	}

	return []byte(content)
}
