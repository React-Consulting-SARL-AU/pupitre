// Package host reads what the machine says of itself: its release and its memory.
package host

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const (
	osReleasePath = "/etc/os-release"
	memInfoPath   = "/proc/meminfo"

	// DefaultCodename is the release a vendor repository is named after when os-release cannot say.
	DefaultCodename = "noble"
)

// Codename is the release a vendor repository line names: jammy, noble.
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

// MemTotalKB is the memory the kernel reports, in kilobytes; false when /proc/meminfo does not say.
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
