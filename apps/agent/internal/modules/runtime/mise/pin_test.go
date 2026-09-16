package mise

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

const project = "/home/dev/projects/shop"

func TestPinWritesTheLocalConfigAndHidesItFromGit(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	fake.Dirs[project] = true
	fake.Dirs[project+"/.git"] = true
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	changed, err := Pin(ctx, project, map[string]string{"node": "22", "java": "17"})
	if err != nil || !changed {
		t.Fatalf("pin: changed %v, %v", changed, err)
	}

	if got := string(fake.Files[project+"/"+LocalConfig]); got != "[tools]\njava = \"temurin-17\"\nnode = \"22\"\n" {
		t.Fatalf("mise.local.toml = %q", got)
	}

	if fake.Owners[project+"/"+LocalConfig] != "dev:dev" {
		t.Fatalf("the file belongs to dev, got %q", fake.Owners[project+"/"+LocalConfig])
	}

	exclude := string(fake.Files[project+"/.git/info/exclude"])
	if !strings.Contains(exclude, "/"+LocalConfig+"\n") || !strings.Contains(exclude, "# >>> pupitre runtimes >>>") {
		t.Fatalf("git must be told to ignore the file: %q", exclude)
	}

	if !strings.Contains(strings.Join(fake.Commands(), "\n"), "(dev) mise trust "+project+"/"+LocalConfig) {
		t.Fatal("mise must be told the file is ours")
	}

	changed, err = Pin(ctx, project, map[string]string{"java": "17", "node": "22"})
	if err != nil || changed {
		t.Fatalf("the same pins in another order must change nothing: %v, %v", changed, err)
	}
}

func TestPinOfNothingRemovesTheFile(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Path] = []byte("mise\n")
	fake.Dirs[project] = true
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if _, err := Pin(ctx, project, map[string]string{"node": "22"}); err != nil {
		t.Fatal(err)
	}

	changed, err := Pin(ctx, project, map[string]string{})
	if err != nil || !changed {
		t.Fatalf("unpin: changed %v, %v", changed, err)
	}

	if _, kept := fake.Files[project+"/"+LocalConfig]; kept {
		t.Fatal("a project that names no version carries no file")
	}

	if _, written := fake.Files[project+"/.git/info/exclude"]; written {
		t.Fatal("a folder without a repository has no exclude file to write")
	}

	changed, err = Pin(ctx, project, nil)
	if err != nil || changed {
		t.Fatalf("nothing to remove must change nothing: %v, %v", changed, err)
	}
}

func TestPinRefusesAToolItDoesNotKnow(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if _, err := Pin(ctx, project, map[string]string{"deno": "2"}); err == nil {
		t.Fatal("deno is not a runtime")
	}
}
