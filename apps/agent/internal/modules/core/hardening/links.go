package hardening

import (
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	linksPath   = "/etc/sysctl.d/60-pupitre-links.conf"
	linksSysctl = "fs.protected_hardlinks = 1\nfs.protected_symlinks = 1\n"
	readOnly    = "Read-only file system"
)

var linkKnobs = []string{"/proc/sys/fs/protected_hardlinks", "/proc/sys/fs/protected_symlinks"}

// Root acts on dev's files, so the kernel must refuse a link dev plants to a file of root's.
func protectLinks(ctx *modules.Context) error {
	return ctx.Once("protect-links", func() error {
		return ctx.Step("protect-links", func() (modules.Outcome, error) {
			written, err := writeLinksSysctl(ctx)
			if err != nil {
				return modules.Failed, err
			}

			if linksProtected(ctx) {
				return doneIf(written), nil
			}

			if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"sysctl", "-q", "-p", linksPath}}); err != nil {
				if !strings.Contains(err.Error(), readOnly) {
					return modules.Failed, err
				}

				ctx.Warn(i18n.T("warn.hardening.links.deferred", linksPath))

				return doneIf(written), nil
			}

			return modules.Done, nil
		})
	})
}

func writeLinksSysctl(ctx *modules.Context) (bool, error) {
	if file.Same(ctx, linksPath, []byte(linksSysctl)) {
		return false, nil
	}

	return true, file.WriteAtomic(ctx, linksPath, []byte(linksSysctl), 0o644)
}

func linksProtected(ctx *modules.Context) bool {
	for _, knob := range linkKnobs {
		value, err := file.Read(ctx, knob)
		if err != nil || strings.TrimSpace(string(value)) != "1" {
			return false
		}
	}

	return true
}

func doneIf(changed bool) modules.Outcome {
	if changed {
		return modules.Done
	}

	return modules.Skipped
}

func removeLinksSysctl(ctx *modules.Context) error {
	return ctx.Step("remove-link-protections", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, linksPath)
		if err != nil {
			return modules.Failed, err
		}

		return doneIf(removed), nil
	})
}
