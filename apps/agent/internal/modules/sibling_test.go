package modules_test

import (
	"errors"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

func TestACommandReadsItsSiblingsOnWhatInstallJSONRemembers(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files["/etc/pupitre/install.json"] = []byte(`{"modules":["tool.demo","db.demo"],"config":{"db.demo":{"port":5433}},"secrets":{"db.demo":{"password":"` + secret + `"}}}`)
	engine := newEngine(t, fake, demoRegistry(modtest.Passing{ID: "tool.demo"}, modtest.Passing{ID: "db.demo"}), licensed(contract.LicenseDev))

	err := engine.Command("tool.demo", nil, func(ctx *modules.Context) error {
		sibling, known := ctx.Sibling("db.demo")
		if !known || sibling.Int("port") != 5433 || sibling.Secret("password") != secret {
			t.Fatalf("sibling = %v, port %d", known, sibling.Int("port"))
		}

		if _, known := ctx.Sibling("db.absent"); known {
			t.Fatal("a module the catalogue does not hold has no context")
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, known := modtest.NewContext(t, fake, modtest.Options{Module: "tool.demo"}).Sibling("db.demo"); known {
		t.Fatal("a context outside a command has no siblings")
	}
}

func TestAHiddenSecretAndAReplayOfItsOwnReachTheEvents(t *testing.T) {
	ctx := modtest.NewContext(t, modtest.NewFakeSys(), modtest.Options{Module: "core.backup"})
	ctx.Hide("key-from-a-secret-line", " ")
	ctx.Replaying("sudo pupitred dev backup now")

	err := ctx.Step("setup", func() (modules.Outcome, error) {
		return modules.Failed, errors.New("refused with key-from-a-secret-line")
	})
	if err == nil {
		t.Fatal("expected the step to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Replay != "sudo pupitred dev backup now" || strings.Contains(last.Message, "key-from-a-secret-line") {
		t.Fatalf("event = %+v", last)
	}
}
