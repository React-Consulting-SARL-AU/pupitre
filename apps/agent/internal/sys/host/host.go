package host

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const (
	osReleasePath = "/etc/os-release"
	memInfoPath   = "/proc/meminfo"

	DefaultCodename = "noble"
)

func Codename(ctx sys.Context) string {
	raw, err := ctx.Sys().ReadFile(osReleasePath)
	if err != nil {
		return DefaultCodename
	}

	for _, line := range strings.Split(string(raw), "\n") {
		if value, ok := strings.CutPrefix(line, "VERSION_CODENAME="); ok {
			if codename := strings.Trim(strings.TrimSpace(value), `"`); codename != "" {
				return codename
			}
		}
	}

	return DefaultCodename
}

func MemTotalKB(ctx sys.Context) (int, bool) {
	raw, err := ctx.Sys().ReadFile(memInfoPath)
	if err != nil {
		return 0, false
	}

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != "MemTotal:" {
			continue
		}

		kb, err := strconv.Atoi(fields[1])

		return kb, err == nil
	}

	return 0, false
}
