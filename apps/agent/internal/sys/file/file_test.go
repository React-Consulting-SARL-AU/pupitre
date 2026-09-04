package file_test

import (
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/file"
)

func TestWriteAtomicSameExistsRemove(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})
	path := "/etc/redis/pupitre.conf"

	if file.Exists(ctx, path) || file.Same(ctx, path, []byte("x")) {
		t.Fatal("absent file reported present")
	}

	if err := file.WriteAtomic(ctx, path, []byte("bind 127.0.0.1\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	if !file.Exists(ctx, path) || !file.Same(ctx, path, []byte("bind 127.0.0.1\n")) || file.Same(ctx, path, []byte("other")) {
		t.Fatal("Exists/Same answer wrong after write")
	}

	if fake.Modes[path] != 0o640 {
		t.Fatalf("mode = %o", fake.Modes[path])
	}

	content, err := file.Read(ctx, path)
	if err != nil || string(content) != "bind 127.0.0.1\n" {
		t.Fatalf("Read = %q, %v", content, err)
	}

	removed, err := file.Remove(ctx, path)
	if err != nil || !removed {
		t.Fatalf("Remove = %v, %v", removed, err)
	}

	removed, err = file.Remove(ctx, path)
	if err != nil || removed {
		t.Fatalf("second Remove = %v, %v", removed, err)
	}
}

func TestEnsureLineAppendsOnce(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/redis/redis.conf"] = []byte("port 6379")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	added, err := file.EnsureLine(ctx, "/etc/redis/redis.conf", "include /etc/redis/pupitre.conf")
	if err != nil || !added {
		t.Fatalf("EnsureLine = %v, %v", added, err)
	}

	if string(fake.Files["/etc/redis/redis.conf"]) != "port 6379\ninclude /etc/redis/pupitre.conf\n" {
		t.Fatalf("content = %q", fake.Files["/etc/redis/redis.conf"])
	}

	added, err = file.EnsureLine(ctx, "/etc/redis/redis.conf", "include /etc/redis/pupitre.conf")
	if err != nil || added {
		t.Fatalf("second EnsureLine = %v, %v", added, err)
	}

	added, err = file.EnsureLine(ctx, "/etc/new.conf", "first")
	if err != nil || !added || string(fake.Files["/etc/new.conf"]) != "first\n" {
		t.Fatalf("EnsureLine on a new file = %v, %v, %q", added, err, fake.Files["/etc/new.conf"])
	}
}

func TestChown(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/redis/pupitre.conf"] = []byte("x")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if err := file.Chown(ctx, "/etc/redis/pupitre.conf", "root", "redis"); err != nil {
		t.Fatal(err)
	}

	if fake.Owners["/etc/redis/pupitre.conf"] != "root:redis" {
		t.Fatalf("owner = %s", fake.Owners["/etc/redis/pupitre.conf"])
	}

	if err := file.Chown(ctx, "/nope", "root", "root"); err == nil {
		t.Fatal("chown of an absent file must fail")
	}
}

func TestEnsureBlockAppendsThenReplaces(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/home/dev/.zshrc"] = []byte("alias ll='ls -l'")
	ctx := modtest.NewContext(t, fake, modtest.Options{})
	path := "/home/dev/.zshrc"

	changed, err := file.EnsureBlock(ctx, path, "core.system", []byte("export A=1"))
	if err != nil || !changed {
		t.Fatalf("EnsureBlock = %v, %v", changed, err)
	}

	want := "alias ll='ls -l'\n# >>> pupitre core.system >>>\nexport A=1\n# <<< pupitre core.system <<<\n"
	if string(fake.Files[path]) != want || !file.HasBlock(ctx, path, "core.system") {
		t.Fatalf("content = %q", fake.Files[path])
	}

	changed, err = file.EnsureBlock(ctx, path, "core.system", []byte("export A=1\n"))
	if err != nil || changed {
		t.Fatalf("second EnsureBlock = %v, %v", changed, err)
	}

	fake.Files[path] = append(fake.Files[path], []byte("alias gs='git status'\n")...)
	changed, err = file.EnsureBlock(ctx, path, "core.system", []byte("export A=2"))
	if err != nil || !changed {
		t.Fatalf("third EnsureBlock = %v, %v", changed, err)
	}

	want = "alias ll='ls -l'\n# >>> pupitre core.system >>>\nexport A=2\n# <<< pupitre core.system <<<\nalias gs='git status'\n"
	if string(fake.Files[path]) != want {
		t.Fatalf("content = %q", fake.Files[path])
	}

	if file.HasBlock(ctx, "/absent", "core.system") {
		t.Fatal("HasBlock on an absent file")
	}
}

func TestRemoveBlock(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/home/dev/.zshrc"] = []byte("alias a=1\n# >>> pupitre core.system >>>\nexport A=1\n# <<< pupitre core.system <<<\nalias b=2\n")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	removed, err := file.RemoveBlock(ctx, "/home/dev/.zshrc", "core.system")
	if err != nil || !removed || string(fake.Files["/home/dev/.zshrc"]) != "alias a=1\nalias b=2\n" {
		t.Fatalf("RemoveBlock = %v, %v, %q", removed, err, fake.Files["/home/dev/.zshrc"])
	}

	removed, err = file.RemoveBlock(ctx, "/home/dev/.zshrc", "core.system")
	if err != nil || removed {
		t.Fatalf("second RemoveBlock = %v, %v", removed, err)
	}

	if removed, err := file.RemoveBlock(ctx, "/absent", "core.system"); err != nil || removed {
		t.Fatalf("absent RemoveBlock = %v, %v", removed, err)
	}
}
