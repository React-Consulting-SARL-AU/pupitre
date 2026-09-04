package probe

import _ "embed"

// probe.sh reaches a bare machine over `ssh <host> 'sh -s' < probe.sh`, before any binary is sent.
//
//go:embed probe.sh
var Script string
