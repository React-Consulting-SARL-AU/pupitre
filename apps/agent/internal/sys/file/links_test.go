package file_test

import (
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

type onDisk struct{}

func (onDisk) Sys() sys.Sys                         { return sys.Real{} }
func (onDisk) Logf(string, ...any)                  {}
func (onDisk) Once(_ string, fn func() error) error { return fn() }

const planted = "# >>> pupitre system >>>\nroot:$6$secret\n# <<< pupitre system <<<\n"

func TestABlockNeverReadsNorWritesThroughALinkLeavingItsFolder(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("a link planted by root is one root may follow")
	}

	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}

	home := t.TempDir()
	shadow := filepath.Join(t.TempDir(), "shadow")
	if err := os.WriteFile(shadow, []byte(planted), 0o600); err != nil {
		t.Fatal(err)
	}

	zshrc := filepath.Join(home, ".zshrc")
	if err := os.Symlink(shadow, zshrc); err != nil {
		t.Fatal(err)
	}

	ctx := onDisk{}

	if _, err := file.EnsureBlock(ctx, zshrc, "system", []byte("export PATH=$HOME/.local/bin:$PATH\n")); err == nil {
		t.Fatal("a block edit must refuse a link that leaves its folder")
	}

	if _, err := file.RemoveBlock(ctx, zshrc, "system"); err == nil {
		t.Fatal("a block removal must refuse a link that leaves its folder")
	}

	if block, found := file.ReadBlock(ctx, zshrc, "system"); found || strings.Contains(string(block), "secret") {
		t.Fatalf("a block must not be read through the link: %q", block)
	}

	if file.HasBlock(ctx, zshrc, "system") {
		t.Fatal("a block must not be found through the link")
	}

	if err := file.Chown(ctx, zshrc, me.Username, ""); err != nil {
		t.Fatal(err)
	}

	if got, err := os.ReadFile(shadow); err != nil || string(got) != planted {
		t.Fatalf("the target must be left alone: %q, %v", got, err)
	}

	if got, err := os.ReadFile(zshrc); err != nil || string(got) != planted {
		t.Fatalf("the link must stay a link: %q, %v", got, err)
	}
}

func TestABlockGoesThroughALinkThatStaysInItsFolder(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, ".zshrc.local"), []byte("alias ll='ls -l'\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	zshrc := filepath.Join(home, ".zshrc")
	if err := os.Symlink(".zshrc.local", zshrc); err != nil {
		t.Fatal(err)
	}

	changed, err := file.EnsureBlock(onDisk{}, zshrc, "system", []byte("export A=1\n"))
	if err != nil || !changed {
		t.Fatalf("EnsureBlock = %v, %v", changed, err)
	}

	got, err := os.ReadFile(zshrc)
	if err != nil || !strings.HasPrefix(string(got), "alias ll='ls -l'\n# >>> pupitre system >>>\nexport A=1\n") {
		t.Fatalf("the block joins what the link led to: %q, %v", got, err)
	}
}
