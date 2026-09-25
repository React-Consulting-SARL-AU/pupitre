//go:build staging

package staging

import (
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

const fakeAgents = "/home/dev/.local/bin"

// sleep runs under each agent's name because sessions.list tells a session's kind by its argv.
const sessionFixtureScript = `set -e
mkdir -p ` + fakeAgents + ` /home/dev/.cache/JetBrains/RemoteDev/bin
ln -sf /usr/bin/sleep ` + fakeAgents + `/claude
ln -sf /usr/bin/sleep ` + fakeAgents + `/codex
printf '#!/bin/sh\nsleep 3600\n' > /home/dev/.cache/JetBrains/RemoteDev/bin/remote-dev-server.sh
chmod +x /home/dev/.cache/JetBrains/RemoteDev/bin/remote-dev-server.sh
setsid ` + fakeAgents + `/claude 3600 </dev/null >/dev/null 2>&1 &
setsid ` + fakeAgents + `/codex 3600 </dev/null >/dev/null 2>&1 &
setsid /home/dev/.cache/JetBrains/RemoteDev/bin/remote-dev-server.sh </dev/null >/dev/null 2>&1 &
sleep 1
`

func writeSessionFixture(t *testing.T, host string) {
	t.Helper()

	write(t, host, "/home/dev/sessions.sh", sessionFixtureScript)
	ssh(t, host, "chown", "dev:dev", "/home/dev/sessions.sh")
	ssh(t, host, "su", "-", "dev", "-c", "'sh /home/dev/sessions.sh'")

	t.Cleanup(func() {
		sshCommand(host, "pkill", "-u", "dev", "-f", "3600").Run()
		sshCommand(host, "rm", "-f", "/home/dev/sessions.sh", fakeAgents+"/claude", fakeAgents+"/codex").Run()
	})
}

func sessionsOf(t *testing.T, host string) []contract.Session {
	t.Helper()

	return decode[struct {
		Sessions []contract.Session `json:"sessions"`
	}](t, agent(t, host, request{Cmd: "sessions.list"})[0].Result).Sessions
}

func TestSessionsListTellsTheKindsApart(t *testing.T) {
	host := stagingHost(t)

	writeSessionFixture(t, host)

	kinds := map[string]bool{}

	for _, session := range sessionsOf(t, host) {
		if session.PID <= 1 || session.Command == "" {
			t.Fatalf("unexpected session: %+v", session)
		}

		kinds[session.Kind] = true
	}

	for _, kind := range []string{"claude", "codex", "ide"} {
		if !kinds[kind] {
			t.Fatalf("no session of kind %q among %v", kind, kinds)
		}
	}

	if !strings.Contains(string(agent(t, host, request{Cmd: "snapshot"})[0].Result), `"sessions"`) {
		t.Fatal("the snapshot carries the same sessions")
	}
}

func TestProcessKillRefusesAPidThatIsNotTheProjectsUser(t *testing.T) {
	host := stagingHost(t)

	pid, err := strconv.Atoi(strings.TrimSpace(ssh(t, host, "pgrep", "-u", "root", "-o", "sshd")))
	if err != nil {
		t.Skipf("no root process to aim at: %v", err)
	}

	refused := attempt(t, host, request{Cmd: "process.kill", Params: map[string]any{"pid": pid}})[0]
	if refused.OK {
		t.Fatalf("pid %d belongs to root and must never be stopped from Pupitre", pid)
	}

	failure := decode[protocol.Error](t, refused.Error)
	if failure.Code != contract.ErrorBadRequest || failure.Fix == "" {
		t.Fatalf("unexpected refusal: %+v", failure)
	}

	// ssh fails the test on a non-zero exit: the process must still be alive.
	ssh(t, host, "kill", "-0", strconv.Itoa(pid))
}

func TestProcessKillStopsAProcessOfDevAndProcessesListShowsIt(t *testing.T) {
	host := stagingHost(t)

	writeSessionFixture(t, host)

	sessions := sessionsOf(t, host)
	if len(sessions) == 0 {
		t.Fatal("the fixture must have left at least one session")
	}

	target := sessions[0].PID

	agent(t, host, request{Cmd: "process.kill", Params: map[string]any{"pid": target, "force": true}})

	for _, session := range sessionsOf(t, host) {
		if session.PID == target {
			t.Fatalf("pid %d is still listed after process.kill", target)
		}
	}

	processes := decode[struct {
		Processes []contract.Process `json:"processes"`
	}](t, agent(t, host, request{Cmd: "processes.list"})[0].Result).Processes
	if len(processes) == 0 {
		t.Fatal("processes.list must show what runs on the machine")
	}
}

func TestSessionsCleanLeavesTheYoungOnesAlone(t *testing.T) {
	host := stagingHost(t)

	writeSessionFixture(t, host)

	before := len(sessionsOf(t, host))

	killed := decode[struct {
		Killed int `json:"killed"`
	}](t, agent(t, host, request{Cmd: "sessions.clean"})[0].Result).Killed
	if killed != 0 {
		t.Fatalf("sessions started a second ago are far from the threshold, got %d killed", killed)
	}

	if after := len(sessionsOf(t, host)); after != before {
		t.Fatalf("got %d sessions after the clean, want the %d of before", after, before)
	}
}

func TestShotsAreListedUnderTheGalleryAddress(t *testing.T) {
	host := stagingHost(t)

	ssh(t, host, "su", "-", "dev", "-c", "'mkdir -p /home/dev/shots/2026-09-04 && head -c 2048 /dev/urandom > /home/dev/shots/2026-09-04/fixture.png'")
	t.Cleanup(func() { sshCommand(host, "rm", "-rf", "/home/dev/shots/2026-09-04").Run() })

	address := decode[struct {
		URL string `json:"url"`
	}](t, agent(t, host, request{Cmd: "shots.url"})[0].Result).URL
	if !strings.HasPrefix(address, "http") {
		t.Fatalf("unexpected gallery address %q", address)
	}

	shots := decode[struct {
		Shots []contract.Shot `json:"shots"`
	}](t, agent(t, host, request{Cmd: "shots.list"})[0].Result).Shots

	for _, shot := range shots {
		if shot.Path == "2026-09-04/fixture.png" && shot.SizeBytes == 2048 {
			return
		}
	}

	t.Fatalf("the capture is missing from the gallery: %+v", shots)
}

func TestDoctorAndDiagAnswerWithoutTouchingAnything(t *testing.T) {
	host := stagingHost(t)

	checks := decode[struct {
		Checks []contract.DoctorCheck `json:"checks"`
	}](t, agent(t, host, request{Cmd: "doctor"})[0].Result).Checks
	if len(checks) == 0 {
		t.Fatal("doctor must report at least the tools of the machine")
	}

	for _, check := range checks {
		if !check.OK && check.Fix == "" {
			t.Errorf("a failing check must carry its fix: %+v", check)
		}
	}

	report := decode[contract.Diag](t, agent(t, host, request{Cmd: "diag"})[0].Result)
	if report.GeneratedAt == "" || !strings.Contains(report.Report, "pupitred") {
		t.Fatalf("unexpected diag: %+v", report)
	}
}
