package agents

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

var demo = Target{ConfigDir: Home + "/.demo", ContextFile: "DEMO.md", Skills: true, Subagents: true}

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Module: "ai.claude"})
}

func TestTheFiveSkillsAndTheSubagentAreLaidDown(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := Deploy(newContext(t, fake), demo); err != nil {
		t.Fatal(err)
	}

	for _, skill := range []string{"branch", "capture", "pr", "server-dev", "ship"} {
		body := fake.Files[SkillsDir+"/"+skill+"/SKILL.md"]
		if len(body) == 0 {
			t.Errorf("the skill %s is missing", skill)
			continue
		}

		if !strings.Contains(string(body), "---") {
			t.Errorf("the skill %s lost its front matter", skill)
		}

		if string(fake.Files[demo.ConfigDir+"/skills/"+skill+"/SKILL.md"]) != string(body) {
			t.Errorf("the skill %s must be the same on both sides", skill)
		}
	}

	if len(fake.Files[demo.ConfigDir+"/agents/git-shipper.md"]) == 0 {
		t.Error("the subagent is missing")
	}

	if fake.Owners[SkillsDir+"/ship/SKILL.md"] != User+":"+User {
		t.Errorf("the skills belong to %s, got %q", User, fake.Owners[SkillsDir+"/ship/SKILL.md"])
	}
}

func TestTheContextNamesWhatTheAgentNeedsToKnow(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := newContext(t, fake)

	if err := Deploy(ctx, demo); err != nil {
		t.Fatal(err)
	}

	written := string(fake.Files[demo.ConfigDir+"/DEMO.md"])
	for _, want := range []string{ProjectsDir, SkillsDir, GalleryDir, "`dev`", "serveur Linux"} {
		if !strings.Contains(written, want) {
			t.Errorf("the context lacks %q:\n%s", want, written)
		}
	}

	if !Configured(ctx, demo) {
		t.Fatal("a written context reads as configured")
	}
}

func TestASecondDeployChangesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()

	if err := Deploy(newContext(t, fake), demo); err != nil {
		t.Fatal(err)
	}

	fake.Mutations = nil
	ctx := newContext(t, fake)

	if err := Deploy(ctx, demo); err != nil {
		t.Fatal(err)
	}

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

// A skill the client edited on the machine goes back to the version this agent carries: the folder is ours, his own skills live beside it.
func TestAnEditedSkillIsPutBack(t *testing.T) {
	fake := modtest.NewFakeSys()
	if err := Deploy(newContext(t, fake), demo); err != nil {
		t.Fatal(err)
	}

	original := string(fake.Files[SkillsDir+"/ship/SKILL.md"])
	fake.Files[SkillsDir+"/ship/SKILL.md"] = []byte("modifié")
	fake.Files[SkillsDir+"/perso/SKILL.md"] = []byte("le skill du client")

	if err := Deploy(newContext(t, fake), demo); err != nil {
		t.Fatal(err)
	}

	if string(fake.Files[SkillsDir+"/ship/SKILL.md"]) != original {
		t.Error("the shipped skill must be restored")
	}

	if string(fake.Files[SkillsDir+"/perso/SKILL.md"]) != "le skill du client" {
		t.Error("a skill the client added is none of our business")
	}
}
