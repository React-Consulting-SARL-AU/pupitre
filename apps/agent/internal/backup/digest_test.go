package backup_test

import (
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The manifest's digest is what the platform recorded when the backup was declared: without it, nothing ties what the bucket serves to what was made.
func TestNothingIsOpenedWithoutTheManifestDigest(t *testing.T) {
	bucket, source, _ := backedUp(t)
	fresh := newBench(t, bucket)

	location := source.location()
	location.SHA256 = ""

	if _, err := fresh.service.Inspect(location, fresh.secrets()); refusalCode(err) != contract.ErrorBadRequest {
		t.Fatalf("inspect: %v", err)
	}

	if _, err := fresh.service.RestoreSetup(nil, location, fresh.secrets(), false); refusalCode(err) != contract.ErrorBadRequest {
		t.Fatalf("restore setup: %v", err)
	}

	if _, err := fresh.service.RestoreData(nil, location, fresh.secrets(), []string{"home.pupitre"}, false); refusalCode(err) != contract.ErrorBadRequest {
		t.Fatalf("restore data: %v", err)
	}

	if _, written := fresh.fake.Files[installPath]; written {
		t.Fatal("nothing may be written on a refusal")
	}
}
