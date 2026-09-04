// Package runtime puts the runtime modules in the registry; importing it is all that is needed.
package runtime

import (
	_ "pupitre.studio/agent/internal/modules/runtime/java"
	_ "pupitre.studio/agent/internal/modules/runtime/node"
	_ "pupitre.studio/agent/internal/modules/runtime/python"
)
