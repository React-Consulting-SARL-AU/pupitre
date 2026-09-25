package opencode

import (
	"encoding/json"
	"errors"
	"regexp"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

// GitHub's release document names the version and each asset's SHA-256; a CPU without AVX2 gets the baseline build.
const (
	releaseURL = "https://api.github.com/repos/anomalyco/opencode/releases/latest"
	cpuInfo    = "/proc/cpuinfo"

	BinPath     = shell.Home + "/.local/bin/" + Program
	dataDir     = shell.Home + "/.local/share/" + Program
	pointerPath = dataDir + "/pupitre-release.txt"
)

var versionShape = regexp.MustCompile(`^\d+\.\d+\.\d+(-\S+)?$`)

type release struct {
	Tag    string `json:"tag_name"`
	Assets []struct {
		Name   string `json:"name"`
		Digest string `json:"digest"`
		URL    string `json:"browser_download_url"`
	} `json:"assets"`
}

type build struct {
	Version  string
	URL      string
	Checksum string
}

func assetName(ctx *modules.Context) string {
	if runtime.GOARCH == "arm64" {
		return Program + "-linux-arm64.tar.gz"
	}

	flags, _ := file.Read(ctx, cpuInfo)
	if !strings.Contains(string(flags), "avx2") {
		return Program + "-linux-x64-baseline.tar.gz"
	}

	return Program + "-linux-x64.tar.gz"
}

func installedVersion(ctx *modules.Context) string {
	if !file.Exists(ctx, BinPath) {
		return ""
	}

	raw, err := file.Read(ctx, pointerPath)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}

func latest(ctx *modules.Context) (build, error) {
	raw, err := download.Text(ctx, releaseURL)
	if err != nil {
		return build{}, err
	}

	var parsed release
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return build{}, errors.New(i18n.T("modules.opencode.version_unreadable", first(raw)))
	}

	version := strings.TrimPrefix(parsed.Tag, "v")
	if !versionShape.MatchString(version) {
		return build{}, errors.New(i18n.T("modules.opencode.version_unreadable", parsed.Tag))
	}

	name := assetName(ctx)

	for _, asset := range parsed.Assets {
		if asset.Name != name {
			continue
		}

		checksum := strings.TrimPrefix(asset.Digest, "sha256:")
		if len(checksum) != 64 {
			return build{}, errors.New(i18n.T("modules.download.checksum_unpublished", name, parsed.Tag))
		}

		return build{Version: version, URL: asset.URL, Checksum: checksum}, nil
	}

	return build{}, errors.New(i18n.T("modules.opencode.asset_missing", name, parsed.Tag))
}

func first(raw string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(raw), "\n")

	return line
}

func installBuild(ctx *modules.Context, wanted build) error {
	staged, done, err := download.Verified(ctx, Program+"-"+wanted.Version+".tar.gz", wanted.URL, wanted.Checksum)
	if err != nil {
		return err
	}
	defer done()

	unpacked := download.Dir + "/" + Program + "-" + wanted.Version
	defer sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-rf", unpacked}})

	if err := ctx.Sys().MkdirAll(unpacked, 0o700); err != nil {
		return err
	}

	if err := download.Extract(ctx, staged, unpacked, 0, ""); err != nil {
		return err
	}

	binary := unpacked + "/" + Program
	if !file.Exists(ctx, binary) {
		return errors.New(i18n.T("modules.opencode.missing_after_install", wanted.Version, unpacked))
	}

	if err := download.Install(ctx, binary, BinPath, 0o755, shell.User); err != nil {
		return err
	}

	return record(ctx, wanted.Version)
}

func record(ctx *modules.Context, version string) error {
	if err := file.MkdirOwned(ctx, dataDir, shell.User, shell.User, 0o755); err != nil {
		return err
	}

	if err := file.WriteAtomic(ctx, pointerPath, []byte(version+"\n"), 0o644); err != nil {
		return err
	}

	return file.Chown(ctx, pointerPath, shell.User, shell.User)
}

func installCLI(ctx *modules.Context) error {
	return ctx.Step("install-cli", func() (modules.Outcome, error) {
		if installedVersion(ctx) != "" {
			return modules.Skipped, nil
		}

		wanted, err := latest(ctx)
		if err != nil {
			return modules.Failed, err
		}

		return modules.Done, installBuild(ctx, wanted)
	})
}

func upgradeCLI(ctx *modules.Context) error {
	return ctx.Step("upgrade-cli", func() (modules.Outcome, error) {
		installed := installedVersion(ctx)
		if installed == "" {
			return modules.Skipped, nil
		}

		wanted, err := latest(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if wanted.Version == installed {
			return modules.Skipped, nil
		}

		return modules.Done, installBuild(ctx, wanted)
	})
}

func removeCLI(ctx *modules.Context) error {
	return ctx.Step("remove-cli", func() (modules.Outcome, error) {
		outcome := modules.Skipped

		for _, path := range []string{BinPath, pointerPath} {
			removed, err := file.Remove(ctx, path)
			if err != nil {
				return modules.Failed, err
			}

			if removed {
				outcome = modules.Done
			}
		}

		return outcome, nil
	})
}
