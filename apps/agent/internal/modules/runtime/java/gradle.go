package java

import (
	"fmt"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	meminfoPath  = "/proc/meminfo"
	minHeapMB    = 1024
	maxHeapMB    = 4096
	metaspaceMB  = 512
	heapDivisor  = 2
	fallbackRAMB = 2 * 1024 * 1024
)

const gradleTemplate = `org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.jvmargs=-Xmx%dm -XX:MaxMetaspaceSize=%dm
`

func gradleProperties(heap int) []byte {
	return []byte(fmt.Sprintf(gradleTemplate, heap, metaspaceMB))
}

// A daemon sized above the machine gets killed by the memory guard mid-build, which reads as a compiler error.
func heapMB(ctx *modules.Context) int {
	heap := totalKB(ctx) / 1024 / heapDivisor

	switch {
	case heap < minHeapMB:
		return minHeapMB
	case heap > maxHeapMB:
		return maxHeapMB
	}

	return heap
}

func totalKB(ctx *modules.Context) int {
	raw, err := file.Read(ctx, meminfoPath)
	if err != nil {
		return fallbackRAMB
	}

	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[0] != "MemTotal:" {
			continue
		}

		if kb, err := strconv.Atoi(fields[1]); err == nil {
			return kb
		}
	}

	return fallbackRAMB
}
