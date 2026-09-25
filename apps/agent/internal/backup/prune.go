package backup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"slices"
	"sort"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/s3"
)

const (
	// An upload that has not written its manifest in a day never will.
	abandonedAfter = 24 * time.Hour
	manifestLimit  = 4 << 20
	// A manifest is kilobytes: a bucket that takes longer has stalled.
	manifestDeadline = 2 * time.Minute
)

type held struct {
	id       string
	trigger  string
	manifest bool
}

// Returns the pruned IDs, and those of them the platform could not be told about.
func (j *job) prune(current string, now time.Time) ([]string, []string) {
	var pruned, unknown []string

	err := j.ctx.Step("prune", func() (modules.Outcome, error) {
		prefix := j.settings.ServerPrefix(j.server)

		found, err := j.service.listBackups(j.client, prefix)
		if err != nil {
			return modules.Failed, err
		}

		for _, backup := range expired(found, current, j.settings.Keep, now) {
			if _, err := j.service.remove(j.client, prefix+backup.id+"/"); err != nil {
				return modules.Failed, err
			}

			if backup.manifest {
				pruned = append(pruned, backup.id)
			}
		}

		if err := j.service.abortAbandoned(j.client, prefix, now); err != nil {
			return modules.Failed, err
		}

		unknown = j.service.forget(pruned)

		if len(pruned) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
	if err != nil {
		j.warn("prune", err)
	}

	return pruned, unknown
}

// Only scheduled backups count against keep; manual ones stay, and day-old manifestless uploads go.
func expired(found []held, current string, keep int, now time.Time) []held {
	sort.Slice(found, func(a, b int) bool { return found[a].id > found[b].id })

	var going []held
	scheduled := 0

	for _, backup := range found {
		switch {
		case !backup.manifest:
			if at, err := time.Parse(idStamp, backup.id[:len(idStamp)]); err == nil && now.Sub(at) > abandonedAfter && backup.id != current {
				going = append(going, backup)
			}
		case backup.trigger == contract.BackupTriggerSchedule:
			scheduled++
			if scheduled > keep && backup.id != current {
				going = append(going, backup)
			}
		}
	}

	return going
}

func (s *Service) listBackups(client s3.Client, prefix string) ([]held, error) {
	_, prefixes, err := client.List(context.Background(), prefix, "/")
	if err != nil {
		return nil, err
	}

	var found []held

	for _, entry := range prefixes {
		id := strings.TrimSuffix(strings.TrimPrefix(entry, prefix), "/")
		if !idPattern.MatchString(id) {
			continue
		}

		trigger, err := triggerOf(client, prefix+id)
		switch {
		case s3.KindOf(err) == s3.KindNoKey:
			found = append(found, held{id: id})
		case err != nil:
			return nil, err
		default:
			found = append(found, held{id: id, trigger: trigger, manifest: true})
		}
	}

	return found, nil
}

// An unreadable manifest yields no trigger, so nothing is pruned on it.
func triggerOf(client s3.Client, key string) (string, error) {
	raw, err := fetchManifest(client, key)
	if err != nil {
		return "", err
	}

	var head struct {
		Trigger string `json:"trigger"`
	}

	if json.Unmarshal(raw, &head) != nil {
		return "", nil
	}

	return head.Trigger, nil
}

func fetchManifest(client s3.Client, key string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), manifestDeadline)
	defer cancel()

	body, err := client.Get(ctx, key+"/"+contract.BackupManifestKey)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	raw, err := io.ReadAll(io.LimitReader(body, manifestLimit+1))
	if err != nil {
		return nil, err
	}

	if len(raw) > manifestLimit {
		return nil, errManifestTooLarge
	}

	return raw, nil
}

var errManifestTooLarge = errors.New("the manifest is larger than any this agent writes")

func (s *Service) remove(client s3.Client, prefix string) (int, error) {
	objects, _, err := client.List(context.Background(), prefix, "")
	if err != nil {
		return 0, err
	}

	for _, object := range objects {
		if err := client.Delete(context.Background(), object.Key); err != nil {
			return 0, err
		}
	}

	return len(objects), nil
}

func (s *Service) abortAbandoned(client s3.Client, prefix string, now time.Time) error {
	uploads, err := client.Uploads(context.Background(), prefix)
	if err != nil {
		return err
	}

	for _, upload := range uploads {
		if now.Sub(upload.Initiated) > abandonedAfter {
			if err := client.Abort(context.Background(), upload.Key, upload.UploadID); err != nil {
				return err
			}
		}
	}

	return nil
}

func (s *Service) forget(ids []string) []string {
	var unknown []string

	for _, id := range ids {
		if err := s.forgetOne(id); err != nil {
			unknown = append(unknown, id)
		}
	}

	return unknown
}

func (s *Service) forgetOne(id string) error {
	client, err := s.options.Platform()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	return client.ForgetBackup(ctx, id)
}

// The platform is asked with no lock held, so one that does not answer never makes an install wait.
func (s *Service) tell() {
	var owed Record

	_ = s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		owed = s.record(ctx)

		return nil
	})

	var declared []string

	for _, declaration := range owed.Pending {
		if s.declare(declaration) == nil {
			declared = append(declared, declaration.ID)
		}
	}

	unknown := s.forget(owed.Forgotten)
	told := without(owed.Forgotten, unknown)

	if len(declared) == 0 && len(told) == 0 {
		return
	}

	_ = s.options.Engine.Command(module.ID, nil, func(ctx *modules.Context) error {
		record := s.record(ctx)
		record.Pending = withoutDeclarations(record.Pending, declared)
		record.Forgotten = without(record.Forgotten, told)

		return s.keep(ctx, record)
	})
}

func without(ids, gone []string) []string {
	var kept []string

	for _, id := range ids {
		if !slices.Contains(gone, id) {
			kept = append(kept, id)
		}
	}

	return kept
}

func withoutDeclarations(pending []contract.BackupDeclaration, ids []string) []contract.BackupDeclaration {
	kept := []contract.BackupDeclaration{}

	for _, declaration := range pending {
		if !slices.Contains(ids, declaration.ID) {
			kept = append(kept, declaration)
		}
	}

	return kept
}
