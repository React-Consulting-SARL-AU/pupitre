package host_test

import (
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/host"
)

func TestCodenameReadsOSReleaseAndFallsBackToNoble(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if got := host.Codename(ctx); got != host.DefaultCodename {
		t.Fatalf("without os-release = %q", got)
	}

	fake.Files["/etc/os-release"] = []byte("NAME=\"Ubuntu\"\nVERSION_CODENAME=\"jammy\"\n")
	if got := host.Codename(ctx); got != "jammy" {
		t.Fatalf("codename = %q", got)
	}

	fake.Files["/etc/os-release"] = []byte("VERSION_CODENAME=\n")
	if got := host.Codename(ctx); got != host.DefaultCodename {
		t.Fatalf("an empty codename = %q", got)
	}
}

func TestMemTotalKBSaysWhenMeminfoIsSilent(t *testing.T) {
	fake := modtest.NewFakeSys()
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if _, known := host.MemTotalKB(ctx); known {
		t.Fatal("no meminfo, no figure")
	}

	fake.Files["/proc/meminfo"] = []byte("MemFree:  1024 kB\nMemTotal:  8126464 kB\n")
	if kb, known := host.MemTotalKB(ctx); !known || kb != 8126464 {
		t.Fatalf("total = %d, %v", kb, known)
	}

	fake.Files["/proc/meminfo"] = []byte("MemTotal:  lots kB\n")
	if _, known := host.MemTotalKB(ctx); known {
		t.Fatal("an unreadable figure is no figure")
	}
}
