package devcli_test

import (
	"errors"
	"io/fs"
	"os/exec"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

const sudoPath = "/usr/bin/sudo"

// The machine as `dev` sees it once hardening has closed root: the state is there, and opening it is refused.
type sealedSys struct {
	*modtest.FakeSys
	sealed map[string]bool
}

func (s sealedSys) ReadFile(path string) ([]byte, error) {
	if s.sealed[path] {
		return nil, &fs.PathError{Op: "open", Path: path, Err: fs.ErrPermission}
	}

	return s.FakeSys.ReadFile(path)
}

type elevator struct {
	fake      *modtest.FakeSys
	elevation devcli.Elevation
	launched  [][]string
}

type localCaller struct{}

func (localCaller) Call(string, any, func(string, map[string]any)) (any, error) {
	return nil, nil
}

func newElevator(t *testing.T, sealed ...string) *elevator {
	t.Helper()

	fake := modtest.NewFakeSys()
	fake.Files[platform.DefaultTokenPath] = []byte("jeton-de-serveur\n")
	fake.Files[entitlement.DefaultCachePath] = []byte("{}\n")

	refused := map[string]bool{}
	for _, path := range sealed {
		refused[path] = true
	}

	held := &elevator{fake: fake}
	held.elevation = devcli.Elevation{
		Sys:      sealedSys{FakeSys: fake, sealed: refused},
		State:    []string{platform.DefaultTokenPath, entitlement.DefaultCachePath},
		Euid:     func() int { return 1000 },
		LookPath: func(name string) (string, error) { return "/usr/bin/" + name, nil },
		Launch: func(argv []string) (devcli.Pipe, error) {
			held.launched = append(held.launched, argv)

			return devcli.Pipe{}, errors.New("not launched in this test")
		},
	}

	return held
}

func TestASealedMachineIsAskedOfTheServerSudoRuns(t *testing.T) {
	for _, sealed := range []string{platform.DefaultTokenPath, entitlement.DefaultCachePath} {
		held := newElevator(t, sealed)

		caller, err := held.elevation.Caller(func() devcli.Caller { return localCaller{} }, "1.2.0")
		if err != nil {
			t.Fatalf("%s: %v", sealed, err)
		}

		remote, isRemote := caller.(*devcli.Remote)
		if !isRemote || remote.Sudo != sudoPath || remote.Version != "1.2.0" {
			t.Fatalf("%s: caller = %#v", sealed, caller)
		}
	}
}

func TestElevationLeavesAloneWhatItCannotHelp(t *testing.T) {
	root := newElevator(t, platform.DefaultTokenPath)
	root.elevation.Euid = func() int { return 0 }

	if caller, err := root.elevation.Caller(func() devcli.Caller { return localCaller{} }, "1.2.0"); err != nil || caller != (localCaller{}) {
		t.Fatalf("root went through sudo: %v · %#v", err, caller)
	}

	// A token nobody wrote is a machine nobody enrolled: root would read no more than this account does.
	unenrolled := newElevator(t)
	unenrolled.fake.Remove(platform.DefaultTokenPath)

	if caller, err := unenrolled.elevation.Caller(func() devcli.Caller { return localCaller{} }, "1.2.0"); err != nil || caller != (localCaller{}) {
		t.Fatalf("an absent token is not a refused one: %v · %#v", err, caller)
	}
}

func TestElevationSaysSoWhenItCannotBecomeRoot(t *testing.T) {
	noSudo := newElevator(t, platform.DefaultTokenPath)
	noSudo.elevation.LookPath = func(string) (string, error) { return "", exec.ErrNotFound }

	_, err := noSudo.elevation.Caller(func() devcli.Caller { return localCaller{} }, "1.2.0")

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorEntitlementRequired || refusal.Fix != i18n.T("devcli.elevate.root.fix") {
		t.Fatalf("refusal = %v", err)
	}
}
