package tmux_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/tmux"
)

func TestAttachLinksTheProcessWindowAloneIntoASessionOfItsOwn(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	session, err := tmux.Attach(ctx, options, "web/web")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(session, "pupitre-view-") {
		t.Fatalf("a view session must say what it is: %q", session)
	}

	if view := fake.Views[session]; view.Window != "web/web" {
		t.Fatalf("the view must hold the process's window, got %+v", fake.Views)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "kill-window -t ="+session+":=placeholder") {
		t.Fatalf("the session's own window must go, or the viewer would see two:\n%s", commands)
	}

	other, err := tmux.Attach(ctx, options, "web/web")
	if err != nil {
		t.Fatal(err)
	}

	if other == session {
		t.Fatal("two viewers must never share a session: each one sizes its own")
	}
}

func TestAttachRefusesAProcessWithoutAWindow(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(fake)

	_, err := tmux.Attach(ctx, options, "web/web")

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorProjectNotFound || refusal.Fix == "" {
		t.Fatalf("a stopped process must be refused with its remedy, got %v", err)
	}
}

func TestAttachSweepsTheViewsNobodyCameFor(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)
	now := modtest.Epoch

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	for name, view := range map[string]modtest.FakeView{
		"pupitre-view-abandoned": {Window: "web/web", Created: now.Add(-2 * time.Minute)},
		"pupitre-view-watched":   {Window: "web/web", Created: now.Add(-2 * time.Minute), Attached: 1},
		"pupitre-view-arriving":  {Window: "web/web", Created: now.Add(-10 * time.Second)},
	} {
		fake.Sessions[name] = true
		fake.Views[name] = view
	}
	fake.Sessions["shell-intranet-t1"] = true

	if _, err := tmux.Attach(ctx, options, "web/web"); err != nil {
		t.Fatal(err)
	}

	if fake.Sessions["pupitre-view-abandoned"] {
		t.Fatal("a view nobody attached to within a minute must go")
	}

	for _, kept := range []string{"pupitre-view-watched", "pupitre-view-arriving", "shell-intranet-t1", "pupitre"} {
		if !fake.Sessions[kept] {
			t.Fatalf("%s must stay: it is watched, about to be, or not a view", kept)
		}
	}
}

func TestTheProcessesSessionIsBornWide(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Serves("web/web", 3000)
	ctx := newContext(fake)

	if err := tmux.Start(ctx, options, web()); err != nil {
		t.Fatal(err)
	}

	commands := strings.Join(fake.Commands(), "\n")
	if !strings.Contains(commands, "new-session -d -s pupitre -n scratch -c /home/dev/projects/web -x 200 -y 50") {
		t.Fatalf("a full-screen program drawn before anyone looks must not be drawn at 80×24:\n%s", commands)
	}
}
