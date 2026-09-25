package platform_test

import (
	"errors"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/platform"
)

const (
	firstServer  = "cm0k2x9q80000a1b2c3d4e5f6"
	secondServer = "0f8fad5b-d9cb-469f-a165-70867728950e"
)

func TestAServerIDOutsideTheContractIsNeverWritten(t *testing.T) {
	fake := modtest.NewFakeSys()

	for _, id := range []string{"srv_42", "../../etc/passwd", "CM0K2X9Q80000A1B2C3D4E5F6", firstServer + "\nx"} {
		written, err := platform.SaveServerID(fake, "", id)
		if written || !errors.Is(err, platform.ErrServerIDInvalid) {
			t.Errorf("%q: written %v, %v", id, written, err)
		}
	}

	if _, stored := fake.Files[platform.DefaultServerIDPath]; stored {
		t.Fatal("an invalid id reached the disk")
	}
}

// Approvals are checked against the stored id: a platform that renames the server would redirect every one of them.
func TestTheStoredServerIDIsNeverReplacedByTheState(t *testing.T) {
	fake := modtest.NewFakeSys()
	platform.SaveServerID(fake, "", firstServer)

	written, err := platform.SaveServerID(fake, "", secondServer)
	if written || !errors.Is(err, platform.ErrServerIDChanged) || platform.LoadServerID(fake, "") != firstServer {
		t.Fatalf("written %v, %v, stored %q", written, err, platform.LoadServerID(fake, ""))
	}
}

func TestAStoredIDOutsideTheContractGivesWayToAValidOne(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[platform.DefaultServerIDPath] = []byte("staging-server\n")

	written, err := platform.SaveServerID(fake, "", firstServer)
	if err != nil || !written || platform.LoadServerID(fake, "") != firstServer {
		t.Fatalf("written %v, %v", written, err)
	}
}

func TestForgettingTheServerIDLetsTheNextOneIn(t *testing.T) {
	fake := modtest.NewFakeSys()
	platform.SaveServerID(fake, "", firstServer)

	if err := platform.ForgetServerID(fake, ""); err != nil || platform.LoadServerID(fake, "") != "" {
		t.Fatalf("forget: %v", err)
	}

	if err := platform.ForgetServerID(fake, ""); err != nil {
		t.Fatalf("forgetting twice: %v", err)
	}

	if written, err := platform.SaveServerID(fake, "", secondServer); !written || err != nil {
		t.Fatalf("written %v, %v", written, err)
	}
}
