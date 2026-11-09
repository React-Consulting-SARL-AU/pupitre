package infisical

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

// The order the CLI reads them in: the YAML file wins over the legacy JSON one.
var ConfigNames = []string{".infisical.yaml", ".infisical.json"}

const exportTimeout = time.Minute

var (
	projectIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]+$`)
	yamlProjectID    = regexp.MustCompile(`(?m)^\s+project-id:\s*["']?([A-Za-z0-9-]+)["']?\s*(#.*)?$`)
)

func Ready(ctx *modules.Context) bool {
	return file.Exists(ctx, BinPath) && stored(ctx).complete()
}

// A machine identity's CLI ignores the file's project, so it is read here and handed over; environment, folder and branch overrides it still reads itself.
func ProjectID(name string, raw []byte) string {
	if strings.HasSuffix(name, ".json") {
		var config struct {
			WorkspaceID string `json:"workspaceId"`
		}

		if json.Unmarshal(raw, &config) != nil || !projectIDPattern.MatchString(config.WorkspaceID) {
			return ""
		}

		return config.WorkspaceID
	}

	match := yamlProjectID.FindSubmatch(raw)
	if match == nil {
		return ""
	}

	return string(match[1])
}

// Run in the folder that holds the project's file; the secrets come back on stdout, never journalled, and the access token rides the environment, never argv.
func Export(ctx *modules.Context, dir, projectID string) ([]byte, error) {
	held := stored(ctx)

	accessToken, err := accessToken(ctx, held)
	if err != nil {
		return nil, err
	}

	environment := append(user.Environment(shell.User), held.environment()...)
	environment = append(environment, "INFISICAL_TOKEN="+accessToken, "INFISICAL_PROJECT_ID="+projectID)

	out, err := modules.Quiet(ctx, sys.Command{
		User:    shell.User,
		Dir:     dir,
		Argv:    []string{Program, "secrets-manager", "secrets", "export", "--format=dotenv", "--silent"},
		Env:     environment,
		Timeout: exportTimeout,
	})
	if err != nil {
		return nil, err
	}

	return []byte(out.Stdout), nil
}
