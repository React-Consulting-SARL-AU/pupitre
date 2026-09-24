//go:build staging

package staging

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
)

// The identity of the backup fixtures: what "correct horse battery staple" derives with this salt.
const (
	stagingRecipient = "A10gydBSR5g4m/L8q8Msuz7sSJNSPyytp4QgelrXxEw="
	stagingSalt      = "lneDgZnxLTb17pcdSfaKvA=="
	stagingPrivate   = "3/kJOuP+i9Ij0TrB+P4qgR/v3lb1+P8Tc5eNFVeKsEk="
	stagingNotes     = "pupitre-staging-notes"
)

// bucket is the client's bucket for this run: a real one, R2 or AWS, named by the environment and skipped without it.
type bucket struct {
	endpoint, region, name, accessKey, secretKey string
}

func stagingBucket(t *testing.T) bucket {
	t.Helper()

	found := bucket{
		endpoint:  os.Getenv("PUPITRE_STAGING_S3_ENDPOINT"),
		region:    os.Getenv("PUPITRE_STAGING_S3_REGION"),
		name:      os.Getenv("PUPITRE_STAGING_S3_BUCKET"),
		accessKey: os.Getenv("PUPITRE_STAGING_S3_ACCESS_KEY_ID"),
		secretKey: os.Getenv("PUPITRE_STAGING_S3_SECRET_ACCESS_KEY"),
	}

	if found.endpoint == "" || found.name == "" || found.accessKey == "" || found.secretKey == "" {
		t.Skip("PUPITRE_STAGING_S3_ENDPOINT, _BUCKET, _ACCESS_KEY_ID and _SECRET_ACCESS_KEY are not set")
	}

	if found.region == "" {
		found.region = "auto"
	}

	return found
}

func (b bucket) secrets(private bool) string {
	line := map[string]string{"access_key_id": b.accessKey, "secret_access_key": b.secretKey}
	if private {
		line["private_key"] = stagingPrivate
	}

	encoded, _ := json.Marshal(line)

	return string(encoded)
}

func (b bucket) location(key string) contract.BackupLocation {
	return contract.BackupLocation{Endpoint: b.endpoint, Region: b.region, Bucket: b.name, Key: key, PathStyle: true}
}

// A server the platform has not named yet has no prefix to back up under: the test names it when it must.
func namedServer(t *testing.T, host string) {
	t.Helper()

	if strings.TrimSpace(ssh(t, host, "sudo", "-n", "cat", "/etc/pupitre/server.id", "2>/dev/null", "||", "true")) != "" {
		return
	}

	command := sshCommand(host, "sudo", "-n", "tee", "/etc/pupitre/server.id")
	command.Stdin = strings.NewReader("staging-server\n")
	if out, err := command.CombinedOutput(); err != nil {
		t.Fatalf("server.id: %v\n%s", err, out)
	}
}

func TestABackupLeavesTheServerSealedAndComesBack(t *testing.T) {
	host := stagingHost(t)
	store := stagingBucket(t)
	namedServer(t, host)

	ssh(t, host, "sudo", "-n", "-u", "dev", "mkdir", "-p", "/home/dev/"+stagingNotes)
	ssh(t, host, "sudo", "-n", "-u", "dev", "cp", "/etc/hostname", "/home/dev/"+stagingNotes+"/hostname")

	config := map[string]any{
		"endpoint": store.endpoint, "region": store.region, "bucket": store.name, "prefix": "pupitre-staging", "path_style": true,
		"access_key_id": store.accessKey, "recipient": stagingRecipient, "kdf_salt": stagingSalt,
		"interval_hours": 0, "keep": 2, "databases": true, "home": false, "projects": false, "extra_paths": []string{stagingNotes},
	}
	secrets, _ := json.Marshal(map[string]any{"core.backup": map[string]string{"secret_access_key": store.secretKey}})

	agentWithSecrets(t, host, string(secrets), request{Cmd: "install", Params: map[string]any{
		"modules": []string{"core.backup"}, "config": map[string]any{"core.backup": config}, "secrets_stdin": true,
	}})

	made := decode[contract.BackupRunResult](t, agent(t, host, request{Cmd: "backup.run"})[0].Result)
	if !strings.HasPrefix(made.Key, "pupitre-staging/") || len(made.Parts) == 0 || made.Parts[0].Key != "setup.pupitre" {
		t.Fatalf("backup = %+v", made)
	}

	inspected := decode[contract.BackupManifest](t, agentWithSecrets(t, host, store.secrets(false), request{Cmd: "backup.inspect", Params: map[string]any{
		"location": store.location(made.Key), "secrets_stdin": true,
	}})[0].Result)
	if inspected.ID != made.ID || inspected.Recipient != stagingRecipient {
		t.Fatalf("manifest = %+v", inspected)
	}

	pathKey := ""
	for _, part := range made.Parts {
		if part.Kind == contract.BackupPartPath {
			pathKey = part.Key
		}
	}

	ssh(t, host, "sudo", "-n", "rm", "-rf", "/home/dev/"+stagingNotes)

	restored := decode[contract.BackupRestoreDataResult](t, agentWithSecrets(t, host, store.secrets(true), request{Cmd: "backup.restore.data", Params: map[string]any{
		"location": store.location(made.Key), "parts": []string{pathKey}, "start": false, "secrets_stdin": true,
	}})[0].Result)
	if len(restored.Failed) != 0 || len(restored.Restored) != 1 {
		t.Fatalf("restore = %+v", restored)
	}

	if owner := strings.TrimSpace(ssh(t, host, "stat", "-c", "%U", "/home/dev/"+stagingNotes+"/hostname")); owner != "dev" {
		t.Fatalf("the restored folder belongs to %s, not dev", owner)
	}

	deleted := decode[contract.BackupDeleteResult](t, agent(t, host, request{Cmd: "backup.delete", Params: map[string]any{"id": made.ID}})[0].Result)
	if !deleted.Deleted {
		t.Fatal("the backup must leave the bucket")
	}

	gone := attempt(t, host, request{Cmd: "backup.inspect", Params: map[string]any{"location": store.location(made.Key), "secrets_stdin": true}, Secrets: store.secrets(false)})[0]
	if gone.OK || !strings.Contains(string(gone.Error), string(contract.ErrorBackupMissing)) {
		t.Fatalf("a deleted backup: %s", gone.Error)
	}
}
