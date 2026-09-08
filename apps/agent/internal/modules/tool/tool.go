// Package tool puts the tool modules in the registry and adds the secret commands that drive them.
package tool

import (
	_ "pupitre.studio/agent/internal/modules/tool/github"
	_ "pupitre.studio/agent/internal/modules/tool/neon"
	_ "pupitre.studio/agent/internal/modules/tool/onepassword"
)
