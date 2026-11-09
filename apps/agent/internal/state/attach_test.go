package state_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

func TestAttachHandsTheProcessWindowToAViewer(t *testing.T) {
	fake, reader := fixture(t)

	if _, err := reader.Up("web", ""); err != nil {
		t.Fatal(err)
	}

	attached, err := reader.Attach("web", "web")
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("ProjectAttachResult", attached); err != nil {
		t.Fatalf("the answer violates the contract: %v", err)
	}

	if !strings.HasPrefix(attached.Session, "pupitre-view-") || fake.Views[attached.Session].Window != "web/web" {
		t.Fatalf("the view must hold web/web, got %+v in %+v", attached, fake.Views)
	}
}

func TestAttachRefusesWhatHasNoWindowOfItsOwn(t *testing.T) {
	_, reader := fixture(t)

	for _, tc := range []struct {
		project, process string
		want             contract.ErrorCode
	}{
		{"web", "web", contract.ErrorProjectNotFound},
		{"web", "ghost", contract.ErrorProjectNotFound},
		{"ghost", "web", contract.ErrorProjectNotFound},
		{"shots", "shots", contract.ErrorBadRequest},
	} {
		if _, err := reader.Attach(tc.project, tc.process); code(t, err) != tc.want {
			t.Errorf("%s/%s: got %v, want %s", tc.project, tc.process, err, tc.want)
		}
	}
}
