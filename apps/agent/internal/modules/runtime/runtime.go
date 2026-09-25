package runtime

import (
	_ "pupitre.studio/agent/internal/modules/runtime/docker"
	_ "pupitre.studio/agent/internal/modules/runtime/golang"
	_ "pupitre.studio/agent/internal/modules/runtime/java"
	_ "pupitre.studio/agent/internal/modules/runtime/node"
	_ "pupitre.studio/agent/internal/modules/runtime/php"
	_ "pupitre.studio/agent/internal/modules/runtime/python"
	_ "pupitre.studio/agent/internal/modules/runtime/ruby"
	_ "pupitre.studio/agent/internal/modules/runtime/rust"
)
