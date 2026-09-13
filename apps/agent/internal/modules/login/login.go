// Package login asks the CLI a module installed whether it is signed in, and under which account.
//
// Every CLI has a command for it — `gh auth status`, `claude auth status`,
// `wrangler whoami` — and that command is the only judge: the agent never
// reads a credential file to guess. The answer names an account when the CLI
// does, and says how to sign in when it holds nothing.
package login

import (
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/user"
)

// Timeout bounds a check that reaches the provider: service.status answers within it, signed in or not.
const Timeout = 20 * time.Second

// Ask runs the CLI's own check as the dev user, with the variables the CLI reads beyond that user's own.
func Ask(ctx sys.Context, env []string, argv ...string) (sys.Output, error) {
	return sys.Exec(ctx, sys.Command{
		User:    shell.User,
		Argv:    argv,
		Dir:     shell.Home,
		Env:     append(user.Environment(shell.User), env...),
		Timeout: Timeout,
	})
}

func SignedIn(account string) (contract.Login, bool) {
	return contract.Login{State: contract.LoginSignedIn, Account: account}, true
}

func SignedOut(fix string) (contract.Login, bool) {
	return contract.Login{State: contract.LoginSignedOut, Fix: fix}, true
}

func Unknown(fix string) (contract.Login, bool) {
	return contract.Login{State: contract.LoginUnknown, Fix: fix}, true
}
