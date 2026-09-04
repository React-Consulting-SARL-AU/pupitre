package modules

import (
	"fmt"
	"sort"

	"pupitre.studio/agent/internal/contract"
)

type Registry struct {
	modules map[string]Module
}

func NewRegistry() *Registry {
	return &Registry{modules: map[string]Module{}}
}

var defaultRegistry = NewRegistry()

func Default() *Registry {
	return defaultRegistry
}

func Register(module Module) {
	defaultRegistry.Register(module)
}

func (r *Registry) Register(module Module) {
	manifest := module.Manifest()

	if err := contract.ValidateValue("Manifest", manifest); err != nil {
		panic(fmt.Sprintf("modules: manifest of %q violates the contract: %v", manifest.ID, err))
	}

	if _, exists := r.modules[manifest.ID]; exists {
		panic(fmt.Sprintf("modules: %q is already registered", manifest.ID))
	}

	r.modules[manifest.ID] = module
}

func (r *Registry) Get(id string) (Module, bool) {
	module, ok := r.modules[id]

	return module, ok
}

func (r *Registry) All() []Module {
	modules := make([]Module, 0, len(r.modules))
	for _, module := range r.modules {
		modules = append(modules, module)
	}

	sort.Slice(modules, func(i, j int) bool {
		return before(modules[i].Manifest(), modules[j].Manifest())
	})

	return modules
}

func (r *Registry) Manifests() []contract.Manifest {
	all := r.All()

	manifests := make([]contract.Manifest, 0, len(all))
	for _, module := range all {
		manifests = append(manifests, module.Manifest())
	}

	return manifests
}

func before(a, b contract.Manifest) bool {
	if rank := categoryRank(a.Category) - categoryRank(b.Category); rank != 0 {
		return rank < 0
	}

	return a.ID < b.ID
}

func categoryRank(category string) int {
	for i, known := range contract.Categories {
		if known == category {
			return i
		}
	}

	return len(contract.Categories)
}
