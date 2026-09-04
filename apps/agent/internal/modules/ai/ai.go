// Package ai puts the agent and browser modules in the registry; importing it is all that is needed.
package ai

import (
	_ "pupitre.studio/agent/internal/modules/ai/browser"
	_ "pupitre.studio/agent/internal/modules/ai/claude"
	_ "pupitre.studio/agent/internal/modules/ai/codex"
	_ "pupitre.studio/agent/internal/modules/ai/hermes"
)
