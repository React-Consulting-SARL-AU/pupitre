package room

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/sys"
)

// A disk filled to the last byte stops the engine's own journal, and every other service with it.
const Reserve = 512 << 20

func Free(ctx sys.Context, dir string) (int64, error) {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"df", "-P", "-B1", dir}})
	if err != nil {
		return 0, err
	}

	lines := strings.Split(strings.TrimSpace(out.Stdout), "\n")
	if len(lines) < 2 {
		return 0, fmt.Errorf("df %s: unreadable answer", dir)
	}

	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 4 {
		return 0, fmt.Errorf("df %s: unreadable answer", dir)
	}

	return strconv.ParseInt(fields[3], 10, 64)
}

// freed is what the drop preceding the restore gives back; a disk df cannot read never refuses the restore.
func Check(ctx sys.Context, what, dir string, need, freed int64) error {
	free, err := Free(ctx, dir)
	if err != nil {
		ctx.Logf("free space on %s unknown, restore of %s goes on: %s", dir, what, err)

		return nil
	}

	if free+freed >= need+Reserve {
		return nil
	}

	return errors.New(i18n.T("backup.restore.room", what, gigabytes(need+Reserve), dir, gigabytes(free+freed)))
}

func gigabytes(bytes int64) string {
	return strconv.FormatFloat(float64(bytes)/(1<<30), 'f', 1, 64)
}
