package backup_test

import (
	"slices"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/s3/s3test"
)

func seed(bucket *s3test.Fake, id, trigger string, at time.Time) {
	prefix := "pupitre/" + serverID + "/" + id + "/"
	bucket.PutObject(prefix+"setup.pupitre", []byte("sealed"), at)

	if trigger != "" {
		bucket.PutObject(prefix+contract.BackupManifestKey, []byte(`{"format":1,"id":"`+id+`","trigger":"`+trigger+`"}`), at)
	}
}

func holds(bucket *s3test.Fake, id string) bool {
	return slices.ContainsFunc(bucket.Keys(), func(key string) bool { return strings.Contains(key, "/"+id+"/") })
}

func TestPruningKeepsTheScheduledBackupsAskedForAndEveryManualOne(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	long := b.now.Add(-30 * 24 * time.Hour)

	seed(bucket, "20260801T030000Z-aaaaaa", contract.BackupTriggerManual, long)
	seed(bucket, "20260901T030000Z-bbbbbb", contract.BackupTriggerSchedule, long)
	seed(bucket, "20260902T030000Z-cccccc", contract.BackupTriggerSchedule, long)
	seed(bucket, "20260903T030000Z-dddddd", contract.BackupTriggerSchedule, long)
	seed(bucket, "20260920T030000Z-eeeeee", "", long)
	seed(bucket, "20260924T025000Z-ffffff", "", b.now)
	bucket.Begin("pupitre/"+serverID+"/20260922T030000Z-999999/project-x.pupitre", b.now.Add(-48*time.Hour))

	result := b.run(contract.BackupTriggerSchedule)

	for id, kept := range map[string]bool{
		"20260801T030000Z-aaaaaa": true,
		"20260901T030000Z-bbbbbb": false,
		"20260902T030000Z-cccccc": false,
		"20260903T030000Z-dddddd": true,
		"20260920T030000Z-eeeeee": false,
		"20260924T025000Z-ffffff": true,
		result.ID:                 true,
	} {
		if holds(bucket, id) != kept {
			t.Errorf("%s: kept %v, want %v", id, holds(bucket, id), kept)
		}
	}

	if bucket.OpenUploads() != 0 {
		t.Fatal("an upload abandoned for a day must be aborted")
	}

	slices.Sort(b.platform.forgotten)
	if !slices.Equal(b.platform.forgotten, []string{"20260901T030000Z-bbbbbb", "20260902T030000Z-cccccc"}) {
		t.Fatalf("the platform forgot %v", b.platform.forgotten)
	}
}

func TestDeletingABackupEmptiesItsPrefixAndTellsThePlatform(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()
	result := b.run(contract.BackupTriggerManual)

	deleted, err := b.service.Delete(result.ID)
	if err != nil || !deleted.Deleted {
		t.Fatalf("delete = %+v, %v", deleted, err)
	}

	if holds(bucket, result.ID) || !slices.Contains(b.platform.forgotten, result.ID) {
		t.Fatal("the backup must leave the bucket, then the platform")
	}

	status, err := b.service.Status()
	if err != nil || status.Last == nil || status.Last.ID != "" {
		t.Fatalf("a deleted backup is no longer the one to copy from: %+v, %v", status.Last, err)
	}
}
