package core

import (
	"pupitre.sh/agent/internal/modules"
	"pupitre.sh/agent/internal/modules/core/hardening"
	_ "pupitre.sh/agent/internal/modules/core/system"
	"pupitre.sh/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *modules.Engine) {
	hardening.RegisterCommands(server, engine)
}
