package room_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/db/room"
	"pupitre.studio/agent/internal/modules/modtest"
)

const df = "Filesystem 1-blocks Used Available Capacity Mounted on\n/dev/sda1 42949672960 40802189312 2147483648 95% /\n"

func TestARestoreFitsWhenTheDropGivesBackEnough(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("df -P -B1 /var/lib/mysql", df)
	ctx := modtest.NewSysContext(fake)

	if free, err := room.Free(ctx, "/var/lib/mysql"); err != nil || free != 2<<30 {
		t.Fatalf("free = %d, %v", free, err)
	}

	if err := room.Check(ctx, "shop", "/var/lib/mysql", 3<<30, 2<<30); err != nil {
		t.Fatalf("two free and two given back hold three and the reserve: %v", err)
	}

	err := room.Check(ctx, "shop", "/var/lib/mysql", 3<<30, 0)
	if err == nil || !strings.Contains(err.Error(), "shop") || !strings.Contains(err.Error(), "/var/lib/mysql") {
		t.Fatalf("the refusal names the database and the disk: %v", err)
	}
}

func TestADiskDfCannotReadIsNoReasonToRefuse(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("df -P -B1", "df: /var/lib/mysql: No such file or directory\n")

	if err := room.Check(modtest.NewSysContext(fake), "shop", "/var/lib/mysql", 3<<30, 0); err != nil {
		t.Fatalf("got %v", err)
	}
}
