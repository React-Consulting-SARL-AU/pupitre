package redis

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/query"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys/apt"
)

const (
	loopback = "127.0.0.1"

	// redis.conf's own default, which the module leaves alone.
	databases = 16

	// --no-raw marks an error reply so, whatever redis-cli's exit code says about the last one.
	errorReply = "(error) "
)

// The default user is the only one, so the module's password; the commands go on stdin, one per line.
func Query(ctx *modules.Context, name, statement string) (query.Result, error) {
	if !apt.Installed(ctx, pkg) {
		return query.Result{}, modules.NotInstalled(ID, "Redis")
	}

	argv := []string{"redis-cli", "--no-auth-warning", "--no-raw", "-h", loopback, "-p", strconv.Itoa(port(ctx))}

	if name != "" {
		index, err := strconv.Atoi(name)
		if err != nil || index < 0 || index >= databases || strconv.Itoa(index) != name {
			return query.Result{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("db.redis.index.invalid", name)).
				WithFix(i18n.T("db.redis.index.invalid.fix", databases-1))
		}

		argv = append(argv, "-n", name)
	}

	result := query.Run(ctx, query.Client{
		Argv:  argv,
		Stdin: statement,
		Env:   []string{"REDISCLI_AUTH=" + ctx.Secret("password")},
	})

	if replied(result.Output, errorReply) {
		result.Failed = true
	}

	return result, nil
}

func replied(output, prefix string) bool {
	for line := range strings.SplitSeq(output, "\n") {
		if strings.HasPrefix(line, prefix) {
			return true
		}
	}

	return false
}
