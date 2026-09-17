package jetbrains

import (
	"fmt"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	meminfoPath = "/proc/meminfo"

	minHeapMB       = 2048
	maxHeapMB       = 8192
	heapDivisor     = 2
	metaspaceMB     = 1024
	codeCacheMB     = 512
	fallbackTotalKB = 4 * 1024 * 1024
)

const optionsTemplate = `-Xms512m
-Xmx%dm
-XX:MaxMetaspaceSize=%dm
-XX:ReservedCodeCacheSize=%dm
-XX:+UseG1GC
-XX:+HeapDumpOnOutOfMemoryError
-XX:-OmitStackTraceInFastThrow
-ea
-Dsun.io.useCanonPrefixCache=false
-Djdk.http.auth.tunneling.disabledSchemes=""
`

func vmoptions(heap int) []byte {
	return []byte(fmt.Sprintf(optionsTemplate, heap, metaspaceMB, codeCacheMB))
}

// A backend sized above the machine is killed by the memory guard mid-indexing,
// which reads to the client as a broken IDE: the floor bends to three quarters
// of a small machine rather than take the whole of it.
func heapMB(ctx *modules.Context) int {
	total := totalKB(ctx) / 1024
	heap := total / heapDivisor
	floor := min(minHeapMB, total*3/4)

	switch {
	case heap < floor:
		return floor
	case heap > maxHeapMB:
		return maxHeapMB
	}

	return heap
}

func totalKB(ctx *modules.Context) int {
	raw, err := file.Read(ctx, meminfoPath)
	if err != nil {
		return fallbackTotalKB
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

	return fallbackTotalKB
}
