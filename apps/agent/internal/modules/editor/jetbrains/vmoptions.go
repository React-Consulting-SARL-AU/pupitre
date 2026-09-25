package jetbrains

import (
	"fmt"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/host"
)

const (
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

// An oversized heap is OOM-killed mid-indexing, so on a small machine the floor bends to three quarters of RAM.
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
	if kb, known := host.MemTotalKB(ctx); known {
		return kb
	}

	return fallbackTotalKB
}
