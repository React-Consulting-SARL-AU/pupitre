package contract

import (
	"slices"
	"time"

	"pupitre.studio/agent/internal/i18n"
)

// For a run that died unfinished: open steps fail, and the end is set so a reader stops waiting.
func (r Report) Interrupted(now time.Time) Report {
	if r.FinishedAt != "" {
		return r
	}

	closed := r
	closed.Modules = make([]ModuleReport, 0, len(r.Modules))
	closed.Failed = slices.Clone(r.Failed)

	for _, module := range r.Modules {
		steps := make([]ReportStep, 0, len(module.Steps))
		interrupted := false

		for _, step := range module.Steps {
			if step.Status == StepStart {
				step.Status = StepFail
				step.Message = i18n.T("report.interrupted")
				interrupted = true
			}

			steps = append(steps, step)
		}

		module.Steps = steps

		if interrupted {
			module.Status = ModuleFail
			if !slices.Contains(closed.Failed, module.ID) {
				closed.Failed = append(closed.Failed, module.ID)
			}
		}

		closed.Modules = append(closed.Modules, module)
	}

	closed.FinishedAt = now.UTC().Format(time.RFC3339)

	return closed
}
