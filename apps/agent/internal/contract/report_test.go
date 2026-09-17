package contract_test

import (
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
)

// A report with no end and nobody holding the lock is the trace of a run that died: every step left open fails with the reason, and the end is set so a reader stops waiting.
func TestInterruptedClosesEveryOpenStepAsAFailure(t *testing.T) {
	report := contract.Report{
		StartedAt: "2026-09-04T12:00:00Z",
		Modules: []contract.ModuleReport{
			{ID: "core.system", Status: contract.ModuleOK, Steps: []contract.ReportStep{{Step: "apt", Status: contract.StepOK, Ms: 3}}},
			{ID: "db.postgres", Status: contract.ModuleOK, Steps: []contract.ReportStep{
				{Step: "apt", Status: contract.StepOK, Ms: 3},
				{Step: "cluster", Status: contract.StepStart, Replay: "pupitred install --only=db.postgres"},
			}},
		},
		Failed: []string{},
	}

	now := time.Date(2026, time.September, 4, 12, 30, 0, 0, time.UTC)
	closed := report.Interrupted(now)

	if closed.FinishedAt != "2026-09-04T12:30:00Z" {
		t.Fatalf("finished_at = %q", closed.FinishedAt)
	}

	step := closed.Modules[1].Steps[1]
	if step.Status != contract.StepFail || step.Message == "" || step.Replay == "" {
		t.Fatalf("the open step must fail with a reason and keep its replay: %+v", step)
	}
	if closed.Modules[1].Status != contract.ModuleFail || len(closed.Failed) != 1 || closed.Failed[0] != "db.postgres" {
		t.Fatalf("the module of the open step fails: %+v, failed = %v", closed.Modules[1], closed.Failed)
	}
	if closed.Modules[0].Status != contract.ModuleOK || report.Modules[1].Steps[1].Status != contract.StepStart {
		t.Fatalf("what ended stays as it was, and the report given is not written over: %+v", report)
	}

	if err := contract.ValidateValue("ReportResult", closed); err != nil {
		t.Fatalf("the closed report violates the contract: %v", err)
	}
}

// A report already ended is handed back as it is.
func TestInterruptedLeavesAFinishedReportAlone(t *testing.T) {
	report := contract.Report{StartedAt: "2026-09-04T12:00:00Z", FinishedAt: "2026-09-04T12:01:00Z", Failed: []string{"db.postgres"}}

	if closed := report.Interrupted(time.Now()); closed.FinishedAt != report.FinishedAt || len(closed.Failed) != 1 {
		t.Fatalf("got %+v", closed)
	}
}
