package state

import (
	"slices"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/runtime/mise"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys/file"
)

// A pin names a runtime the catalogue holds and a version this machine really carries: anything else is refused before the row is written, with the service to open.
func (r *Reader) checkRuntimes(runtimes map[string]string) error {
	tools := make([]string, 0, len(runtimes))
	for tool := range runtimes {
		tools = append(tools, tool)
	}
	sort.Strings(tools)

	for _, tool := range tools {
		runtime, known := mise.RuntimeOf(tool)
		if !known {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.project.runtime.unknown", tool)).
				WithFix(i18n.T("state.project.runtime.unknown.fix", strings.Join(runtimeTools(), ", ")))
		}

		version := runtimes[tool]
		if !slices.Contains(runtime.Held(r.ctx()), version) {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.project.runtime.missing", r.runtimeName(tool), version)).
				WithFix(i18n.T("state.project.runtime.missing.fix", version, r.runtimeName(tool)))
		}
	}

	return nil
}

// PinRuntimes lays a declared project's pins where mise reads them, as project.add does once the folder is there.
func (r *Reader) PinRuntimes(name string) error {
	project, err := r.project(name)
	if err != nil {
		return err
	}

	return r.pinRuntimes(project)
}

// The pins land where mise reads them, once the folder is there: a repository not yet cloned gets them with its clone.
func (r *Reader) pinRuntimes(project registry.Project) error {
	root := project.Path(r.options.Paths.Resolved().Projects)
	if !file.Exists(r.ctx(), root) {
		return nil
	}

	_, err := mise.Pin(r.ctx(), root, project.Runtimes)

	return err
}

func (r *Reader) runtimeName(tool string) string {
	if module, known := r.options.Registry.Get("runtime." + tool); known {
		return module.Manifest().Name
	}

	return tool
}

func runtimeTools() []string {
	runtimes := mise.Runtimes()

	tools := make([]string, 0, len(runtimes))
	for _, runtime := range runtimes {
		tools = append(tools, runtime.Tool)
	}

	return tools
}
