package net

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

// The kernel's tables rather than ss or lsof: nothing to install, and a fake machine can hold the two files.
var tables = []string{"/proc/net/tcp", "/proc/net/tcp6"}

// TCP_LISTEN, as /proc/net/tcp writes it in hex.
const listenState = "0A"

const (
	localColumn = 1
	stateColumn = 3
	columns     = 4
)

type Ports map[int]bool

func (p Ports) Has(port int) bool {
	return p[port]
}

func Listening(ctx sys.Context) Ports {
	ports := Ports{}

	for _, table := range tables {
		raw, err := ctx.Sys().ReadFile(table)
		if err != nil {
			continue
		}

		for _, line := range strings.Split(string(raw), "\n") {
			if port, ok := listeningPort(line); ok {
				ports[port] = true
			}
		}
	}

	return ports
}

func listeningPort(line string) (int, bool) {
	parts := strings.Fields(line)
	if len(parts) < columns || parts[stateColumn] != listenState {
		return 0, false
	}

	_, hex, found := strings.Cut(parts[localColumn], ":")
	if !found {
		return 0, false
	}

	port, err := strconv.ParseUint(hex, 16, 32)
	if err != nil {
		return 0, false
	}

	return int(port), true
}
