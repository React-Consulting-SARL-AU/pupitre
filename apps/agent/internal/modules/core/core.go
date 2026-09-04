package core

import (
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/core/hardening"
	_ "pupitre.studio/agent/internal/modules/core/system"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *modules.Engine) {
	hardening.RegisterCommands(server, engine)
}
