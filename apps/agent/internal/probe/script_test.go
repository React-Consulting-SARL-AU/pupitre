package probe

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// busybox is not a shell but a dispatcher: its shell is the `sh` applet, and
// `busybox -n probe.sh` is an applet it does not know. Hence an argv per shell
// rather than a path — Linux carries /bin/busybox, macOS does not.
func shells(t *testing.T) [][]string {
	t.Helper()

	found := [][]string{{"/bin/sh"}}
	for _, candidate := range [][]string{{"/bin/dash"}, {"/usr/bin/dash"}, {"/bin/busybox", "sh"}} {
		if info, err := os.Stat(candidate[0]); err == nil && !info.IsDir() {
			found = append(found, candidate)
		}
	}

	return found
}

// busybox's standalone shell answers uname, df, free, ss and id from its own applets
// before it looks at PATH: the fake programs the fixture puts there are never reached,
// and it reports the machine it actually runs on. Parsing the script under it still counts.
func shellsThatObeyPath(t *testing.T) [][]string {
	t.Helper()

	var found [][]string
	for _, shell := range shells(t) {
		if !strings.HasSuffix(shell[0], "busybox") {
			found = append(found, shell)
		}
	}

	return found
}

func shellCommand(shell []string, args ...string) *exec.Cmd {
	argv := append(append([]string{}, shell...), args...)

	return exec.Command(argv[0], argv[1:]...)
}

func TestScriptParses(t *testing.T) {
	path := filepath.Join(t.TempDir(), "probe.sh")
	if err := os.WriteFile(path, []byte(Script), 0o755); err != nil {
		t.Fatal(err)
	}

	for _, shell := range shells(t) {
		out, err := shellCommand(shell, "-n", path).CombinedOutput()
		if err != nil {
			t.Errorf("%s -n probe.sh: %v\n%s", strings.Join(shell, " "), err, out)
		}
	}
}

func TestScriptPassesShellcheck(t *testing.T) {
	binary, err := exec.LookPath("shellcheck")
	if err != nil {
		t.Skip("shellcheck is not installed on this machine")
	}

	path := filepath.Join(t.TempDir(), "probe.sh")
	if err := os.WriteFile(path, []byte(Script), 0o755); err != nil {
		t.Fatal(err)
	}

	if out, err := exec.Command(binary, "-s", "sh", "-S", "warning", path).CombinedOutput(); err != nil {
		t.Errorf("shellcheck -s sh: %v\n%s", err, out)
	}
}

// probe.sh reaches a bare machine over `ssh host 'sh -s'`: it declares no interpreter of its own and stays in memory.
func TestScriptRunsFromStandardInputAndTouchesNothing(t *testing.T) {
	root := t.TempDir()
	f := bareUbuntu()
	env := f.onDisk(t, root)

	before := tree(t, root)
	runScript(t, []string{"/bin/sh"}, root, f, env)

	if after := tree(t, root); !equalTrees(before, after) {
		t.Fatalf("probe.sh left something behind:\n%s\n%s", strings.Join(before, "\n"), strings.Join(after, "\n"))
	}
}

func TestBothProbesProduceTheSameJSON(t *testing.T) {
	cases := map[string]fixture{
		"bare":         bareUbuntu(),
		"managed":      managedFixture(),
		"occupied":     occupiedFixture(),
		"incompatible": debianFixture(),
		"netstat":      netstatFixture(),
		"unreadable":   {Absent: fakePrograms, Current: "0.2.0"},
	}

	for name, f := range cases {
		t.Run(name, func(t *testing.T) {
			for _, shell := range shellsThatObeyPath(t) {
				root := t.TempDir()
				env := f.onDisk(t, root)

				want, err := Run(f.options(t, root)).JSON()
				if err != nil {
					t.Fatal(err)
				}

				got := runScript(t, shell, root, f, env)

				if !bytes.Equal(got, want) {
					t.Fatalf("%s disagrees with the Go probe\n  sh: %s\n  go: %s", strings.Join(shell, " "), got, want)
				}

				assertContractJSON(t, got)
			}
		})
	}
}

func runScript(t *testing.T, shell []string, root string, f fixture, env []string) []byte {
	t.Helper()

	cmd := shellCommand(shell, "-s", "--",
		"--root="+root,
		"--projects="+projectsDir(root),
		"--version="+f.Current,
	)
	cmd.Stdin = strings.NewReader(Script)
	cmd.Env = env

	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr

	if err := cmd.Run(); err != nil {
		t.Fatalf("%s probe.sh: %v\n%s", strings.Join(shell, " "), err, stderr.String())
	}

	if stderr.Len() > 0 {
		t.Fatalf("probe.sh must stay silent on stderr:\n%s", stderr.String())
	}

	return stdout.Bytes()
}

func occupiedFixture() fixture {
	f := bareUbuntu()
	f.Dirs = []string{"/var/lib/docker", "/usr/local/psa"}
	f.Files["/etc/passwd"] += "alice:x:1001:1001::/home/alice:/bin/zsh\nbob:x:1002:1002::/home/bob:/bin/bash\n"
	f.Replies["ss -ltnp"] = `State  Recv-Q Send-Q     Local Address:Port  Peer Address:Port Process
LISTEN 0      128              0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=901,fd=3))
LISTEN 0      511              0.0.0.0:80         0.0.0.0:*     users:(("nginx",pid=1042,fd=6))
LISTEN 0      511              0.0.0.0:443        0.0.0.0:*
LISTEN 0      70             127.0.0.1:33060      0.0.0.0:*
`

	return f
}

func debianFixture() fixture {
	f := bareUbuntu()
	f.Files["/etc/os-release"] = "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nID=debian\nVERSION_ID=\"12\"\n"
	f.Replies["uname -m"] = "i686\n"
	f.Failing = []string{"sudo"}

	return f
}

func netstatFixture() fixture {
	f := bareUbuntu()
	f.Absent = []string{"ss", "free"}
	f.Replies["netstat -ltnp"] = netstatOutput

	return f
}

func assertContractJSON(t *testing.T, raw []byte) {
	t.Helper()

	value, err := contract.Decode(raw)
	if err != nil {
		t.Fatalf("probe output is not JSON: %v\n%s", err, raw)
	}

	if err := contract.Validate("ProbeResult", value); err != nil {
		t.Errorf("probe output violates ProbeResult: %v\n%s", err, raw)
	}
}

func assertContract(t *testing.T, result Result) {
	t.Helper()

	raw, err := result.JSON()
	if err != nil {
		t.Fatal(err)
	}

	assertContractJSON(t, raw)
}

func tree(t *testing.T, root string) []string {
	t.Helper()

	var entries []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		entries = append(entries, path+" "+info.Mode().String()+" "+strconv.FormatInt(info.Size(), 10))

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(entries)

	return entries
}

func equalTrees(before, after []string) bool {
	if len(before) != len(after) {
		return false
	}

	for i := range before {
		if before[i] != after[i] {
			return false
		}
	}

	return true
}
