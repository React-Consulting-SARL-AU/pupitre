package core

import (
	"pupitre.studio/agent/internal/modules"
	_ "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/modules/core/hardening"
	_ "pupitre.studio/agent/internal/modules/core/system"
	"pupitre.studio/agent/internal/protocol"
)

func RegisterCommands(server *protocol.Server, engine *modules.Engine) {
	hardening.RegisterCommands(server, engine)
}
