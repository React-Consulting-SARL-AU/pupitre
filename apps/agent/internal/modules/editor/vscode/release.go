package vscode

import (
	"encoding/json"
	"errors"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/sys/file"
)

const updateURL = "https://update.code.visualstudio.com"

// The server folder is named after the build's commit, which Remote SSH looks for before downloading its own.
type release struct {
	Commit  string `json:"commit"`
	Version string `json:"version"`

	url    string
	sha256 string
}

func latest(ctx *modules.Context, build string) (release, error) {
	out, err := download.Text(ctx, updateURL+"/api/update/"+build+"/stable/latest")
	if err != nil {
		return release{}, err
	}

	var answer struct {
		URL            string `json:"url"`
		Version        string `json:"version"`
		ProductVersion string `json:"productVersion"`
		SHA256         string `json:"sha256hash"`
	}
	if err := json.Unmarshal([]byte(out), &answer); err != nil || answer.Version == "" || answer.URL == "" || len(answer.SHA256) != 64 {
		return release{}, errors.New(i18n.T("modules.vscode.update_unreadable", updateURL))
	}

	return release{Commit: answer.Version, Version: answer.ProductVersion, url: answer.URL, sha256: answer.SHA256}, nil
}

func resolve(ctx *modules.Context) (release, error) {
	return latest(ctx, "server-linux-"+arch())
}

// A replay keeps the build on the machine; only upgrade fetches a newer one.
func pinned(ctx *modules.Context) (release, error) {
	if kept := recorded(ctx); kept.Commit != "" && file.Exists(ctx, kept.serverCLI()) {
		return kept, nil
	}

	return resolve(ctx)
}

func cli(ctx *modules.Context) (release, error) {
	return latest(ctx, "cli-linux-"+arch())
}

func recorded(ctx *modules.Context) release {
	raw, err := file.Read(ctx, pointerPath)
	if err != nil {
		return release{}
	}

	var found release
	if err := json.Unmarshal(raw, &found); err != nil {
		return release{}
	}

	return found
}

func (r release) record() []byte {
	content, _ := json.Marshal(r)

	return append(content, '\n')
}

func (r release) serverDir() string {
	return binRoot + "/" + r.Commit
}

func (r release) serverCLI() string {
	return r.serverDir() + "/bin/code-server"
}

// Recent Remote SSH looks under cli/servers, older ones under bin: one extraction serves both.
func (r release) serverLink() string {
	return cliServers + "/Stable-" + r.Commit + "/server"
}

func arch() string {
	if runtime.GOARCH == "arm64" {
		return "arm64"
	}

	return "x64"
}

func extensions(ctx *modules.Context) []string {
	var wanted []string

	for _, entry := range ctx.StringList("extensions") {
		if trimmed := strings.TrimSpace(entry); trimmed != "" {
			wanted = append(wanted, trimmed)
		}
	}

	return wanted
}
