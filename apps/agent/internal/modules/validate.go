package modules

import (
	"sort"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

/*
The configuration, weighed before the first step.

A module used to discover its own missing field halfway through its install,
which left the machine half changed and the reader with a replay command that
would fail the same way. Every field of every chosen module is now checked
first, against the rules the app applied to the same values, and an install
that would not hold is refused before anything is touched.
*/

// Preflighter is what only the machine knows: a port already listening, a directory that is a file, a time zone this kernel never heard of.
type Preflighter interface {
	Preflight(ctx *Context) []contract.FieldProblem
}

// held is what the secret line carries for one field: one value, or the ranks of a secret list.
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

		// Nothing to weigh on a module nobody has answered yet, and refusing the
		// install for it is exactly what deferring undoes.
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

// The sentence of a refusal names at most three fields: the whole list travels in the remedy, where the screen reads it field by field.
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

// Check answers what an install would refuse, without touching the machine and without a secret in sight.
func (e *Engine) Check(request Request, sink Sink) (contract.InstallCheck, error) {
	if !e.entitled() {
		return contract.InstallCheck{}, protocol.EntitlementRequired()
	}

	modules, err := e.Registry.Resolve(request.Modules)
	if err != nil {
		return contract.InstallCheck{}, err
	}

	r := e.newRun(request, sink)
	defer r.close()

	if err := e.refuseInstalledConflicts(r, modules); err != nil {
		return contract.InstallCheck{}, err
	}

	// The secrets the server already holds count as filled: a port changed on an
	// installed module must not read as a password that went missing.
	request = request.completedBy(e.recall(r))

	if err := refuseDeferringMandatory(modules, request); err != nil {
		return contract.InstallCheck{}, err
	}

	// A secret is judged by whoever holds it. The app has its vault and will
	// write the secret line at install time; the server can only see the ones it
	// already keeps, so it would call every other one missing and be wrong.
	problems := withoutSecrets(modules, fieldProblems(modules, request))

	for _, module := range modules {
		looking, ok := module.(Preflighter)
		if !ok || request.Deferred(module.Manifest().ID) {
			continue
		}

		manifest := module.Manifest()
		ctx := r.context(manifest, request.Config[manifest.ID], request.Secrets[manifest.ID])
		problems = append(problems, looking.Preflight(ctx)...)
	}

	sort.SliceStable(problems, func(i, j int) bool {
		return problems[i].Module < problems[j].Module
	})

	return contract.InstallCheck{Problems: problems, Warnings: []string{}}, nil
}
