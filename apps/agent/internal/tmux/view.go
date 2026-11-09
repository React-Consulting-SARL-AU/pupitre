package tmux

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
)

const (
	viewPrefix      = "pupitre-view-"
	viewPlaceholder = "placeholder"

	// The viewer turns destroy-unattached on once attached: set any earlier, tmux ends the session on the spot.
	viewArrival = time.Minute
)

// A session of its own holding only the process's window, so each viewer sizes it and sees nothing else.
func Attach(ctx sys.Context, options Options, window string) (string, error) {
	options = options.Resolved()

	pane, open := windows(ctx, options)[window]
	if !open {
		return "", protocol.NewError(contract.ErrorProjectNotFound, i18n.T("tmux.window.none", window)).
			WithFix(i18n.T("tmux.window.none.fix"))
	}

	sweepViews(ctx, options)

	session, err := viewName()
	if err != nil {
		return "", err
	}

	// cat holds the placeholder open until it is killed, so it never ends the session first.
	_, err = sys.Exec(ctx, options.tmux(
		"new-session", "-d", "-s", session, "-n", viewPlaceholder, "cat",
		";", "link-window", "-s", pane.ID, "-t", "="+session+":",
		";", "kill-window", "-t", "="+session+":="+viewPlaceholder,
	))
	if err != nil {
		return "", err
	}

	return session, nil
}

func viewName() (string, error) {
	random := make([]byte, 4)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}

	return viewPrefix + hex.EncodeToString(random), nil
}

// A viewer that never came, after a lost connection or a crash, would otherwise keep its session forever.
func sweepViews(ctx sys.Context, options Options) {
	out, err := ctx.Sys().Run(options.tmux("list-sessions", "-F", "#{session_name}|#{session_attached}|#{session_created}"))
	if err != nil {
		return
	}

	limit := options.Now().Add(-viewArrival).Unix()

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Split(line, "|")
		if len(fields) != 3 || !strings.HasPrefix(fields[0], viewPrefix) || fields[1] != "0" {
			continue
		}

		created, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil || created > limit {
			continue
		}

		_, _ = ctx.Sys().Run(options.tmux("kill-session", "-t", "="+fields[0]))
	}
}
