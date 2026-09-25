package hardening

import (
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/modtest"
)

const (
	hardlinksKnob = "/proc/sys/fs/protected_hardlinks"
	symlinksKnob  = "/proc/sys/fs/protected_symlinks"
	linksApplied  = "sysctl -q -p " + linksPath
)

func kernelHolding(hardlinks, symlinks string) *modtest.FakeSys {
	fake := modtest.NewFakeSys()
	fake.Files[hardlinksKnob] = []byte(hardlinks + "\n")
	fake.Files[symlinksKnob] = []byte(symlinks + "\n")

	return fake
}

func linkEvent(t *testing.T, ctx *modules.Context) contract.StepEvent {
	t.Helper()

	for _, event := range ctx.Events() {
		if event.Step == "protect-links" {
			return event
		}
	}

	t.Fatalf("no protect-links step in %+v", ctx.Events())

	return contract.StepEvent{}
}

func TestProtectLinksWritesTheDropInAndAppliesItOnAFreshMachine(t *testing.T) {
	fake := kernelHolding("0", "0")
	ctx := newContext(t, fake, Options{})

	if err := protectLinks(ctx); err != nil {
		t.Fatal(err)
	}

	if got := string(fake.Files[linksPath]); got != "fs.protected_hardlinks = 1\nfs.protected_symlinks = 1\n" {
		t.Fatalf("drop-in = %q", got)
	}

	if fake.Modes[linksPath] != 0o644 {
		t.Fatalf("drop-in mode %o, want 0644", fake.Modes[linksPath])
	}

	if !slices.Contains(fake.Commands(), linksApplied) {
		t.Fatalf("the running kernel must take the values: %v", fake.Commands())
	}

	if string(fake.Files[hardlinksKnob]) != "1\n" || string(fake.Files[symlinksKnob]) != "1\n" {
		t.Fatalf("kernel holds %q and %q", fake.Files[hardlinksKnob], fake.Files[symlinksKnob])
	}

	if event := linkEvent(t, ctx); event.Status != contract.StepOK || event.Message != "" {
		t.Fatalf("event = %+v", event)
	}
}

func TestProtectLinksReplayedChangesNothing(t *testing.T) {
	fake := kernelHolding("0", "0")

	if err := protectLinks(newContext(t, fake, Options{})); err != nil {
		t.Fatal(err)
	}

	calls, mutations := len(fake.Calls), len(fake.Mutations)
	ctx := newContext(t, fake, Options{})

	if err := protectLinks(ctx); err != nil {
		t.Fatal(err)
	}

	if event := linkEvent(t, ctx); event.Status != contract.StepSkip {
		t.Fatalf("a replay must skip: %+v", event)
	}

	if len(fake.Calls) != calls || len(fake.Mutations) != mutations {
		t.Fatalf("a replay runs and writes nothing: %v", fake.Commands()[calls:])
	}
}

func TestProtectLinksSkipsWhenTheDropInIsThereAndTheKernelHoldsBoth(t *testing.T) {
	fake := kernelHolding("1", "1")
	fake.Files[linksPath] = []byte(linksSysctl)
	ctx := newContext(t, fake, Options{})

	if err := protectLinks(ctx); err != nil {
		t.Fatal(err)
	}

	if event := linkEvent(t, ctx); event.Status != contract.StepSkip {
		t.Fatalf("event = %+v", event)
	}

	if len(fake.Calls) != 0 || len(fake.Mutations) != 0 {
		t.Fatalf("nothing to do: %v %v", fake.Commands(), fake.Mutations)
	}
}

func TestProtectLinksAppliesAgainWhenTheKernelLostAValue(t *testing.T) {
	fake := kernelHolding("1", "0")
	fake.Files[linksPath] = []byte(linksSysctl)
	ctx := newContext(t, fake, Options{})

	if err := protectLinks(ctx); err != nil {
		t.Fatal(err)
	}

	if !slices.Contains(fake.Commands(), linksApplied) || linkEvent(t, ctx).Status != contract.StepOK {
		t.Fatalf("the kernel must be set again: %v", fake.Commands())
	}
}

// A container's /proc/sys is read-only: the drop-in is what counts, and it applies at the next boot.
func TestProtectLinksWarnsWithoutFailingWhenTheKernelIsReadOnly(t *testing.T) {
	fake := kernelHolding("0", "0")
	fake.FailProgram("sysctl", `sysctl: setting key "fs.protected_hardlinks": Read-only file system`)
	ctx := newContext(t, fake, Options{})

	if err := protectLinks(ctx); err != nil {
		t.Fatalf("a read-only /proc/sys must not fail the hardening: %v", err)
	}

	if string(fake.Files[linksPath]) != linksSysctl {
		t.Fatalf("the drop-in must still be written: %q", fake.Files[linksPath])
	}

	event := linkEvent(t, ctx)
	if event.Status != contract.StepOK || !strings.Contains(event.Message, linksPath) {
		t.Fatalf("the step must carry the warning: %+v", event)
	}
}

func TestProtectLinksFailsWhenTheKernelRefusesForAnotherReason(t *testing.T) {
	fake := kernelHolding("0", "0")
	fake.FailProgram("sysctl", `sysctl: permission denied on key "fs.protected_hardlinks"`)
	ctx := newContext(t, fake, Options{})

	if err := protectLinks(ctx); err == nil {
		t.Fatal("a refusal that is not a read-only /proc/sys must be reported")
	}

	if event := linkEvent(t, ctx); event.Status != contract.StepFail || event.Replay == "" {
		t.Fatalf("event = %+v", event)
	}
}

// Every hardened server gets the protection, root closed or not.
func TestHardenProtectsLinksEvenWhenRootStaysOpen(t *testing.T) {
	fake := kernelHolding("0", "0")
	ctx := newContext(t, fake, Options{})

	result := Harden(ctx)
	if result.RootClosed {
		t.Fatalf("no key opens dev on a bare machine: %+v", result)
	}

	if string(fake.Files[linksPath]) != linksSysctl || linkEvent(t, ctx).Status != contract.StepOK {
		t.Fatalf("harden must protect links first: %q", fake.Files[linksPath])
	}
}

func TestConfigureProtectsLinksOnce(t *testing.T) {
	fake := hardenedMachine(t)
	Harden(newContext(t, fake, Options{}))
	delete(fake.Files, linksPath)

	ctx := newContext(t, fake, Options{SSH443: true})
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	seen := 0
	for _, event := range ctx.Events() {
		if event.Step == "protect-links" {
			seen++
		}
	}

	if seen != 1 || string(fake.Files[linksPath]) != linksSysctl {
		t.Fatalf("configure and the harden it runs protect links once: %d step(s), %q", seen, fake.Files[linksPath])
	}
}

func TestUninstallRemovesTheDropIn(t *testing.T) {
	fake := kernelHolding("1", "1")
	fake.Files[linksPath] = []byte(linksSysctl)
	ctx := newContext(t, fake, Options{})

	if err := (Module{}).Uninstall(ctx); err != nil {
		t.Fatal(err)
	}

	if _, kept := fake.Files[linksPath]; kept {
		t.Fatal("uninstall removes what the module wrote")
	}
}
