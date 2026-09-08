package vscode

import (
	"encoding/json"
	"fmt"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const updateURL = "https://update.code.visualstudio.com"

// The server folder is named after the commit of the build, which is exactly what Remote SSH looks for before deciding to download one.
type release struct {
	Commit  string `json:"commit"`
	Version string `json:"version"`
}

func resolve(ctx *modules.Context) (release, error) {
	out, err := user.Run(ctx, shell.User, "curl", "-fsSL", "--proto", "=https", "--tlsv1.2", updateURL+"/api/update/linux-"+arch()+"/stable/latest")
	if err != nil {
		return release{}, err
	}

	var answer struct {
		Version        string `json:"version"`
		ProductVersion string `json:"productVersion"`
	}
	if err := json.Unmarshal([]byte(out), &answer); err != nil || answer.Version == "" {
		return release{}, fmt.Errorf("unreadable answer from %s", updateURL)
	}

	return release{Commit: answer.Version, Version: answer.ProductVersion}, nil
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

// Remote SSH of the last releases looks under cli/servers, older ones under bin: one extraction, both layouts.
func (r release) serverLink() string {
	return cliServers + "/Stable-" + r.Commit + "/server"
}

func serverURL(commit string) string {
	return updateURL + "/commit:" + commit + "/server-linux-" + arch() + "/stable"
}

func cliURL() string {
	return updateURL + "/latest/cli-linux-" + arch() + "/stable"
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
