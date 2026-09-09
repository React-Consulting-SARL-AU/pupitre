// Package exposure puts the exposure modules in the registry and adds the commands that drive whichever one is installed.
package exposure

import (
	_ "pupitre.studio/agent/internal/modules/exposure/caddy"
	_ "pupitre.studio/agent/internal/modules/exposure/cloudflare"
)
