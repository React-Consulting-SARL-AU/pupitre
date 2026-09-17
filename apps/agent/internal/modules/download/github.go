package download

import (
	"encoding/json"
	"errors"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

// GitHubRelease is a tool published as one archive per platform on a GitHub
// release. The digest comes from the checksum document the vendor publishes
// beside the archives, or from the one GitHub computes for every asset when
// the vendor publishes none; either way the archive is refused unless it
// matches.
type GitHubRelease struct {
	Repo string
	// The file inside the archive and the name it is installed under.
	Program string
	// The checksum document on the release; empty when the vendor publishes none.
	Checksums string
	// The archive for this machine, named from the version the release carries.
	Asset func(version string) string
}

func (r GitHubRelease) Latest(ctx *modules.Context) (string, error) {
	return LatestVersion(ctx, "https://github.com/"+r.Repo+"/releases/latest/download/"+r.assetHint())
}

func (r GitHubRelease) assetHint() string {
	if r.Checksums != "" {
		return r.Checksums
	}

	return r.Asset("latest")
}

func (r GitHubRelease) assetURL(version, name string) string {
	return "https://github.com/" + r.Repo + "/releases/download/v" + version + "/" + name
}

// Binary fetches one asset of version that is the program itself, checks it, and puts it at destination as root.
func (r GitHubRelease) Binary(ctx *modules.Context, version, destination string) error {
	name := r.Asset(version)

	expected, err := r.digest(ctx, version, name)
	if err != nil {
		return err
	}

	staged, done, err := Verified(ctx, name, r.assetURL(version, name), expected)
	if err != nil {
		return err
	}
	defer done()

	return Install(ctx, staged, destination, 0o755, "root")
}

// Digest is what GitHub, or the vendor's checksum document, says of one asset of version.
func (r GitHubRelease) Digest(ctx *modules.Context, version, name string) (string, error) {
	return r.digest(ctx, version, name)
}

func (r GitHubRelease) digest(ctx *modules.Context, version, name string) (string, error) {
	if r.Checksums != "" {
		document, err := Text(ctx, r.assetURL(version, r.Checksums))
		if err != nil {
			return "", err
		}

		published, found := Published(document, name)
		if !found {
			return "", errors.New(i18n.T("modules.download.checksum_unpublished", name, r.Checksums))
		}

		return published, nil
	}

	raw, err := Text(ctx, "https://api.github.com/repos/"+r.Repo+"/releases/tags/v"+version)
	if err != nil {
		return "", err
	}

	var release struct {
		Assets []struct {
			Name   string `json:"name"`
			Digest string `json:"digest"`
		} `json:"assets"`
	}
	if err := json.Unmarshal([]byte(raw), &release); err != nil {
		return "", errors.New(i18n.T("modules.download.version_unreadable", r.Repo, strings.TrimSpace(raw)))
	}

	for _, asset := range release.Assets {
		if asset.Name == name && strings.HasPrefix(asset.Digest, "sha256:") {
			return strings.TrimPrefix(asset.Digest, "sha256:"), nil
		}
	}

	return "", errors.New(i18n.T("modules.download.checksum_unpublished", name, "v"+version))
}

// Install fetches the archive of version, checks it, and puts the program at destination as root.
func (r GitHubRelease) Install(ctx *modules.Context, version, destination string) error {
	name := r.Asset(version)

	expected, err := r.digest(ctx, version, name)
	if err != nil {
		return err
	}

	staged, done, err := Verified(ctx, name, r.assetURL(version, name), expected)
	if err != nil {
		return err
	}
	defer done()

	unpacked := Dir + "/" + r.Program + "-" + version
	defer sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-rf", unpacked}})

	if err := ctx.Sys().MkdirAll(unpacked, 0o700); err != nil {
		return err
	}

	if err := Extract(ctx, staged, unpacked, 0, ""); err != nil {
		return err
	}

	binary := unpacked + "/" + r.Program
	if !file.Exists(ctx, binary) {
		return errors.New(i18n.T("modules.download.missing_after_extract", r.Program, name))
	}

	return Install(ctx, binary, destination, 0o755, "root")
}

// InstallStep puts the latest release at destination unless a version is already recorded for id.
func (r GitHubRelease) InstallStep(ctx *modules.Context, id, destination string) error {
	return ctx.Step("install-"+r.Program, func() (modules.Outcome, error) {
		if Recorded(ctx, id) != "" && file.Exists(ctx, destination) {
			return modules.Skipped, nil
		}

		version, err := r.Latest(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if err := r.Install(ctx, version, destination); err != nil {
			return modules.Failed, err
		}

		return modules.Done, Record(ctx, id, version)
	})
}

func (r GitHubRelease) UpgradeStep(ctx *modules.Context, id, destination string) error {
	return ctx.Step("upgrade-"+r.Program, func() (modules.Outcome, error) {
		installed := Recorded(ctx, id)
		if installed == "" {
			return modules.Skipped, nil
		}

		version, err := r.Latest(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if version == installed {
			return modules.Skipped, nil
		}

		if err := r.Install(ctx, version, destination); err != nil {
			return modules.Failed, err
		}

		return modules.Done, Record(ctx, id, version)
	})
}

func (r GitHubRelease) RemoveStep(ctx *modules.Context, id, destination string) error {
	return ctx.Step("remove-"+r.Program, func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, destination)
		if err != nil {
			return modules.Failed, err
		}

		forgotten, err := Forget(ctx, id)
		if err != nil {
			return modules.Failed, err
		}

		if !removed && !forgotten {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}
