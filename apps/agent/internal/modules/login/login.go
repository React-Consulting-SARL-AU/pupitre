package login

import (
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/user"
)

// The check reaches the provider; service.status must answer within it, signed in or not.
const Timeout = 20 * time.Second

// The CLI's own check (gh auth status…) is the only judge: never read a credential file to guess.
func Ask(ctx sys.Context, env []string, argv ...string) (sys.Output, error) {
	return modules.Quiet(ctx, sys.Command{
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
