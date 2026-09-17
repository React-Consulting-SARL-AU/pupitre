package modtest

import (
	"strconv"
	"testing"
	"time"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/net"
)

// The fake writes as the real system does: the mode asked for is the mode the
// file gets, an existing file included, and KeepMode alone leaves it as it was.
func TestWriteFileHonoursTheModeAskedForAndKeepsItOnRequest(t *testing.T) {
	fake := NewFakeSys()

	if err := fake.WriteFile("/etc/demo.conf", []byte("a\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := fake.WriteFile("/etc/demo.conf", []byte("b\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if fake.Modes["/etc/demo.conf"] != 0o600 {
		t.Fatalf("a file left too open must be tightened by the write that asks for it: %o", fake.Modes["/etc/demo.conf"])
	}

	if err := fake.WriteFile("/etc/demo.conf", []byte("c\n"), sys.KeepMode); err != nil {
		t.Fatal(err)
	}
	if fake.Modes["/etc/demo.conf"] != 0o600 {
		t.Fatalf("KeepMode must leave the mode as it was: %o", fake.Modes["/etc/demo.conf"])
	}

	if err := fake.WriteFile("/etc/new.conf", []byte("d\n"), sys.KeepMode); err != nil {
		t.Fatal(err)
	}
	if fake.Modes["/etc/new.conf"] != sys.DefaultMode {
		t.Fatalf("a new file written at KeepMode gets the default: %o", fake.Modes["/etc/new.conf"])
	}
}

// A link under a root is written through to its target, which keeps its mode and owner; one that leaves the root is refused.
func TestWriteFileInWritesThroughALinkThatStaysUnderTheRoot(t *testing.T) {
	fake := NewFakeSys()
	fake.Files["/home/dev/projects/shop/.env"] = []byte("A=1\n")
	fake.Modes["/home/dev/projects/shop/.env"] = 0o600
	fake.Owners["/home/dev/projects/shop/.env"] = "dev:dev"
	fake.Links["/home/dev/projects/shop/env.link"] = ".env"
	fake.Links["/home/dev/projects/shop/escape"] = "../../../../etc/shadow"

	if err := fake.WriteFileIn("/home/dev/projects", "shop/env.link", "root", []byte("A=2\n")); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files["/home/dev/projects/shop/.env"]) != "A=2\n" || fake.Modes["/home/dev/projects/shop/.env"] != 0o600 || fake.Owners["/home/dev/projects/shop/.env"] != "dev:dev" {
		t.Fatalf("the target must carry the content at its own mode and owner: %q %o %s", fake.Files["/home/dev/projects/shop/.env"], fake.Modes["/home/dev/projects/shop/.env"], fake.Owners["/home/dev/projects/shop/.env"])
	}
	if _, became := fake.Files["/home/dev/projects/shop/env.link"]; became || fake.Links["/home/dev/projects/shop/env.link"] != ".env" {
		t.Fatal("the link must stay a link")
	}

	if err := fake.WriteFileIn("/home/dev/projects", "shop/escape", "root", []byte("x")); err == nil {
		t.Fatal("a link that leaves the root must be refused")
	}
	if _, written := fake.Files["/etc/shadow"]; written {
		t.Fatal("nothing may be written outside the root")
	}
}

func TestRangedReadsFollowTheRealSystem(t *testing.T) {
	fake := NewFakeSys()
	fake.Files["/var/log/app.log"] = []byte("0123456789")

	if tail, err := fake.ReadTail("/var/log/app.log", 3); err != nil || string(tail) != "789" {
		t.Fatalf("tail = %q, %v", tail, err)
	}
	if whole, err := fake.ReadTail("/var/log/app.log", 30); err != nil || string(whole) != "0123456789" {
		t.Fatalf("a short file is read whole: %q, %v", whole, err)
	}
	if rest, err := fake.ReadFrom("/var/log/app.log", 7); err != nil || string(rest) != "789" {
		t.Fatalf("from = %q, %v", rest, err)
	}
	if again, err := fake.ReadFrom("/var/log/app.log", 40); err != nil || string(again) != "0123456789" {
		t.Fatalf("a truncated file is read from its start: %q, %v", again, err)
	}

	var _ sys.Ranged = fake
}

// The ports the fake listens on are readable the way the kernel prints them, so sys/net answers on the fake as on the machine.
func TestListenIsRenderedIntoTheKernelTable(t *testing.T) {
	fake := NewFakeSys()
	fake.Listen[5432] = true
	fake.Listen[3000] = true

	ports := net.Listening(silent{fake})
	if !ports.Has(5432) || !ports.Has(3000) || ports.Has(22) {
		t.Fatalf("ports = %v", ports)
	}
}

// The idleness reader lists every pane with its pid and when it last moved; a window a test declares idle moved then.
func TestListPanesAllAnswersPidAndActivity(t *testing.T) {
	fake := NewFakeSys()
	fake.Sessions["pupitre"] = true
	fake.Now = time.Date(2026, time.September, 17, 12, 0, 0, 0, time.UTC)
	if _, err := fake.Run(sys.Command{Argv: []string{"tmux", "new-window", "-t", "=pupitre", "-n", "shop/web"}}); err != nil {
		t.Fatal(err)
	}
	fake.Activity["shop/web"] = fake.Now.Add(-3 * time.Hour)

	out, err := fake.Run(sys.Command{Argv: []string{"tmux", "list-panes", "-a", "-F", "#{pane_pid} #{window_activity}"}})
	if err != nil {
		t.Fatal(err)
	}

	want := "4000 " + strconv.FormatInt(fake.Now.Add(-3*time.Hour).Unix(), 10) + "\n"
	if out.Stdout != want {
		t.Fatalf("list-panes -a = %q, want %q", out.Stdout, want)
	}
}

// tmux takes a leading "=" for an exact target: the fake accepts it on the session and on the window alike.
func TestExactTargetsAreAccepted(t *testing.T) {
	fake := NewFakeSys()
	fake.Sessions["pupitre"] = true

	for _, argv := range [][]string{
		{"tmux", "has-session", "-t", "=pupitre"},
		{"tmux", "new-window", "-t", "=pupitre", "-n", "shop/web"},
		{"tmux", "list-panes", "-s", "-t", "=pupitre"},
		{"tmux", "kill-window", "-t", "=pupitre:=shop/web"},
	} {
		if _, err := fake.Run(sys.Command{Argv: argv}); err != nil {
			t.Fatalf("%v: %v", argv, err)
		}
	}

	if _, open := fake.Windows["shop/web"]; open {
		t.Fatal("the exact window target must close the window")
	}
}

type silent struct {
	sys sys.Sys
}

func (s silent) Sys() sys.Sys                         { return s.sys }
func (s silent) Logf(string, ...any)                  {}
func (s silent) Once(_ string, fn func() error) error { return fn() }
