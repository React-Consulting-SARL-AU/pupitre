//go:build !dev

package main

import (
	"strconv"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

const buildEntitlement = contract.EntitlementValid

func TestInstallRefusesOnAServerWithoutAToken(t *testing.T) {
	fake, _ := setupCLI(t)
	unenrol(fake)

	code, _, stderr := runCLI(t, "install", "--only=tool.demo")
	if code != 1 || !strings.Contains(stderr, "entitlement_required") {
		t.Fatalf("code = %d, stderr:\n%s", code, stderr)
	}

	// The ledger stamp of a machine never configured is the one write every start makes, serve included.
	for _, mutation := range fake.Mutations {
		if !strings.Contains(mutation, "migrations.json") && mutation != "mkdir /etc/pupitre" {
			t.Fatalf("the machine was touched without entitlement: %v", fake.Mutations)
		}
	}

	if len(fake.Calls) != 0 {
		t.Fatalf("the machine was touched without entitlement: %v", fake.Commands())
	}

	t.Logf("pupitred install (release build):\n%s", stderr)
}

func TestACopiedBinaryAnswersHelloPingAndDiagAlone(t *testing.T) {
	fake, _ := setupCLI(t)
	unenrol(fake)

	answered := map[string]bool{}
	requests := []string{`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`}
	commands := []string{"ping", "diag", "snapshot", "status", "agent.upgrade", "probe", "catalog", "keys.list", "keys.sync", "project.list"}

	for i, cmd := range commands {
		requests = append(requests, `{"id":`+strconv.Itoa(i+2)+`,"cmd":"`+cmd+`","params":{}}`)
	}

	lines := serveOn(t, requests...)

	hello := decodeResponse(t, lines[0])
	if hello["ok"] != true || hello["result"].(map[string]any)["entitlement"] != "restricted" {
		t.Fatalf("hello = %s", lines[0])
	}

	for i, cmd := range commands {
		answered[cmd] = decodeResponse(t, lines[i+1])["ok"] == true
	}

	for _, cmd := range []string{"ping", "diag"} {
		if !answered[cmd] {
			t.Errorf("%s should answer: %s", cmd, lines[indexOf(commands, cmd)+1])
		}
	}

	for _, cmd := range commands {
		if cmd == "ping" || cmd == "diag" || !answered[cmd] {
			continue
		}

		t.Errorf("%s answered without a token", cmd)
	}

	for i, cmd := range commands {
		if answered[cmd] {
			continue
		}

		if code := errorCode(t, lines[i+1]); code != "entitlement_required" {
			t.Errorf("%s refused with %s", cmd, code)
		}
	}
}

func indexOf(values []string, wanted string) int {
	for i, value := range values {
		if value == wanted {
			return i
		}
	}

	return -1
}
