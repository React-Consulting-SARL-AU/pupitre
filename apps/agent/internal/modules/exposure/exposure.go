// Package exposure puts the exposure modules in the registry and adds the tunnel commands that drive them.
package exposure

import (
	_ "pupitre.studio/agent/internal/modules/exposure/cloudflare"
	_ "pupitre.studio/agent/internal/modules/exposure/ssh"
)
