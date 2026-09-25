package tmux

import (
	"os"
	"os/user"
	"path/filepath"
	"testing"

	"pupitre.studio/agent/internal/sys"
)

type onDisk struct{}

func (onDisk) Sys() sys.Sys                         { return sys.Real{} }
func (onDisk) Logf(string, ...any)                  {}
func (onDisk) Once(_ string, fn func() error) error { return fn() }

func TestMarkNeverFollowsALinkPlantedInTheJournals(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("a link planted by root is one root may follow")
	}

	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}

	logs := filepath.Join(t.TempDir(), ".pupitre", "logs")
	outside := t.TempDir()
	secret := filepath.Join(outside, "cron")
	if err := os.WriteFile(secret, []byte("root:secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Join(logs, "api"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(outside, filepath.Join(logs, "web")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(secret, filepath.Join(logs, "api", "api.log")); err != nil {
		t.Fatal(err)
	}

	options := Options{User: me.Username, LogDir: logs}

	if err := mark(onDisk{}, options, "web/web", "=== up ==="); err == nil {
		t.Fatal("a project folder that is a link must be refused")
	}

	if err := mark(onDisk{}, options, "api/api", "=== up ==="); err == nil {
		t.Fatal("a journal that is a link must be refused")
	}

	if got, err := os.ReadFile(secret); err != nil || string(got) != "root:secret\n" {
		t.Fatalf("the target must be left alone: %q, %v", got, err)
	}

	if entries, _ := os.ReadDir(outside); len(entries) != 1 {
		t.Fatalf("nothing may land where the link leads: %v", entries)
	}

	if _, err := user.LookupGroup(me.Username); err != nil {
		return
	}

	if err := mark(onDisk{}, options, "shop/shop", "=== up ==="); err != nil {
		t.Fatal(err)
	}

	if got, err := os.ReadFile(filepath.Join(logs, "shop", "shop.log")); err != nil || string(got) != "\n=== up ===\n" {
		t.Fatalf("a journal of its own is marked: %q, %v", got, err)
	}
}
