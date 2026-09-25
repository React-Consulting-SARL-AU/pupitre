package sys

import (
	"bufio"
	"context"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRealRunCapturesOutputAndExitCode(t *testing.T) {
	out, err := Real{}.Run(Command{Argv: []string{"sh", "-c", "echo out; echo err >&2; exit 3"}})
	if err == nil {
		t.Fatal("expected an error for exit code 3")
	}

	var exit *ExitError
	if !errors.As(err, &exit) || exit.Code != 3 || exit.Program != "sh" {
		t.Fatalf("unexpected error %v", err)
	}

	if strings.TrimSpace(out.Stdout) != "out" || strings.TrimSpace(out.Stderr) != "err" || out.Code != 3 {
		t.Fatalf("unexpected output %+v", out)
	}

	if !strings.Contains(exit.Error(), "exit 3") || !strings.Contains(exit.Error(), "err") {
		t.Fatalf("error message must carry the code and stderr: %s", exit)
	}
}

func TestRealRunPassesEnvDirAndStdin(t *testing.T) {
	dir := t.TempDir()

	out, err := Real{}.Run(Command{
		Argv:  []string{"sh", "-c", "printf '%s|%s|' \"$PUPITRE_PROBE\" \"$(pwd)\"; cat"},
		Env:   []string{"PUPITRE_PROBE=yes"},
		Dir:   dir,
		Stdin: []byte("from-stdin"),
	})
	if err != nil {
		t.Fatal(err)
	}

	resolved, _ := filepath.EvalSymlinks(dir)
	if !strings.HasPrefix(out.Stdout, "yes|") || !strings.Contains(out.Stdout, resolved) || !strings.HasSuffix(out.Stdout, "|from-stdin") {
		t.Fatalf("unexpected output %q", out.Stdout)
	}
}

func TestRealRunFindsTheProgramOnTheCommandsOwnPath(t *testing.T) {
	bin := t.TempDir()
	script := filepath.Join(bin, "pupitre-probe")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho found\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	out, err := Real{}.Run(Command{
		Argv: []string{"pupitre-probe"},
		Env:  []string{"PATH=" + bin + ":/usr/bin:/bin"},
	})
	if err != nil {
		t.Fatal(err)
	}

	if strings.TrimSpace(out.Stdout) != "found" {
		t.Fatalf("unexpected output %q", out.Stdout)
	}

	if _, err := (Real{}).Run(Command{Argv: []string{"pupitre-probe"}}); err == nil {
		t.Fatal("without that PATH the program must stay unknown")
	}

	if _, err := (Real{}).Run(Command{Argv: []string{"pupitre-probe"}, Env: []string{"PATH=" + t.TempDir()}}); err == nil {
		t.Fatal("a PATH without the program must not find it elsewhere")
	}
}

func TestRealRunStreamsStdinFromAFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "dump.sql")
	if err := os.WriteFile(path, []byte("-- des lignes de dump\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := Real{}.Run(Command{Argv: []string{"cat"}, StdinPath: path})
	if err != nil {
		t.Fatal(err)
	}

	if strings.TrimSpace(out.Stdout) != "-- des lignes de dump" {
		t.Fatalf("unexpected output %q", out.Stdout)
	}

	if _, err := (Real{}).Run(Command{Argv: []string{"cat"}, StdinPath: path + ".absent"}); err == nil {
		t.Fatal("a missing file must fail before the command runs")
	}
}

func TestRealRunStreamsBothEndsWithoutHoldingThem(t *testing.T) {
	var out strings.Builder

	captured, err := Real{}.Run(Command{Argv: []string{"tr", "a-z", "A-Z"}, Input: strings.NewReader("pg_dump streams\n"), Output: &out})
	if err != nil {
		t.Fatal(err)
	}

	if out.String() != "PG_DUMP STREAMS\n" || captured.Stdout != "" {
		t.Fatalf("streamed %q, captured %q", out.String(), captured.Stdout)
	}
}

func TestIdleRunsBehindEverythingElse(t *testing.T) {
	if got := strings.Join(Idle("pg_dump", "shop"), " "); got != "nice -n 10 ionice -c3 pg_dump shop" {
		t.Fatalf("Idle = %q", got)
	}
}

func TestDescribeShowsTheRedirectedFile(t *testing.T) {
	got := Describe(Command{User: "dev", Argv: []string{"mysql", "shop"}, StdinPath: "/home/dev/dumps/shop.sql"})
	if got != "(dev) mysql shop < /home/dev/dumps/shop.sql" {
		t.Fatalf("Describe = %q", got)
	}
}

func TestRealWriteFileIsAtomicAndKeepsMode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "env")

	if err := (Real{}).WriteFile(path, []byte("A=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o, want 600", info.Mode().Perm())
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("temporary file left behind: %d entries", len(entries))
	}

	exists, err := (Real{}).Exists(path)
	if err != nil || !exists {
		t.Fatalf("Exists(%s) = %v, %v", path, exists, err)
	}

	if err := (Real{}).Remove(path); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).Remove(path); err != nil {
		t.Fatalf("removing an absent file must be a no-op, got %v", err)
	}

	exists, _ = (Real{}).Exists(path)
	if exists {
		t.Fatal("file still exists after Remove")
	}
}

func TestRealWriteFileFailsWithoutDirectory(t *testing.T) {
	err := (Real{}).WriteFile(filepath.Join(t.TempDir(), "missing", "env"), []byte("x"), 0o600)
	if err == nil {
		t.Fatal("expected an error when the directory is missing")
	}
}

func TestRealReadDirNamesFoldersAndLeavesSymlinksAlone(t *testing.T) {
	dir := t.TempDir()

	if err := os.Mkdir(filepath.Join(dir, "api"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(dir, filepath.Join(dir, "loop")); err != nil {
		t.Fatal(err)
	}

	entries, err := Real{}.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	got := map[string]bool{}

	for _, entry := range entries {
		got[entry.Name] = entry.Dir
	}

	if len(got) != 3 || !got["api"] || got["README.md"] || got["loop"] {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	if _, err := (Real{}).ReadDir(filepath.Join(dir, "absent")); err == nil {
		t.Fatal("a missing folder must fail")
	}
}

func TestRealOwnerReadsTheLinkNotItsTarget(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	link := filepath.Join(dir, "link")
	if err := os.WriteFile(target, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}

	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}

	for _, path := range []string{dir, target, link} {
		owner, err := Real{}.Owner(path)
		if err != nil || owner != me.Username {
			t.Fatalf("Owner(%s) = %q, %v; want %q", path, owner, err, me.Username)
		}
	}

	if _, err := (Real{}).Owner(filepath.Join(dir, "absent")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("absent path: %v", err)
	}

	if err := (Real{}).Chown(link, me.Username, ""); err != nil {
		t.Fatal(err)
	}
}

func TestRealRunGivesUpOnACommandThatNeverAnswers(t *testing.T) {
	_, err := Real{}.Run(Command{Argv: []string{"sleep", "5"}, Timeout: 200 * time.Millisecond})
	if err == nil || !strings.Contains(err.Error(), "no answer after") {
		t.Fatalf("a command past its time must fail and say so, got %v", err)
	}
}

func TestRealRunTakesTheGrandchildrenWithTheTimedOutCommand(t *testing.T) {
	started := time.Now()

	_, err := Real{}.Run(Command{Argv: []string{"sh", "-c", "sleep 30 & wait"}, Timeout: 200 * time.Millisecond})
	if err == nil || !strings.Contains(err.Error(), "no answer after") {
		t.Fatalf("got %v", err)
	}

	if elapsed := time.Since(started); elapsed > 5*time.Second {
		t.Fatalf("Run waited %s for the grandchild", elapsed)
	}
}

func TestRealRunSurvivesAnEmptyPath(t *testing.T) {
	if _, err := (Real{}).Run(Command{Argv: []string{"sh", "-c", "true"}, Env: []string{"PATH="}}); err != nil {
		t.Fatalf("an empty PATH must leave the lookup to the process's own, got %v", err)
	}
}

func TestRealWriteFileAppliesTheModeAndKeepsTheOwnerOfAnExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "authorized_keys")
	if err := os.WriteFile(path, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	before, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).WriteFile(path, []byte("new\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o, want the requested 600", info.Mode().Perm())
	}

	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		t.Skip("no uid on this platform")
	}

	was, _ := before.Sys().(*syscall.Stat_t)
	if stat.Uid != was.Uid || stat.Gid != was.Gid {
		t.Fatalf("owner = %d:%d, want the existing %d:%d", stat.Uid, stat.Gid, was.Uid, was.Gid)
	}

	if content, _ := os.ReadFile(path); string(content) != "new\n" {
		t.Fatalf("content = %q", content)
	}
}

func TestRealReadFileInRefusesALinkThatLeavesTheRoot(t *testing.T) {
	outside := t.TempDir()
	secret := filepath.Join(outside, "shadow")
	if err := os.WriteFile(secret, []byte("root:x\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "authorized_keys"), []byte("ssh-ed25519 AAAA\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(secret, filepath.Join(root, "planted")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("authorized_keys", filepath.Join(root, "inside")); err != nil {
		t.Fatal(err)
	}

	content, err := Real{}.ReadFileIn(root, "authorized_keys")
	if err != nil || string(content) != "ssh-ed25519 AAAA\n" {
		t.Fatalf("ReadFileIn = %q, %v", content, err)
	}

	content, err = Real{}.ReadFileIn(root, "inside")
	if err != nil || string(content) != "ssh-ed25519 AAAA\n" {
		t.Fatalf("a link that stays inside the root must be followed: %q, %v", content, err)
	}

	for _, rel := range []string{"planted", "../" + filepath.Base(outside) + "/shadow", secret} {
		if content, err := (Real{}).ReadFileIn(root, rel); err == nil {
			t.Fatalf("%q read %q through the root", rel, content)
		}
	}

	if _, err := (Real{}).ReadFileIn(root, "absent"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("absent file: %v", err)
	}
}

func TestRealAppendFileCreatesThenAdds(t *testing.T) {
	path := filepath.Join(t.TempDir(), "web.log")

	me, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).AppendFile(path, []byte("first\n"), me.Username); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).AppendFile(path, []byte("second\n"), me.Username); err != nil {
		t.Fatal(err)
	}

	content, err := os.ReadFile(path)
	if err != nil || string(content) != "first\nsecond\n" {
		t.Fatalf("content = %q, %v", content, err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}

	if info.Mode().Perm() != 0o644 {
		t.Fatalf("mode = %o, want 644", info.Mode().Perm())
	}

	if err := (Real{}).AppendFile(filepath.Join(t.TempDir(), "missing", "web.log"), []byte("x"), ""); err == nil {
		t.Fatal("a missing folder must fail")
	}
}

func TestRealStatDescribesARegularFileAndRefusesTheRest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "login.png")
	if err := os.WriteFile(path, make([]byte, 24_000), 0o644); err != nil {
		t.Fatal(err)
	}

	when := time.Date(2026, time.September, 4, 11, 0, 0, 0, time.UTC)
	if err := os.Chtimes(path, when, when); err != nil {
		t.Fatal(err)
	}

	size, mtime, err := Real{}.Stat(path)
	if err != nil || size != 24_000 || !mtime.Equal(when) {
		t.Fatalf("Stat = %d, %s, %v", size, mtime, err)
	}

	if err := os.Symlink(path, filepath.Join(dir, "link.png")); err != nil {
		t.Fatal(err)
	}

	for _, refused := range []string{dir, filepath.Join(dir, "link.png"), filepath.Join(dir, "absent")} {
		if _, _, err := (Real{}).Stat(refused); err == nil {
			t.Fatalf("%s must not be described as a file", refused)
		}
	}
}

func TestRealSignalReachesTheProcessAndSaysWhenItIsGone(t *testing.T) {
	process := exec.Command("sleep", "30")
	if err := process.Start(); err != nil {
		t.Fatal(err)
	}

	pid := process.Process.Pid

	if err := (Real{}).Signal(pid, "", 0); err != nil {
		t.Fatalf("a running process must answer signal 0: %v", err)
	}

	if err := (Real{}).Signal(pid, "", syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}

	process.Wait()

	if err := (Real{}).Signal(pid, "", 0); err == nil {
		t.Fatal("a reaped process must not answer signal 0")
	}
}

func TestRealListInAndStatInDescribeWhatIsOnTheDisk(t *testing.T) {
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "shadow"), []byte("root:x\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "notes"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(root, "notes", "readme.md"), []byte("# flyleaf\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("readme.md", filepath.Join(root, "notes", "inside")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(filepath.Join(outside, "shadow"), filepath.Join(root, "notes", "planted")); err != nil {
		t.Fatal(err)
	}

	nodes, err := Real{}.ListIn(root, "notes")
	if err != nil || len(nodes) != 3 {
		t.Fatalf("ListIn = %+v, %v", nodes, err)
	}

	kinds := map[string]string{}

	for _, node := range nodes {
		kinds[node.Name] = node.Kind
	}

	if kinds["readme.md"] != NodeFile || kinds["inside"] != NodeLink || kinds["planted"] != NodeLink {
		t.Fatalf("unexpected kinds %v", kinds)
	}

	file, err := Real{}.StatIn(root, "notes/readme.md")
	if err != nil || file.Kind != NodeFile || file.SizeBytes != 10 || file.Mode.Perm() != 0o644 {
		t.Fatalf("StatIn = %+v, %v", file, err)
	}

	folder, err := Real{}.StatIn(root, "")
	if err != nil || folder.Kind != NodeDir {
		t.Fatalf("the root describes itself: %+v, %v", folder, err)
	}

	link, err := Real{}.StatIn(root, "notes/inside")
	if err != nil || link.Kind != NodeLink || link.SizeBytes != 10 {
		t.Fatalf("a link inside the root is described by its target: %+v, %v", link, err)
	}

	if _, err := (Real{}).StatIn(root, "notes/planted"); err == nil {
		t.Fatal("a link leaving the root was described")
	}

	if _, err := (Real{}).ListIn(root, "../"+filepath.Base(outside)); err == nil {
		t.Fatal("a folder outside the root was listed")
	}
}

func TestRealWriteFileInReplacesAtomicallyAndKeepsTheMode(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "notes"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(root, "notes", "readme.md"), []byte("# flyleaf\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).WriteFileIn(root, "notes/readme.md", "", []byte("réécrit\n")); err != nil {
		t.Fatalf("WriteFileIn: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(root, "notes", "readme.md"))
	if err != nil || string(content) != "réécrit\n" {
		t.Fatalf("read back %q, %v", content, err)
	}

	info, err := os.Lstat(filepath.Join(root, "notes", "readme.md"))
	if err != nil || info.Mode().Perm() != 0o640 {
		t.Fatalf("the mode of the replaced file changed: %v, %v", info.Mode(), err)
	}

	if err := (Real{}).WriteFileIn(root, "notes/todo.md", "", []byte("- rien\n")); err != nil {
		t.Fatalf("WriteFileIn on a new file: %v", err)
	}

	entries, err := os.ReadDir(filepath.Join(root, "notes"))
	if err != nil {
		t.Fatal(err)
	}

	if len(entries) != 2 {
		t.Fatalf("the write left something behind: %+v", entries)
	}

	if err := (Real{}).WriteFileIn(root, "../escape.md", "", nil); err == nil {
		t.Fatal("a write left the root")
	}
}

func TestRealMkdirRenameAndRemoveStayInsideTheRoot(t *testing.T) {
	root := t.TempDir()

	if err := (Real{}).MkdirIn(root, "notes/drafts", ""); err != nil {
		t.Fatalf("MkdirIn: %v", err)
	}

	if err := (Real{}).MkdirIn(root, "notes/drafts", ""); err != nil {
		t.Fatalf("a folder already there is not an error: %v", err)
	}

	if err := (Real{}).WriteFileIn(root, "notes/drafts/one.md", "", []byte("un\n")); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).RenameIn(root, "notes/drafts/one.md", "notes/one.md"); err != nil {
		t.Fatalf("RenameIn: %v", err)
	}

	if _, err := os.Lstat(filepath.Join(root, "notes", "one.md")); err != nil {
		t.Fatalf("the entry did not travel: %v", err)
	}

	if err := (Real{}).RemoveIn(root, "notes", false); err == nil {
		t.Fatal("a folder that is not empty was removed")
	}

	if err := (Real{}).RemoveIn(root, "notes", true); err != nil {
		t.Fatalf("RemoveIn: %v", err)
	}

	if _, err := os.Lstat(filepath.Join(root, "notes")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("the folder is still there: %v", err)
	}

	if err := (Real{}).RemoveIn(root, "../escape", true); err == nil {
		t.Fatal("a removal left the root")
	}
}

func TestRealStreamHandsLinesOverAndEndsOnItsOwnTime(t *testing.T) {
	var lines []string
	err := Real{}.Stream(Command{Argv: []string{"sh", "-c", "echo one; echo two; sleep 5"}, Timeout: 300 * time.Millisecond}, func(line string) {
		lines = append(lines, line)
	})
	if err != nil {
		t.Fatalf("a stream that ran out of time is not an error: %v", err)
	}

	if strings.Join(lines, ",") != "one,two" {
		t.Fatalf("lines = %v, want one,two", lines)
	}
}

func TestRealStreamReportsTheExitOfACommandThatFailed(t *testing.T) {
	var lines []string
	err := Real{}.Stream(Command{Argv: []string{"sh", "-c", "echo one; echo why >&2; exit 3"}}, func(line string) {
		lines = append(lines, line)
	})

	var exit *ExitError
	if !errors.As(err, &exit) || exit.Code != 3 || !strings.Contains(exit.Stderr, "why") {
		t.Fatalf("unexpected error %v", err)
	}

	if strings.Join(lines, ",") != "one" {
		t.Fatalf("lines = %v, want one", lines)
	}
}

func TestRealWriteFileKeepsTheModeWhenAskedTo(t *testing.T) {
	dir := t.TempDir()
	kept := filepath.Join(dir, "kept")
	if err := os.WriteFile(kept, []byte("old\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).WriteFile(kept, []byte("new\n"), KeepMode); err != nil {
		t.Fatal(err)
	}

	info, err := os.Stat(kept)
	if err != nil || info.Mode().Perm() != 0o640 {
		t.Fatalf("mode = %v, %v, want the existing 640", info.Mode(), err)
	}

	fresh := filepath.Join(dir, "fresh")
	if err := (Real{}).WriteFile(fresh, []byte("new\n"), KeepMode); err != nil {
		t.Fatal(err)
	}

	info, err = os.Stat(fresh)
	if err != nil || info.Mode().Perm() != DefaultMode {
		t.Fatalf("mode = %v, %v, want the default %o", info.Mode(), err, DefaultMode)
	}
}

func TestRealWriteFileInWritesThroughALinkThatStaysInside(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "etc"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(root, "etc", "config.toml"), []byte("a = 1\n"), 0o640); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("etc/config.toml", filepath.Join(root, "config.toml")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("config.toml", filepath.Join(root, "alias.toml")); err != nil {
		t.Fatal(err)
	}

	if err := (Real{}).WriteFileIn(root, "alias.toml", "", []byte("a = 2\n")); err != nil {
		t.Fatalf("WriteFileIn: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(root, "etc", "config.toml"))
	if err != nil || string(content) != "a = 2\n" {
		t.Fatalf("the target did not take the write: %q, %v", content, err)
	}

	info, err := os.Lstat(filepath.Join(root, "etc", "config.toml"))
	if err != nil || info.Mode().Perm() != 0o640 {
		t.Fatalf("the target's mode changed: %v, %v", info.Mode(), err)
	}

	for _, link := range []string{"config.toml", "alias.toml"} {
		if info, err := os.Lstat(filepath.Join(root, link)); err != nil || info.Mode()&fs.ModeSymlink == 0 {
			t.Fatalf("%s is no longer a link: %v, %v", link, info, err)
		}
	}
}

func TestRealWriteFileInRefusesALinkThatLeavesTheRoot(t *testing.T) {
	outside := t.TempDir()
	secret := filepath.Join(outside, "shadow")
	if err := os.WriteFile(secret, []byte("root:x\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	if err := os.Symlink(secret, filepath.Join(root, "absolute")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("../"+filepath.Base(outside)+"/shadow", filepath.Join(root, "relative")); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink("loop", filepath.Join(root, "loop")); err != nil {
		t.Fatal(err)
	}

	for _, rel := range []string{"absolute", "relative", "loop"} {
		if err := (Real{}).WriteFileIn(root, rel, "", []byte("owned\n")); err == nil {
			t.Fatalf("%q wrote through the root", rel)
		}
	}

	if content, _ := os.ReadFile(secret); string(content) != "root:x\n" {
		t.Fatalf("the file outside the root was written: %q", content)
	}
}

func TestRealStreamEndsWithItsContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	var lines []string
	go func() {
		time.Sleep(200 * time.Millisecond)
		cancel()
	}()

	started := time.Now()
	err := Real{}.Stream(Command{Argv: []string{"sh", "-c", "echo one; sleep 30"}, Context: ctx}, func(line string) {
		lines = append(lines, line)
	})
	if err != nil {
		t.Fatalf("a stream ended by its context is not an error: %v", err)
	}

	if strings.Join(lines, ",") != "one" || time.Since(started) > 5*time.Second {
		t.Fatalf("lines = %v after %s", lines, time.Since(started))
	}
}

func TestRealStreamKillsTheChildOnALineTooLong(t *testing.T) {
	started := time.Now()

	var lines []string
	err := Real{}.Stream(Command{Argv: []string{"sh", "-c", "echo short; head -c 2000000 /dev/zero | tr '\\0' x; echo; sleep 30"}}, func(line string) {
		lines = append(lines, line)
	})

	if err == nil || !errors.Is(err, bufio.ErrTooLong) {
		t.Fatalf("got %v, want the scanner's refusal", err)
	}

	if strings.Join(lines, ",") != "short" || time.Since(started) > 5*time.Second {
		t.Fatalf("lines = %d after %s", len(lines), time.Since(started))
	}
}

func TestRealReadsAJournalByRanges(t *testing.T) {
	path := filepath.Join(t.TempDir(), "web.log")
	if err := os.WriteFile(path, []byte("one\ntwo\nthree\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	tail, err := Real{}.ReadTail(path, 6)
	if err != nil || string(tail) != "three\n" {
		t.Fatalf("ReadTail = %q, %v", tail, err)
	}

	whole, err := Real{}.ReadTail(path, 1024)
	if err != nil || string(whole) != "one\ntwo\nthree\n" {
		t.Fatalf("ReadTail past the size = %q, %v", whole, err)
	}

	rest, err := Real{}.ReadFrom(path, 4)
	if err != nil || string(rest) != "two\nthree\n" {
		t.Fatalf("ReadFrom = %q, %v", rest, err)
	}

	if err := os.WriteFile(path, []byte("new\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	rest, err = Real{}.ReadFrom(path, 14)
	if err != nil || string(rest) != "new\n" {
		t.Fatalf("ReadFrom past the size = %q, %v", rest, err)
	}

	if _, err := (Real{}).ReadTail(filepath.Join(t.TempDir(), "absent"), 10); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("absent file: %v", err)
	}
}
