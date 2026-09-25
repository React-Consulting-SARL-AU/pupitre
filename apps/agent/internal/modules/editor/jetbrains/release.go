package jetbrains

import (
	"encoding/json"
	"errors"
	"path"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
)

const (
	latest      = "latest"
	releasesURL = "https://data.services.jetbrains.com/products/releases"
)

type ide struct {
	code    string
	product string
}

// code keys the release index; product names the launcher and its .vmoptions inside the archive.
var ides = map[string]ide{
	"idea":     {code: "IIU", product: "idea"},
	"webstorm": {code: "WS", product: "webstorm"},
	"pycharm":  {code: "PCP", product: "pycharm"},
	"phpstorm": {code: "PS", product: "phpstorm"},
	"goland":   {code: "GO", product: "goland"},
}

type release struct {
	version  string
	build    string
	link     string
	checksum string
}

type indexEntry struct {
	Version   string `json:"version"`
	Build     string `json:"build"`
	Downloads map[string]struct {
		Link         string `json:"link"`
		ChecksumLink string `json:"checksumLink"`
	} `json:"downloads"`
}

// The engine validates the field against the manifest's options first, so the key is always known.
func chosen(ctx *modules.Context) ide {
	return ides[ctx.String("ide")]
}

func wantedVersion(ctx *modules.Context) string {
	version := strings.TrimSpace(ctx.String("version"))
	if version == "" {
		return latest
	}

	return version
}

func resolve(ctx *modules.Context) (release, error) {
	selected := chosen(ctx)
	wanted := wantedVersion(ctx)

	out, err := download.Text(ctx, indexURL(selected, wanted))
	if err != nil {
		return release{}, err
	}

	var index map[string][]indexEntry
	if err := json.Unmarshal([]byte(out), &index); err != nil {
		return release{}, errors.New(i18n.T("modules.jetbrains.index_unreadable", selected.code))
	}

	for _, entry := range index[selected.code] {
		if wanted != latest && entry.Version != wanted && !strings.HasPrefix(entry.Version, wanted+".") {
			continue
		}

		found := entry.Downloads[platform()]
		if found.Link == "" {
			continue
		}

		return release{version: entry.Version, build: entry.Build, link: found.Link, checksum: found.ChecksumLink}, nil
	}

	return release{}, errors.New(i18n.T("modules.jetbrains.version_missing", wanted, selected.code))
}

// An entry without its published .sha256 is refused rather than trusted on the transport alone.
func publishedDigest(ctx *modules.Context, found release) (string, error) {
	if found.checksum == "" {
		return "", errors.New(i18n.T("modules.download.checksum_unpublished", path.Base(found.link), releasesURL))
	}

	document, err := download.Text(ctx, found.checksum)
	if err != nil {
		return "", err
	}

	digest, published := download.Published(document, "")
	if !published {
		return "", errors.New(i18n.T("modules.download.checksum_unpublished", path.Base(found.link), found.checksum))
	}

	return digest, nil
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
