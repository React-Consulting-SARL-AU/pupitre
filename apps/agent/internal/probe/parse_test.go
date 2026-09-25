package probe

import (
	"reflect"
	"testing"
)

func TestParseOSRelease(t *testing.T) {
	cases := []struct {
		name    string
		content string
		id      string
		version string
	}{
		{
			name:    "ubuntu",
			content: "PRETTY_NAME=\"Ubuntu 24.04.1 LTS\"\nNAME=\"Ubuntu\"\nID=ubuntu\nID_LIKE=debian\nVERSION_ID=\"24.04\"\nVERSION_CODENAME=noble\n",
			id:      "ubuntu",
			version: "24.04",
		},
		{
			name:    "debian",
			content: "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nID=debian\nVERSION_ID=\"12\"\n",
			id:      "debian",
			version: "12",
		},
		{
			name:    "single quotes and no version",
			content: "ID='alpine'\n",
			id:      "alpine",
			version: "",
		},
		{
			name:    "ID_LIKE must not be taken for ID",
			content: "ID_LIKE=debian\nID=ubuntu\n",
			id:      "ubuntu",
			version: "",
		},
		{
			name:    "empty",
			content: "",
			id:      "",
			version: "",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			id, version := parseOSRelease([]byte(testCase.content))

			if id != testCase.id || version != testCase.version {
				t.Fatalf("got %q %q, want %q %q", id, version, testCase.id, testCase.version)
			}
		})
	}
}

func TestNormalizeArch(t *testing.T) {
	for machine, want := range map[string]string{
		"x86_64":  "amd64",
		"amd64":   "amd64",
		"aarch64": "arm64",
		"arm64":   "arm64",
		"i686":    "i686",
		"":        "",
	} {
		if got := normalizeArch(machine); got != want {
			t.Errorf("normalizeArch(%q) = %q, want %q", machine, got, want)
		}
	}
}

const freeOutput = `               total        used        free      shared  buff/cache   available
Mem:      8324046848  1073741824  6174015488     1048576  1076289536  7062454272
Swap:     2147483648           0  2147483648
`

func TestParseFreeBytes(t *testing.T) {
	if got := parseFreeBytes(freeOutput); got != 8_324_046_848 {
		t.Fatalf("parseFreeBytes = %d", got)
	}

	if got := parseFreeBytes("free: command not found\n"); got != 0 {
		t.Fatalf("an unusable output must read as 0, got %d", got)
	}
}

func TestParseMemInfoBytes(t *testing.T) {
	content := "MemTotal:        8128952 kB\nMemFree:         6029312 kB\nMemAvailable:    6896160 kB\n"

	if got := parseMemInfoBytes([]byte(content)); got != 8_128_952*1024 {
		t.Fatalf("parseMemInfoBytes = %d", got)
	}

	if got := parseMemInfoBytes([]byte("SwapTotal: 0 kB\n")); got != 0 {
		t.Fatalf("without MemTotal the answer is 0, got %d", got)
	}
}

const dfOutput = `Filesystem     1B-blocks        Used   Available Capacity Mounted on
/dev/sda1    84140195840 41051881472 42988314368      49% /
`

func TestParseAvailBytes(t *testing.T) {
	if got := parseAvailBytes(dfOutput); got != 42_988_314_368 {
		t.Fatalf("parseAvailBytes = %d", got)
	}

	if got := parseAvailBytes("df: /nowhere: No such file or directory\n"); got != 0 {
		t.Fatalf("an unusable output must read as 0, got %d", got)
	}
}

func TestGigabytes(t *testing.T) {
	for bytes, want := range map[int64]Decimal{
		0:             "0.0",
		42988314368:   "40.0",
		1073741824:    "1.0",
		1610612736:    "1.5",
		84140195840:   "78.4",
		107374182:     "0.1",
		9007199254740: "8388.6",
	} {
		if got := gigabytes(bytes); got != want {
			t.Errorf("gigabytes(%d) = %s, want %s", bytes, got, want)
		}
	}
}

const ssOutput = `State  Recv-Q Send-Q     Local Address:Port  Peer Address:Port Process
LISTEN 0      4096       127.0.0.53%lo:53         0.0.0.0:*     users:(("systemd-resolve",pid=612,fd=14))
LISTEN 0      511              0.0.0.0:80         0.0.0.0:*     users:(("nginx",pid=1042,fd=6))
LISTEN 0      128              0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=901,fd=3))
LISTEN 0      511                 [::]:80            [::]:*     users:(("nginx",pid=1042,fd=7))
LISTEN 0      128                 [::]:22            [::]:*     users:(("sshd",pid=901,fd=4))
LISTEN 0      70               127.0.0.1:33060      0.0.0.0:*
`

func TestParseSS(t *testing.T) {
	want := []Port{
		{Port: 22, Process: "sshd"},
		{Port: 53, Process: "systemd-resolve"},
		{Port: 80, Process: "nginx"},
		{Port: 33060},
	}

	if got := parseSS(ssOutput); !reflect.DeepEqual(got, want) {
		t.Fatalf("parseSS = %+v, want %+v", got, want)
	}
}

const netstatOutput = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      901/sshd: /usr/sbin
tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN      1042/nginx: master
tcp6       0      0 :::22                   :::*                    LISTEN      901/sshd: /usr/sbin
tcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN      -
udp        0      0 0.0.0.0:68              0.0.0.0:*                           700/dhclient
`

func TestParseNetstat(t *testing.T) {
	want := []Port{
		{Port: 22, Process: "sshd"},
		{Port: 443, Process: "nginx"},
		{Port: 3306},
	}

	if got := parseNetstat(netstatOutput); !reflect.DeepEqual(got, want) {
		t.Fatalf("parseNetstat = %+v, want %+v", got, want)
	}
}

func TestMergePortsDeduplicatesAndSorts(t *testing.T) {
	got := mergePorts([]Port{{Port: 443}, {Port: 80, Process: "nginx"}, {Port: 443, Process: "haproxy"}, {Port: 80}})
	want := []Port{{Port: 80, Process: "nginx"}, {Port: 443, Process: "haproxy"}}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("mergePorts = %+v, want %+v", got, want)
	}

	if empty := mergePorts(nil); len(empty) != 0 || empty == nil {
		t.Fatalf("mergePorts(nil) must be an empty slice, got %+v", empty)
	}
}

func TestParseUsers(t *testing.T) {
	content := `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
systemd-network:x:998:998::/:/usr/sbin/nologin
ubuntu:x:1000:1000:Ubuntu:/home/ubuntu:/bin/bash
alice:x:1001:1001::/home/alice:/bin/zsh
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`

	want := []string{"ubuntu", "alice"}
	if got := parseUsers([]byte(content)); !reflect.DeepEqual(got, want) {
		t.Fatalf("parseUsers = %q, want %q", got, want)
	}
}

func TestParseInstalledModules(t *testing.T) {
	report := `{
  "started_at": "2026-09-04T12:00:00Z",
  "modules": [
    { "id": "core.system", "status": "ok", "steps": [ { "step": "install-packages", "status": "ok", "ms": 12 } ] },
    { "id": "runtime.node", "status": "warn", "steps": [] }
  ],
  "failed": [],
  "warned": []
}`

	want := []string{"core.system", "runtime.node"}
	if got := parseInstalledModules([]byte(report)); !reflect.DeepEqual(got, want) {
		t.Fatalf("parseInstalledModules = %q, want %q", got, want)
	}

	if got := parseInstalledModules([]byte("not json")); len(got) != 0 {
		t.Fatalf("an unreadable report yields nothing, got %q", got)
	}
}

func TestParseAgentVersion(t *testing.T) {
	for out, want := range map[string]string{
		"pupitred 0.2.0\n": "0.2.0",
		"pupitred 0.2.0":   "0.2.0",
		"":                 "",
		"\n":               "",
	} {
		if got := parseAgentVersion(out); got != want {
			t.Errorf("parseAgentVersion(%q) = %q, want %q", out, got, want)
		}
	}
}
