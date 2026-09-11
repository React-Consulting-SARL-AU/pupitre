package modules

import (
	"errors"
	"path/filepath"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

func TestTheLockFileRefusesASecondHolderUntilTheFirstLetsGo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "install.lock")

	release, err := lockFile(path)
	if err != nil {
		t.Fatal(err)
	}

	_, err = lockFile(path)
	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBusy {
		t.Fatalf("a second holder got %v, want busy", err)
	}

	release()

	again, err := lockFile(path)
	if err != nil {
		t.Fatalf("after release: %v", err)
	}
	again()
}

func TestAnEngineWithoutALockPathOnlyKnowsItself(t *testing.T) {
	release, err := lockFile("")
	if err != nil {
		t.Fatal(err)
	}
	release()
}

func TestAcquireHoldsTheFileAcrossEngines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "install.lock")
	first := &Engine{LockPath: path, Entitlement: func() contract.Entitlement { return contract.EntitlementDev }}
	second := &Engine{LockPath: path, Entitlement: func() contract.Entitlement { return contract.EntitlementDev }}

	unlock, err := first.acquire()
	if err != nil {
		t.Fatal(err)
	}

	_, err = second.acquire()
	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBusy {
		t.Fatalf("the second engine got %v, want busy", err)
	}

	unlock()

	release, err := second.acquire()
	if err != nil {
		t.Fatalf("after the first let go: %v", err)
	}
	release()
}
