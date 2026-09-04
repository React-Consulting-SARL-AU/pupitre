// Package editor puts the remote editor modules in the registry; importing it is all that is needed.
package editor

import (
	_ "pupitre.studio/agent/internal/modules/editor/jetbrains"
	_ "pupitre.studio/agent/internal/modules/editor/vscode"
	_ "pupitre.studio/agent/internal/modules/editor/zed"
)
