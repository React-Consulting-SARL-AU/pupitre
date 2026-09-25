package probe

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

func parseOSRelease(raw []byte) (id, version string) {
	for _, line := range strings.Split(string(raw), "\n") {
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		switch key {
		case "ID":
			if id == "" {
				id = unquote(value)
			}
		case "VERSION_ID":
			if version == "" {
				version = unquote(value)
			}
		}
	}

	return id, version
}

func unquote(value string) string {
	value = strings.TrimSpace(value)

	for _, quote := range []string{`"`, `'`} {
		if len(value) >= 2 && strings.HasPrefix(value, quote) && strings.HasSuffix(value, quote) {
			return value[1 : len(value)-1]
		}
	}

	return value
}

func normalizeArch(machine string) string {
	switch machine {
	case "x86_64", "amd64":
		return "amd64"
	case "aarch64", "arm64":
		return "arm64"
	}

	return machine
}

func parseFreeBytes(out string) int64 {
	for _, line := range strings.Split(out, "\n") {
		if !strings.HasPrefix(line, "Mem:") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0
		}

		total, _ := strconv.ParseInt(fields[1], 10, 64)

		return total
	}

	return 0
}

func parseMemInfoBytes(raw []byte) int64 {
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "MemTotal:") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0
		}

		kilobytes, _ := strconv.ParseInt(fields[1], 10, 64)

		return kilobytes * 1024
	}

	return 0
}

func parseAvailBytes(out string) int64 {
	lines := strings.Split(strings.TrimRight(out, "\n"), "\n")
	if len(lines) < 2 {
		return 0
	}

	fields := strings.Fields(lines[1])
	if len(fields) < 4 {
		return 0
	}

	available, _ := strconv.ParseInt(fields[3], 10, 64)

	return available
}

func gigabytes(bytes int64) Decimal {
	tenths := int64(float64(bytes)/1073741824*10 + 0.5)

	return Decimal(strconv.FormatInt(tenths/10, 10) + "." + strconv.FormatInt(tenths%10, 10))
}

var ssProcess = regexp.MustCompile(`\(\("([^"]+)"`)

func parseSS(out string) []Port {
	var ports []Port

	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 || fields[0] != "LISTEN" {
			continue
		}

		number, ok := portOf(fields[3])
		if !ok {
			continue
		}

		process := ""
		if match := ssProcess.FindStringSubmatch(line); match != nil {
			process = match[1]
		}

		ports = append(ports, Port{Port: number, Process: process})
	}

	return mergePorts(ports)
}

func parseNetstat(out string) []Port {
	var ports []Port

	for _, line := range strings.Split(out, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 6 || (fields[0] != "tcp" && fields[0] != "tcp6") || fields[5] != "LISTEN" {
			continue
		}

		number, ok := portOf(fields[3])
		if !ok {
			continue
		}

		process := ""
		if len(fields) >= 7 {
			if _, name, found := strings.Cut(fields[6], "/"); found {
				process = strings.TrimSuffix(name, ":")
			}
		}

		ports = append(ports, Port{Port: number, Process: process})
	}

	return mergePorts(ports)
}

func portOf(address string) (int, bool) {
	index := strings.LastIndex(address, ":")
	if index < 0 {
		return 0, false
	}

	number, err := strconv.Atoi(address[index+1:])
	if err != nil || number < 1 || number > 65535 {
		return 0, false
	}

	return number, true
}

// The same port shows up once per address family; the process name is kept wherever it was readable.
func mergePorts(ports []Port) []Port {
	processes := map[int]string{}
	var numbers []int

	for _, port := range ports {
		if _, seen := processes[port.Port]; !seen {
			numbers = append(numbers, port.Port)
			processes[port.Port] = port.Process
			continue
		}

		if processes[port.Port] == "" {
			processes[port.Port] = port.Process
		}
	}

	sort.Ints(numbers)

	merged := make([]Port, 0, len(numbers))

	for _, number := range numbers {
		merged = append(merged, Port{Port: number, Process: processes[number]})
	}

	return merged
}

func parseUsers(raw []byte) []string {
	var users []string

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Split(line, ":")
		if len(fields) < 3 || fields[0] == "nobody" {
			continue
		}

		uid, err := strconv.Atoi(fields[2])
		if err != nil || uid < 1000 || uid >= 65000 {
			continue
		}

		users = append(users, fields[0])
	}

	return users
}

func parseInstalledModules(raw []byte) []string {
	var report struct {
		Modules []struct {
			ID string `json:"id"`
		} `json:"modules"`
	}

	ids := []string{}
	if json.Unmarshal(raw, &report) != nil {
		return ids
	}

	for _, module := range report.Modules {
		if module.ID != "" {
			ids = append(ids, module.ID)
		}
	}

	return ids
}

func parseAgentVersion(out string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(out), "\n")

	fields := strings.Fields(line)
	if len(fields) == 0 {
		return ""
	}

	return fields[len(fields)-1]
}
