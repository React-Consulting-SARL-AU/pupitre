package state

import (
	"sort"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
)

// The three agent kinds of the protocol, each with the module that installs it and the program it leaves on PATH.
var agentPrograms = map[string]struct {
	Module  string
	Program string
}{
	"claude": {"ai.claude", "claude"},
	"codex":  {"ai.codex", "codex"},
	"hermes": {"ai.hermes", "hermes"},
}

type AgentSession struct {
	Command string
	Session string
}

// One tmux session per agent and per project: -A attaches to the one already open instead of starting a second conversation beside it.
func (r *Reader) OpenAgent(kind, name string) (AgentSession, error) {
	agent, known := agentPrograms[kind]
	if !known {
		return AgentSession{}, protocol.NewError(contract.ErrorBadRequest, "agent inconnu : "+kind).
			WithFix("Les agents sont " + strings.Join(agentKinds(), ", ") + ".")
	}

	project, declared := r.registry().Get(name)
	if !declared {
		return AgentSession{}, registry.NotFound(name)
	}

	if err := r.requireAgent(agent.Module); err != nil {
		return AgentSession{}, err
	}

	dir := project.Path(r.options.Paths.Resolved().Projects)
	session := kind + "-" + project.Name

	return AgentSession{
		Command: strings.Join([]string{"tmux", "new-session", "-A", "-s", session, "-c", dir, agent.Program}, " "),
		Session: session,
	}, nil
}

func (r *Reader) requireAgent(id string) error {
	module, known := r.module(id)
	if !known {
		return modules.NotInstalled(id, id)
	}

	status, err := module.Status(r.moduleContext(module))
	if err != nil {
		return err
	}

	if !status.Installed {
		return modules.NotInstalled(id, module.Manifest().Name)
	}

	return nil
}

func agentKinds() []string {
	kinds := make([]string, 0, len(agentPrograms))
	for kind := range agentPrograms {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)

	return kinds
}
