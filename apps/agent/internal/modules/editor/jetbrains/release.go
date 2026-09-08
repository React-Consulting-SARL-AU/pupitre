package jetbrains

import (
	"encoding/json"
	"fmt"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	latest      = "latest"
	releasesURL = "https://data.services.jetbrains.com/products/releases"
)

type ide struct {
	code    string
	product string
}

// The product code is what the release index answers to; the product name is what the launcher and its .vmoptions are called inside the archive.
var ides = map[string]ide{
	"idea":     {code: "IIU", product: "idea"},
	"webstorm": {code: "WS", product: "webstorm"},
	"pycharm":  {code: "PCP", product: "pycharm"},
	"phpstorm": {code: "PS", product: "phpstorm"},
	"goland":   {code: "GO", product: "goland"},
}

type release struct {
	version string
	build   string
	link    string
}

type indexEntry struct {
	Version   string `json:"version"`
	Build     string `json:"build"`
	Downloads map[string]struct {
		Link string `json:"link"`
	} `json:"downloads"`
}

func chosen(ctx *modules.Context) (ide, error) {
	key := ctx.String("ide")

	found, known := ides[key]
	if !known {
		return ide{}, fmt.Errorf("IDE inconnu : %s", key)
	}

	return found, nil
}

func wantedVersion(ctx *modules.Context) string {
	version := strings.TrimSpace(ctx.String("version"))
	if version == "" {
		return latest
	}

	return version
}

func resolve(ctx *modules.Context) (release, error) {
	selected, err := chosen(ctx)
	if err != nil {
		return release{}, err
	}

	wanted := wantedVersion(ctx)

	out, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", indexURL(selected, wanted))
	if err != nil {
		return release{}, err
	}

	var index map[string][]indexEntry
	if err := json.Unmarshal([]byte(out), &index); err != nil {
		return release{}, fmt.Errorf("unreadable JetBrains version index for %s", selected.code)
	}

	for _, entry := range index[selected.code] {
		if wanted != latest && entry.Version != wanted && !strings.HasPrefix(entry.Version, wanted+".") {
			continue
		}

		link := entry.Downloads[platform()].Link
		if link == "" {
			continue
		}

		return release{version: entry.Version, build: entry.Build, link: link}, nil
	}

	return release{}, fmt.Errorf("no %s version of %s for this machine", wanted, selected.code)
}

func indexURL(selected ide, wanted string) string {
	url := releasesURL + "?code=" + selected.code + "&type=release"
	if wanted == latest {
		return url + "&latest=true"
	}

	return url
}

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "linuxARM64"
	}

	return "linux"
}
