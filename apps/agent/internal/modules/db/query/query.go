package query

import (
	"bytes"
	"errors"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	AccessKey = "ai_access"

	// Past the engine's own statement timeout, so the engine cancels the statement and says so before the client is killed.
	clientGrace = 5 * time.Second
)

func AccessField() contract.Field {
	return contract.Field{
		Key:     AccessKey,
		Kind:    contract.FieldBoolean,
		Label:   i18n.T("module.db.ai_access.label"),
		Help:    i18n.T("module.db.ai_access.help"),
		Default: true,
	}
}

type Result struct {
	Output    string `json:"output"`
	Truncated bool   `json:"truncated"`
	Failed    bool   `json:"failed"`
}

// What a database's own client is handed; the statement rides stdin unless the client only reads it from argv.
type Client struct {
	Argv  []string
	Stdin string
	Env   []string
}

func Timeout() time.Duration {
	return time.Duration(contract.DbQuery.TimeoutMS) * time.Millisecond
}

// As dev, never root: psql's \!, mysql's system and mongosh's require each open a shell for whoever runs the client.
func Run(ctx sys.Context, client Client) Result {
	output := &capped{room: contract.DbQuery.OutputMaxBytes}
	home := user.Home(shell.User)

	out, err := sys.Exec(ctx, sys.Command{
		User:    shell.User,
		Argv:    client.Argv,
		Dir:     home,
		Stdin:   []byte(client.Stdin),
		Env:     append(user.Environment(shell.User), client.Env...),
		Output:  output,
		Timeout: Timeout() + clientGrace,
	})

	result := Result{Output: output.text(), Truncated: output.cut}
	if err == nil {
		return result
	}

	result.Failed = true
	result.Output = joined(result.Output, failure(out, err))

	return result
}

func failure(out sys.Output, err error) string {
	var exit *sys.ExitError
	if errors.As(err, &exit) && strings.TrimSpace(out.Stderr) != "" {
		return out.Stderr
	}

	return err.Error()
}

func joined(output, failure string) string {
	if strings.TrimSpace(output) == "" {
		return strings.TrimSpace(failure)
	}

	return strings.TrimRight(output, "\n") + "\n" + strings.TrimSpace(failure)
}

// Keeps draining past the cap: a client blocked on a full pipe would hold the call until the timeout.
type capped struct {
	kept bytes.Buffer
	room int
	cut  bool
}

func (c *capped) Write(chunk []byte) (int, error) {
	left := c.room - c.kept.Len()
	if len(chunk) > left {
		c.kept.Write(chunk[:max(left, 0)])
		c.cut = true

		return len(chunk), nil
	}

	c.kept.Write(chunk)

	return len(chunk), nil
}

// The cap may fall inside a character.
func (c *capped) text() string {
	return strings.ToValidUTF8(c.kept.String(), "")
}
