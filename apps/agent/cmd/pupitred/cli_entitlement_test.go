//go:build !dev

package main

import (
	"encoding/json"
	"testing"
	"time"

	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/registry"
)

func lastRead(t *testing.T, fake *modtest.FakeSys, daysAgo int) {
	t.Helper()

	read := time.Now().Add(-time.Duration(daysAgo) * 24 * time.Hour)

	cache, err := json.Marshal(entitlement.Cache{State: "valid", ValidUntil: read.Add(24 * time.Hour), CheckedAt: read})
	if err != nil {
		t.Fatal(err)
	}

	fake.Files[entitlement.DefaultCachePath] = cache
}

func declareProject(fake *modtest.FakeSys) {
	fake.Files[registry.DefaultConf] = []byte("web|web|-|bun|127.0.0.1|3000|web|bun run dev --port 3000\n")
	fake.Dirs["/home/dev/projects/web"] = true
	fake.Serves("web/web", 3000)
}

func startProject(t *testing.T, fake *modtest.FakeSys) {
	t.Helper()

	lastRead(t, fake, 0)

	lines := serveOn(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"project.up","params":{"name":"web"}}`,
	)

	if decodeResponse(t, lines[1])["result"].(map[string]any)["state"] != "online" {
		t.Fatalf("the project did not start: %s", lines[1])
	}
}

func helloEntitlement(t *testing.T, line string) string {
	t.Helper()

	response := decodeResponse(t, line)
	if response["ok"] != true {
		t.Fatalf("hello failed: %s", line)
	}

	return response["result"].(map[string]any)["entitlement"].(string)
}

func TestSixDaysWithoutThePlatformChangeNothing(t *testing.T) {
	fake, _ := setupCLI(t)
	declareProject(fake)
	lastRead(t, fake, 6)

	lines := serveOn(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"catalog","params":{}}`,
		`{"id":3,"cmd":"snapshot","params":{}}`,
	)

	if got := helloEntitlement(t, lines[0]); got != "grace" {
		t.Fatalf("entitlement on the sixth day = %s", got)
	}

	if decodeResponse(t, lines[1])["ok"] != true {
		t.Fatalf("catalog refused on the sixth day: %s", lines[1])
	}

	if projects(t, lines[2]) != 1 {
		t.Fatalf("les projets ont disparu : %s", lines[2])
	}
}

func TestOnTheEighthDayTheAgentRestrictsItselfWithoutStoppingAnything(t *testing.T) {
	fake, _ := setupCLI(t)
	declareProject(fake)
	startProject(t, fake)

	lastRead(t, fake, 8)
	before := len(fake.Mutations)

	lines := serveOn(t,
		`{"id":1,"cmd":"hello","params":{"app_version":"0.2.0","protocol":2}}`,
		`{"id":2,"cmd":"install","params":{"modules":["tool.demo"]}}`,
		`{"id":3,"cmd":"snapshot","params":{}}`,
		`{"id":4,"cmd":"status","params":{}}`,
		`{"id":5,"cmd":"ping","params":{}}`,
	)

	if got := helloEntitlement(t, lines[0]); got != "restricted" {
		t.Fatalf("entitlement on the eighth day = %s", got)
	}

	if code := errorCode(t, lines[1]); code != "entitlement_required" {
		t.Fatalf("install refused with %s", code)
	}

	if state := projectState(t, lines[2]); state != "online" {
		t.Fatalf("the project is no longer running: %s", lines[2])
	}

	for _, line := range lines[3:] {
		if decodeResponse(t, line)["ok"] != true {
			t.Fatalf("command refused in restricted mode: %s", line)
		}
	}

	if len(fake.Mutations) != before {
		t.Fatalf("restricted mode touched the machine: %v", fake.Mutations[before:])
	}
}

func projectState(t *testing.T, line string) string {
	t.Helper()

	response := decodeResponse(t, line)
	if response["ok"] != true {
		t.Fatalf("snapshot failed: %s", line)
	}

	list := response["result"].(map[string]any)["projects"].([]any)
	if len(list) != 1 {
		t.Fatalf("%d projet(s) : %s", len(list), line)
	}

	return list[0].(map[string]any)["state"].(string)
}

func projects(t *testing.T, line string) int {
	t.Helper()

	response := decodeResponse(t, line)
	if response["ok"] != true {
		t.Fatalf("snapshot failed: %s", line)
	}

	return len(response["result"].(map[string]any)["projects"].([]any))
}
