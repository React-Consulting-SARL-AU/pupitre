package sys

import (
	"errors"
	"os/exec"
	"syscall"
	"testing"
)

func TestRealSignalSparesAProcessThatNoLongerRunsAsTheOwner(t *testing.T) {
	me := plantable(t)

	process := exec.Command("sleep", "30")
	if err := process.Start(); err != nil {
		t.Fatal(err)
	}
	defer process.Wait()
	defer process.Process.Kill()

	pid := process.Process.Pid

	if err := (Real{}).Signal(pid, "root", syscall.SIGKILL); !errors.Is(err, syscall.EPERM) {
		t.Fatalf("a process that is not root's must be spared, got %v", err)
	}

	if err := (Real{}).Signal(pid, me.Username, 0); err != nil {
		t.Fatalf("the process must still run as its owner: %v", err)
	}

	if err := (Real{}).Signal(pid, me.Username, syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}

	process.Wait()

	if err := (Real{}).Signal(pid, me.Username, 0); err == nil {
		t.Fatal("a reaped process must not answer")
	}
}
