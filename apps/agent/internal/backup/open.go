package backup

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path"
	"strings"
	"time"

	"pupitre.studio/agent/internal/backup/seal"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/s3"
)

// opened is a backup as its bucket holds it: the manifest, checked against the digest the platform recorded, and the client that reads its parts.
type opened struct {
	client   s3.Client
	key      string
	manifest contract.BackupManifest
}

// Inspect reads and checks the manifest of a backup, writing nothing anywhere.
func (s *Service) Inspect(location contract.BackupLocation, secrets contract.BackupSecrets) (contract.BackupManifest, error) {
	var manifest contract.BackupManifest

	err := s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		backup, err := s.open(ctx, location, secrets)
		manifest = backup.manifest

		return err
	})

	return manifest, err
}

func (s *Service) open(ctx *modules.Context, location contract.BackupLocation, secrets contract.BackupSecrets) (opened, error) {
	ctx.Hide(secrets.AccessKeyID, secrets.SecretAccessKey, secrets.PrivateKey)

	key := strings.Trim(location.Key, "/")
	if !idPattern.MatchString(path.Base(key)) || strings.Contains(key, "..") || !module.Addressable(location.Endpoint, location.Bucket, location.Region) {
		return opened{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.location.invalid", location.Key)).
			WithFix(i18n.T("backup.location.invalid.fix"))
	}

	client := s.bucket(s3.Client{
		Endpoint:        location.Endpoint,
		Region:          location.Region,
		Bucket:          location.Bucket,
		AccessKeyID:     secrets.AccessKeyID,
		SecretAccessKey: secrets.SecretAccessKey,
		PathStyle:       location.PathStyle,
	})

	raw, err := fetchManifest(client, key)
	switch {
	case s3.KindOf(err) == s3.KindNoKey:
		return opened{}, protocol.NewError(contract.ErrorBackupMissing, i18n.T("backup.missing", key)).
			WithFix(i18n.T("backup.missing.fix"))
	case errors.Is(err, errManifestTooLarge):
		return opened{}, corrupt(i18n.T("backup.corrupt.manifest", err.Error()))
	case err != nil:
		return opened{}, module.StorageRefused(err)
	}

	if location.SHA256 != "" && sha256Hex(raw) != location.SHA256 {
		return opened{}, corrupt(i18n.T("backup.corrupt.digest", contract.BackupManifestKey))
	}

	manifest, err := readManifest(raw)
	if err != nil {
		return opened{}, err
	}

	if manifest.ID != path.Base(key) {
		return opened{}, corrupt(i18n.T("backup.corrupt.manifest", manifest.ID))
	}

	return opened{client: client, key: key, manifest: manifest}, nil
}

// readManifest refuses a format this binary does not read before anything else, then a manifest the contract does not describe.
func readManifest(raw []byte) (contract.BackupManifest, error) {
	var head struct {
		Format int `json:"format"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return contract.BackupManifest{}, corrupt(i18n.T("backup.corrupt.manifest", err.Error()))
	}

	if head.Format != contract.Backup.Format {
		return contract.BackupManifest{}, protocol.NewError(contract.ErrorBackupUnsupported, i18n.T("backup.unsupported.format", head.Format)).
			WithFix(i18n.T("backup.unsupported.fix"))
	}

	value, err := contract.Decode(raw)
	if err == nil {
		err = contract.Validate("BackupManifest", value)
	}
	if err != nil {
		return contract.BackupManifest{}, corrupt(i18n.T("backup.corrupt.manifest", err.Error()))
	}

	var manifest contract.BackupManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return contract.BackupManifest{}, corrupt(i18n.T("backup.corrupt.manifest", err.Error()))
	}

	return manifest, nil
}

// identity reads the private key of the secret line and checks it opens this backup before any part is fetched.
func (o opened) identity(secrets contract.BackupSecrets) ([]byte, error) {
	private, err := seal.DecodeKey(secrets.PrivateKey)
	if err != nil {
		return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.key.missing")).
			WithFix(i18n.T("backup.key.missing.fix"))
	}

	recipient, err := seal.RecipientOf(private)
	if err != nil || recipient != o.manifest.Recipient {
		return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.key.wrong")).
			WithFix(i18n.T("backup.key.wrong.fix"))
	}

	return private, nil
}

// A part is checked against the manifest before it is opened: one sealed by someone who knows the public key never reaches a database.
func (s *Service) part(backup opened, part contract.BackupPart, private []byte) (io.ReadCloser, error) {
	if err := os.MkdirAll(s.paths.Staging, 0o700); err != nil {
		return nil, err
	}

	held, err := os.CreateTemp(s.paths.Staging, "part-*")
	if err != nil {
		return nil, err
	}

	discard := func() {
		held.Close()
		os.Remove(held.Name())
	}

	if err := s.download(backup, part, held); err != nil {
		discard()

		return nil, err
	}

	if _, err := held.Seek(0, io.SeekStart); err != nil {
		discard()

		return nil, err
	}

	sealed, err := seal.NewReader(held, private)
	if err != nil {
		discard()

		return nil, corrupt(i18n.T("backup.corrupt.part", part.Key, err.Error()))
	}

	unzipped, err := gzip.NewReader(sealed)
	if err != nil {
		discard()

		return nil, corrupt(i18n.T("backup.corrupt.part", part.Key, err.Error()))
	}

	return closing{Reader: unzipped, close: discard}, nil
}

func (s *Service) download(backup opened, part contract.BackupPart, into io.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), partDeadline(part.Bytes))
	defer cancel()

	body, err := backup.client.Get(ctx, backup.key+"/"+part.Key)
	if s3.KindOf(err) == s3.KindNoKey {
		return corrupt(i18n.T("backup.corrupt.absent", part.Key))
	}
	if err != nil {
		return module.StorageRefused(err)
	}
	defer body.Close()

	digest := sha256.New()
	if _, err := io.Copy(io.MultiWriter(into, digest), body); err != nil {
		return module.StorageRefused(err)
	}

	if hex.EncodeToString(digest.Sum(nil)) != part.SHA256 {
		return corrupt(i18n.T("backup.corrupt.digest", part.Key))
	}

	return nil
}

const (
	partFloor = 10 * time.Minute
	// A link slower than this has stalled: the restore lets go of the run lock rather than hold it for ever.
	slowestBytesPerSecond = 256 << 10
)

func partDeadline(bytes int64) time.Duration {
	return partFloor + time.Duration(bytes/slowestBytesPerSecond)*time.Second
}

type closing struct {
	io.Reader
	close func()
}

func (c closing) Close() error {
	c.close()

	return nil
}

func corrupt(message string) error {
	return protocol.NewError(contract.ErrorBackupCorrupt, message).WithFix(i18n.T("backup.corrupt.fix"))
}
