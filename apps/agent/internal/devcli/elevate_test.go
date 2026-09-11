package devcli_test

import (
	"errors"
	"io/fs"
	"os/exec"
	"strings"
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
	argv      []string
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
		Sys:        sealedSys{FakeSys: fake, sealed: refused},
		State:      []string{platform.DefaultTokenPath, entitlement.DefaultCachePath},
		Euid:       func() int { return 1000 },
		Executable: func() (string, error) { return devcli.Binary, nil },
		LookPath:   func(name string) (string, error) { return "/usr/bin/" + name, nil },
		Exec: func(path string, argv, _ []string) error {
			held.argv = append([]string{path}, argv...)

			return nil
		},
	}

	return held
}

func (e *elevator) line() string {
	return strings.Join(e.argv, " ")
}

func TestElevationRerunsTheGrammarUnderSudo(t *testing.T) {
	for _, sealed := range []string{platform.DefaultTokenPath, entitlement.DefaultCachePath} {
		held := newElevator(t, sealed)

		if err := held.elevation.Run([]string{"logs", "web", "-f"}); err != nil {
			t.Fatalf("%s: %v", sealed, err)
		}

		if want := sudoPath + " sudo -n " + devcli.Binary + " dev logs web -f"; held.line() != want {
			t.Fatalf("%s: %q, expected %q", sealed, held.line(), want)
		}
	}
}

func TestElevationLeavesAloneWhatItCannotHelp(t *testing.T) {
	root := newElevator(t, platform.DefaultTokenPath)
	root.elevation.Euid = func() int { return 0 }

	if err := root.elevation.Run([]string{"status"}); err != nil || root.argv != nil {
		t.Fatalf("root re-ran itself: %v · %v", err, root.argv)
	}

	// A token nobody wrote is a machine nobody enrolled: root would read no more than this account does.
	unenrolled := newElevator(t)
	unenrolled.fake.Remove(platform.DefaultTokenPath)

	if err := unenrolled.elevation.Run([]string{"status"}); err != nil || unenrolled.argv != nil {
		t.Fatalf("an absent token is not a refused one: %v · %v", err, unenrolled.argv)
	}
}

func TestElevationSaysSoWhenItCannotBecomeRoot(t *testing.T) {
	noSudo := newElevator(t, platform.DefaultTokenPath)
	noSudo.elevation.LookPath = func(string) (string, error) { return "", exec.ErrNotFound }

	assertRefused(t, noSudo, "devcli.elevate.root.fix")

	needsPassword := newElevator(t, platform.DefaultTokenPath)
	needsPassword.fake.Failures[sudoPath] = "sudo: a password is required"

	assertRefused(t, needsPassword, "devcli.elevate.password.fix")
}

func assertRefused(t *testing.T, held *elevator, fix string) {
	t.Helper()

	err := held.elevation.Run([]string{"status"})

	var refusal *protocol.Error
	if !errors.As(err, &refusal) {
		t.Fatalf("expected a refusal, got %v", err)
	}

	if refusal.Code != contract.ErrorEntitlementRequired || refusal.Fix != i18n.T(fix) {
		t.Fatalf("%s · %s", refusal.Code, refusal.Fix)
	}

	if held.argv != nil {
		t.Fatalf("it ran something anyway: %v", held.argv)
	}
}
