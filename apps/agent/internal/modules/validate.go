package modules

import (
	"sort"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

type Preflighter interface {
	Preflight(ctx *Context) []contract.FieldProblem
}

func held(secrets map[string]map[string]string) contract.SecretsHeld {
	return func(module, key string) []string {
		values := secrets[module]
		if values == nil {
			return nil
		}

		var kept []string

		if strings.TrimSpace(values[key]) != "" {
			kept = append(kept, values[key])
		}

		for rank := 0; ; rank++ {
			value, listed := values[key+"."+strconv.Itoa(rank)]
			if !listed {
				break
			}

			if strings.TrimSpace(value) != "" {
				kept = append(kept, value)
			}
		}

		return kept
	}
}

func fieldProblems(modules []Module, request Request) []contract.FieldProblem {
	kept := held(request.Secrets)
	problems := []contract.FieldProblem{}

	for _, module := range modules {
		manifest := module.Manifest()

		if request.Deferred(manifest.ID) {
			continue
		}

		problems = append(problems, contract.ValidateModule(manifest, request.Config[manifest.ID], kept)...)
	}

	return problems
}

func withoutSecrets(modules []Module, problems []contract.FieldProblem) []contract.FieldProblem {
	secret := map[string]bool{}

	for _, module := range modules {
		manifest := module.Manifest()
		for _, field := range manifest.Fields {
			if field.Kind == contract.FieldSecret || (field.Kind == contract.FieldList && field.Items == contract.ItemsSecret) {
				secret[manifest.ID+"."+field.Key] = true
			}
		}
	}

	kept := []contract.FieldProblem{}

	for _, problem := range problems {
		if !secret[problem.Module+"."+problem.Field] {
			kept = append(kept, problem)
		}
	}

	return kept
}

// The refusal sentence names at most three fields; the whole list travels in the remedy.
const named = 3

func invalidConfig(problems []contract.FieldProblem) error {
	labels := make([]string, 0, len(problems))

	for _, problem := range problems[:min(len(problems), named)] {
		labels = append(labels, i18n.T("field.invalid.one", problem.Module, problem.Field, problem.Message))
	}

	return protocol.NewError(contract.ErrorInvalidConfig, i18n.T("field.invalid.config", strings.Join(labels, " · "))).
		WithFix(i18n.T("field.invalid.config.fix")).
		WithRemedy(contract.InvalidFields(problems))
}

func (e *Engine) Check(request Request, sink Sink) (contract.InstallCheck, error) {
	if !e.licensed() {
		return contract.InstallCheck{}, protocol.LicenseRequired()
	}

	modules, err := e.Registry.Resolve(request.Modules)
	if err != nil {
		return contract.InstallCheck{}, err
	}

	r := e.newRun(request, sink)
	defer r.close()

	// Secrets the server already holds count as filled: a port change must not read as a missing password.
	recalled := e.recall(r)
	if err := e.refuseInstalledConflicts(r, modules, recalled); err != nil {
		return contract.InstallCheck{}, err
	}

	request = request.completedBy(recalled)

	if err := refuseDeferringMandatory(modules, request); err != nil {
		return contract.InstallCheck{}, err
	}

	// Only the app's vault knows every secret; the server would wrongly call the ones it lacks missing.
	problems := withoutSecrets(modules, fieldProblems(modules, request))

	for _, module := range modules {
		looking, ok := module.(Preflighter)
		if !ok || request.Deferred(module.Manifest().ID) {
			continue
		}

		manifest := module.Manifest()
		ctx := r.context(manifest, request.Config[manifest.ID], request.Secrets[manifest.ID])
		ctx.held = recalled.Config[manifest.ID]
		problems = append(problems, looking.Preflight(ctx)...)
	}

	sort.SliceStable(problems, func(i, j int) bool {
		return problems[i].Module < problems[j].Module
	})

	return contract.InstallCheck{Problems: problems, Warnings: []string{}}, nil
}
