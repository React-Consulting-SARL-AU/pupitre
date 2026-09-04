package probe

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

// A simulated machine, played twice: against FakeSys for the Go probe, and against a fake root
// plus a fake PATH for probe.sh. Whatever the two probes disagree on is a divergence.
type fixture struct {
	Files   map[string]string
	Dirs    []string
	Replies map[string]string
	Absent  []string
	Failing []string
	Agent   string
	Current string
}

const (
	projectsPlaceholder = "%PROJECTS%"
	repliesVariable     = "PUPITRE_FAKE_REPLIES"
)

var fakePrograms = []string{"uname", "free", "df", "ss", "netstat", "sudo", "id"}

const fakeProgram = `#!/bin/sh
name=${0##*/}
key=$name
for argument in "$@"; do
  key="$key $argument"
done
safe=$(printf '%s' "$key" | tr -c 'A-Za-z0-9' '_')
[ -f "$PUPITRE_FAKE_REPLIES/$name.absent" ] && exit 127
[ -f "$PUPITRE_FAKE_REPLIES/$name.fail" ] && exit 1
[ -f "$PUPITRE_FAKE_REPLIES/$safe.out" ] && cat "$PUPITRE_FAKE_REPLIES/$safe.out"
exit 0
`

func bareUbuntu() fixture {
	return fixture{
		Files: map[string]string{
			"/etc/os-release": "PRETTY_NAME=\"Ubuntu 24.04.1 LTS\"\nID=ubuntu\nID_LIKE=debian\nVERSION_ID=\"24.04\"\n",
			"/etc/passwd":     "root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nsystemd-network:x:998:998::/:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n",
			"/proc/meminfo":   "MemTotal:        8128952 kB\nMemFree:         6029312 kB\n",
		},
		Replies: map[string]string{
			"uname -m":                         "x86_64\n",
			"free -b":                          freeOutput,
			"id -u":                            "501\n",
			"df -P -B1 /":                      dfOutput,
			"df -P -B1 " + projectsPlaceholder: dfOutput,
			"ss -ltnp":                         sshOnly,
		},
		Absent:  []string{"netstat"},
		Current: "0.2.0",
	}
}

const sshOnly = `State  Recv-Q Send-Q     Local Address:Port  Peer Address:Port Process
LISTEN 0      128              0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=901,fd=3))
LISTEN 0      128                 [::]:22            [::]:*     users:(("sshd",pid=901,fd=4))
`

func projectsDir(root string) string {
	return filepath.Join(root, "home", "dev", "projects")
}

func (f fixture) replies(root string) map[string]string {
	expanded := make(map[string]string, len(f.Replies)+1)
	for key, reply := range f.Replies {
		expanded[strings.ReplaceAll(key, projectsPlaceholder, projectsDir(root))] = reply
	}

	if f.Agent != "" {
		expanded[root+agentPath+" version"] = "pupitred " + f.Agent + "\n"
	}

	return expanded
}

func (f fixture) options(t *testing.T, root string) Options {
	t.Helper()

	fake := modtest.NewFakeSys()
	for path, content := range f.Files {
		fake.Files[root+path] = []byte(content)
	}
	for _, dir := range f.Dirs {
		fake.Dirs[root+dir] = true
	}
	for key, reply := range f.replies(root) {
		fake.Replies[key] = reply
	}
	for _, program := range append(append([]string{}, f.Absent...), f.Failing...) {
		fake.FailProgram(program, program+" : indisponible")
	}

	fake.Dirs[projectsDir(root)] = true
	if f.Agent != "" {
		fake.Files[root+agentPath] = []byte("#!/bin/sh\n")
	}

	return Options{Sys: fake, Root: root, ProjectsDir: projectsDir(root), Version: f.Current}
}

// Lays the same machine on disk: files under a fake root, programs as scripts on a fake PATH.
func (f fixture) onDisk(t *testing.T, root string) []string {
	t.Helper()

	replies := filepath.Join(root, ".replies")
	bin := filepath.Join(root, ".bin")
	mkdir(t, replies, bin, projectsDir(root))

	for path, content := range f.Files {
		write(t, filepath.Join(root, path), content, 0o644)
	}
	for _, dir := range f.Dirs {
		mkdir(t, filepath.Join(root, dir))
	}
	for key, reply := range f.replies(root) {
		write(t, filepath.Join(replies, sanitize(key)+".out"), reply, 0o644)
	}
	for _, program := range f.Absent {
		write(t, filepath.Join(replies, program+".absent"), "", 0o644)
	}
	for _, program := range f.Failing {
		write(t, filepath.Join(replies, program+".fail"), "", 0o644)
	}
	for _, program := range fakePrograms {
		write(t, filepath.Join(bin, program), fakeProgram, 0o755)
	}

	if f.Agent != "" {
		write(t, filepath.Join(root, agentPath), "#!/bin/sh\nprintf 'pupitred "+f.Agent+"\\n'\n", 0o755)
	}

	return []string{
		"PATH=" + bin + ":/usr/bin:/bin",
		repliesVariable + "=" + replies,
	}
}

func sanitize(key string) string {
	out := []byte(key)
	for i, char := range out {
		alphanumeric := (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9')
		if !alphanumeric {
			out[i] = '_'
		}
	}

	return string(out)
}

func mkdir(t *testing.T, paths ...string) {
	t.Helper()

	for _, path := range paths {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
	}
}

func write(t *testing.T, path, content string, mode os.FileMode) {
	t.Helper()

	mkdir(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
}
