package java

import (
	"fmt"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/host"
)

const (
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
	if kb, known := host.MemTotalKB(ctx); known {
		return kb
	}

	return fallbackRAMB
}
