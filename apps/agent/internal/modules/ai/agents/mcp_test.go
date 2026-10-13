package agents

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
)

const claudeCLI = Home + "/.local/bin/claude"

var registered = `{"numStartups":12,"mcpServers":{"pupitre":{"type":"stdio","command":"` + sudo.Binary + `","args":["mcp"],"env":{}}}}`

func withClaude() Target {
	target := demo
	target.MCP = ClaudeMCP(claudeCLI)

	return target
}

func mcpCalls(fake *modtest.FakeSys) []sys.Command {
	var calls []sys.Command

	for _, call := range fake.Calls {
		if call.Argv[0] == claudeCLI {
			calls = append(calls, call)
		}
	}

	return calls
}

func TestClaudeCodeIsGivenThePupitreServerByItsOwnCLI(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Home+"/.claude.json"] = []byte(`{"numStartups":12,"mcpServers":{"pupitre":{"command":"/opt/old/pupitred","args":["mcp"]}}}`)
	ctx := newContext(t, fake)

	if Configured(ctx, withClaude()) {
		t.Fatal("nothing is registered yet")
	}

	if err := Deploy(ctx, withClaude()); err != nil {
		t.Fatal(err)
	}

	calls := mcpCalls(fake)
	if len(calls) != 2 {
		t.Fatalf("calls = %v", fake.Commands())
	}

	add := strings.Join(calls[1].Argv, " ")
	if add != claudeCLI+" mcp add --scope user pupitre -- "+sudo.Binary+" mcp" || calls[1].User != User {
		t.Fatalf("the server is added for dev, at user scope: %q as %q", add, calls[1].User)
	}

	if !slices.Contains(calls[0].Argv, "remove") {
		t.Fatalf("a stale entry under our name goes first: %v", calls[0].Argv)
	}

	if !Configured(ctx, withClaude()) || !strings.Contains(string(fake.Files[Home+"/.claude.json"]), `"numStartups":12`) {
		t.Fatalf("a registered server reads as configured, the rest of the file kept: %s", fake.Files[Home+"/.claude.json"])
	}

	fake.Calls = nil
	again := newContext(t, fake)

	if err := Deploy(again, withClaude()); err != nil {
		t.Fatal(err)
	}

	if len(mcpCalls(fake)) != 0 {
		t.Fatalf("a registered server is not asked again: %v", fake.Commands())
	}

	for _, event := range again.Events() {
		if event.Step == "register-mcp" && event.Status != contract.StepSkip {
			t.Fatalf("register-mcp: want skip, got %s", event.Status)
		}
	}
}

func TestAnAddThatRegistersNothingFailsTheStep(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("mcp add", "")

	err := Deploy(newContext(t, fake), withClaude())
	if err == nil || !strings.Contains(err.Error(), ".claude.json") {
		t.Fatalf("the step must say the server is still missing: %v", err)
	}
}

func TestUnregisterRemovesOnlyOurServer(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[Home+"/.claude.json"] = []byte(registered)

	if err := Unregister(newContext(t, fake), withClaude()); err != nil {
		t.Fatal(err)
	}

	calls := mcpCalls(fake)
	if len(calls) != 1 || strings.Join(calls[0].Argv[1:], " ") != "mcp remove --scope user pupitre" {
		t.Fatalf("calls = %v", fake.Commands())
	}

	fake.Calls = nil
	fake.Files[Home+"/.claude.json"] = []byte(`{"mcpServers":{}}`)

	if err := Unregister(newContext(t, fake), withClaude()); err != nil || len(mcpCalls(fake)) != 0 {
		t.Fatalf("nothing registered, nothing asked: %v %v", err, fake.Commands())
	}
}

func TestClaudeReadsOurServerOnly(t *testing.T) {
	for config, want := range map[string]bool{
		registered: true,
		`{"mcpServers":{"pupitre":{"command":"/usr/bin/other","args":["mcp"]}}}`:                false,
		`{"mcpServers":{"pupitre":{"command":"` + sudo.Binary + `","args":["mcp","--debug"]}}}`: false,
		`{"mcpServers":{"playwright":{"command":"npx"}}}`:                                       false,
		`not json`: false,
	} {
		if got := claudeRegistered([]byte(config)); got != want {
			t.Errorf("%s: got %v, want %v", config, got, want)
		}
	}
}

func TestCodexReadsOurTableOnly(t *testing.T) {
	ours := "model = \"gpt-5\"\n\n[mcp_servers.pupitre]\ncommand = \"" + sudo.Binary + "\"\nargs = [ \"mcp\" ]\n\n[mcp_servers.other]\ncommand = \"npx\"\nargs = [\"x\"]\n"
	theirs := "[mcp_servers.other]\ncommand = \"" + sudo.Binary + "\"\nargs = [\"mcp\"]\n"
	stale := "[mcp_servers.pupitre]\ncommand = \"/opt/old/pupitred\"\nargs = [\"mcp\"]\n"

	for config, want := range map[string]bool{ours: true, theirs: false, stale: false, "": false} {
		if got := codexRegistered([]byte(config)); got != want {
			t.Errorf("%q: got %v, want %v", config, got, want)
		}
	}
}

func TestTheRetiredCaptureSkillGoesAndAClientsOwnStays(t *testing.T) {
	fake := modtest.NewFakeSys()
	ours := "---\nname: capture\ndescription: Show an image or a web page from this server — capture a page with shot\n---\n"
	fake.Files[SkillsDir+"/capture/SKILL.md"] = []byte(ours)
	fake.Files[demo.ConfigDir+"/skills/capture/SKILL.md"] = []byte(ours)
	fake.Files[demo.ConfigDir+"/skills/capture/notes.md"] = []byte("ours too")
	ctx := newContext(t, fake)

	if err := Deploy(ctx, demo); err != nil {
		t.Fatal(err)
	}

	for path := range fake.Files {
		if strings.Contains(path, "/capture/") {
			t.Errorf("%s must go with the retired skill", path)
		}
	}

	if !Configured(ctx, demo) {
		t.Fatal("once retired, the target is configured")
	}

	theirs := modtest.NewFakeSys()
	theirs.Files[SkillsDir+"/capture/SKILL.md"] = []byte("---\nname: capture\ndescription: My own screen recorder\n---\n")

	if err := Deploy(newContext(t, theirs), demo); err != nil {
		t.Fatal(err)
	}

	if len(theirs.Files[SkillsDir+"/capture/SKILL.md"]) == 0 {
		t.Fatal("a client's skill under the same name is theirs")
	}
}
