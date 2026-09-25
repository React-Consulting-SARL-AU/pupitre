package state

import (
	"math"
	"runtime"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	hostnamePath  = "/etc/hostname"
	osReleasePath = "/etc/os-release"
	memInfoPath   = "/proc/meminfo"
	loadPath      = "/proc/loadavg"
	uptimePath    = "/proc/uptime"
)

// Everything from /proc rather than free, nproc and uptime: those three alone cost more than collecting eleven projects.
func Machine(ctx sys.Context, version string) contract.Machine {
	id, release := osRelease(ctx)
	memory := meminfo(ctx)
	total, free := disk(ctx)

	return contract.Machine{
		Hostname:     hostname(ctx),
		OS:           id,
		Version:      release,
		Arch:         arch(ctx),
		Cores:        cores(ctx),
		UptimeS:      uptime(ctx),
		Load:         load(ctx),
		RAMTotalMB:   memory["MemTotal"] / 1024,
		RAMUsedMB:    (memory["MemTotal"] - memory["MemAvailable"]) / 1024,
		SwapMB:       (memory["SwapTotal"] - memory["SwapFree"]) / 1024,
		DiskTotalGB:  total,
		DiskFreeGB:   free,
		AgentVersion: version,
		Sudo:         sudo.State(ctx),
	}
}

func hostname(ctx sys.Context) string {
	if raw, err := file.Read(ctx, hostnamePath); err == nil {
		if name := strings.TrimSpace(string(raw)); name != "" {
			return name
		}
	}

	out, _ := ctx.Sys().Run(sys.Command{Argv: []string{"uname", "-n"}})

	return strings.TrimSpace(out.Stdout)
}

func osRelease(ctx sys.Context) (id, version string) {
	raw, err := file.Read(ctx, osReleasePath)
	if err != nil {
		return "", ""
	}

	for _, line := range strings.Split(string(raw), "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}

		switch key {
		case "ID":
			id = strings.Trim(value, `"`)
		case "VERSION_ID":
			version = strings.Trim(value, `"`)
		}
	}

	return id, version
}

func cores(ctx sys.Context) int {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"nproc"}})
	if count, parseErr := strconv.Atoi(strings.TrimSpace(out.Stdout)); err == nil && parseErr == nil && count > 0 {
		return count
	}

	return runtime.NumCPU()
}

// The binary only exists for amd64 and arm64; anything else the machine says about itself would break the contract.
func arch(ctx sys.Context) string {
	out, _ := ctx.Sys().Run(sys.Command{Argv: []string{"uname", "-m"}})

	switch strings.TrimSpace(out.Stdout) {
	case "x86_64", "amd64":
		return "amd64"
	case "aarch64", "arm64":
		return "arm64"
	}

	return runtime.GOARCH
}

func meminfo(ctx sys.Context) map[string]int {
	values := map[string]int{}

	raw, err := file.Read(ctx, memInfoPath)
	if err != nil {
		return values
	}

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		if kb, err := strconv.Atoi(fields[1]); err == nil {
			values[strings.TrimSuffix(fields[0], ":")] = kb
		}
	}

	return values
}

func load(ctx sys.Context) [3]float64 {
	var averages [3]float64

	raw, err := file.Read(ctx, loadPath)
	if err != nil {
		return averages
	}

	for i, field := range strings.Fields(string(raw)) {
		if i > 2 {
			break
		}

		averages[i], _ = strconv.ParseFloat(field, 64)
	}

	return averages
}

func uptime(ctx sys.Context) int {
	raw, err := file.Read(ctx, uptimePath)
	if err != nil {
		return 0
	}

	fields := strings.Fields(string(raw))
	if len(fields) == 0 {
		return 0
	}

	seconds, _ := strconv.ParseFloat(fields[0], 64)

	return int(seconds)
}

func disk(ctx sys.Context) (total, free float64) {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"df", "-P", "-B1", "/"}})
	if err != nil {
		return 0, 0
	}

	lines := strings.Split(strings.TrimSpace(out.Stdout), "\n")
	if len(lines) < 2 {
		return 0, 0
	}

	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 4 {
		return 0, 0
	}

	return gigabytes(fields[1]), gigabytes(fields[3])
}

func gigabytes(bytes string) float64 {
	value, err := strconv.ParseFloat(bytes, 64)
	if err != nil {
		return 0
	}

	return math.Round(value/(1024*1024*1024)*10) / 10
}
