package modtest

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
)

const password = "s3cret-de-test"

var demo = Passing{ID: "tool.demo", Unit: "demo", EnvKey: "DEMO_PASSWORD", Port: 8080}

func TestInstallAndConfigureAreIdempotent(t *testing.T) {
	fake := NewFakeSys()
	fake.Packages["tool-demo"] = "1.0"
	fake.Files["/etc/pupitre/demo/tool.demo.conf"] = []byte("port=8080\n")
	fake.Files["/etc/pupitre/env"] = []byte("DEMO_PASSWORD=" + password + "\n")
	fake.Units["demo"] = UnitActive
	ctx := NewContext(t, fake, Options{Manifest: demo.Manifest(), Secrets: Secrets{"password": password}})

	if err := demo.Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := demo.Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Fatalf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}

	if fake.Restarts["demo"] != 0 || len(fake.Mutations) != 0 {
		t.Fatalf("installed machine was touched: %v", fake.Mutations)
	}
}

func TestSecretNeverLeaks(t *testing.T) {
	fake := NewFakeSys()
	fake.Packages["tool-demo"] = "1.0"
	ctx := NewContext(t, fake, Options{Manifest: demo.Manifest(), Secrets: Secrets{"password": password}})

	if err := demo.Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, line := range ctx.Output() {
		if strings.Contains(line, password) {
			t.Fatalf("secret in output: %s", line)
		}
	}

	if fake.EnvValue("DEMO_PASSWORD") != password {
		t.Fatal("password must be stored in /etc/pupitre/env")
	}

	status, err := demo.Status(ctx)
	if err != nil || status.Credentials["Mot de passe"] != "DEMO_PASSWORD" || status.State != contract.ServiceRunning {
		t.Fatalf("status = %+v, %v", status, err)
	}

	if err := contract.ValidateValue("ServiceStatusResult", status.Service(demo.Manifest())); err != nil {
		t.Fatal(err)
	}
}

func TestFailedStepReportsReplay(t *testing.T) {
	fake := NewFakeSys()
	fake.FailPackage("tool-demo", "E: Unable to locate package tool-demo")
	ctx := NewContext(t, fake, Options{Manifest: demo.Manifest()})

	err := demo.Install(ctx)
	if err == nil {
		t.Fatal("expected install to fail")
	}

	last := ctx.Events()[len(ctx.Events())-1]
	if last.Status != contract.StepFail || last.Replay != "sudo pupitred install --only=tool.demo" || last.Ms == 0 {
		t.Fatalf("unexpected event: %+v", last)
	}

	stepErr, ok := err.(*modules.StepError)
	if !ok || stepErr.Step != "install-package" || !strings.Contains(stepErr.Message, "Unable to locate package tool-demo") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFailingModuleFailsWhereAsked(t *testing.T) {
	broken := Failing{ID: "db.broken", FailAt: "write-config", Message: "disque plein"}
	ctx := NewContext(t, NewFakeSys(), Options{Module: broken.ID})

	if err := broken.Install(ctx); err != nil {
		t.Fatalf("install must pass: %v", err)
	}

	err := broken.Configure(ctx)
	if err == nil || !strings.Contains(err.Error(), "db.broken · write-config : disque plein") {
		t.Fatalf("unexpected error: %v", err)
	}

	var statuses []string
	for _, event := range ctx.Events() {
		statuses = append(statuses, event.Step+"="+string(event.Status))
	}

	if strings.Join(statuses, " ") != "prepare=ok install-package=ok write-config=fail" {
		t.Fatalf("events = %v", statuses)
	}
}

var (
	_ modules.Module = Passing{}
	_ modules.Module = Failing{}
)
