package modules

import (
	"fmt"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

func (r *Registry) Resolve(ids []string) ([]Module, error) {
	selected := map[string]Module{}
	queue := append([]string(nil), ids...)

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]

		if _, seen := selected[id]; seen {
			continue
		}

		module, ok := r.modules[id]
		if !ok {
			return nil, moduleNotFound(id)
		}

		selected[id] = module
		queue = append(queue, module.Manifest().Requires...)
	}

	if err := checkConflicts(selected); err != nil {
		return nil, err
	}

	return order(selected)
}

func (r *Registry) Lookup(ids []string) ([]Module, error) {
	modules := make([]Module, 0, len(ids))
	seen := map[string]bool{}

	for _, id := range ids {
		if seen[id] {
			continue
		}

		module, ok := r.modules[id]
		if !ok {
			return nil, moduleNotFound(id)
		}

		seen[id] = true
		modules = append(modules, module)
	}

	return modules, nil
}

func checkConflicts(selected map[string]Module) error {
	for id, module := range selected {
		for _, other := range module.Manifest().Conflicts {
			if _, both := selected[other]; both {
				first, second := id, other
				if first > second {
					first, second = second, first
				}

				return protocol.NewError(contract.ErrorBadRequest, fmt.Sprintf("les modules %s et %s sont en conflit", first, second)).
					WithFix("Retire l'un des deux de la sélection.")
			}
		}
	}

	return nil
}

func order(selected map[string]Module) ([]Module, error) {
	remaining := map[string]int{}
	dependents := map[string][]string{}

	for id, module := range selected {
		remaining[id] = 0
		for _, required := range module.Manifest().Requires {
			if _, ok := selected[required]; ok {
				remaining[id]++
				dependents[required] = append(dependents[required], id)
			}
		}
	}

	var ordered []Module
	for len(remaining) > 0 {
		ready := readyModules(selected, remaining)
		if len(ready) == 0 {
			return nil, dependencyCycle(remaining)
		}

		next := ready[0]
		ordered = append(ordered, selected[next])
		delete(remaining, next)

		for _, dependent := range dependents[next] {
			remaining[dependent]--
		}
	}

	return ordered, nil
}

func readyModules(selected map[string]Module, remaining map[string]int) []string {
	var ready []string
	for id, count := range remaining {
		if count == 0 {
			ready = append(ready, id)
		}
	}

	sort.Slice(ready, func(i, j int) bool {
		return before(selected[ready[i]].Manifest(), selected[ready[j]].Manifest())
	})

	return ready
}

func dependencyCycle(remaining map[string]int) error {
	ids := make([]string, 0, len(remaining))
	for id := range remaining {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	return protocol.NewError(contract.ErrorInternal, "dépendances circulaires entre les modules "+strings.Join(ids, ", "))
}

func moduleNotFound(id string) error {
	return protocol.NewError(contract.ErrorModuleNotFound, "module inconnu : "+id).
		WithFix("Demande catalog pour la liste des modules de cet agent.")
}
