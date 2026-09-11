package migrate

import (
	"encoding/json"
	"path"
	"sort"
	"time"
)

const (
	manifestFile = "backup.json"

	// The ledger is backed up with the files it describes: putting both back
	// together is what makes a failed batch leave a machine that agrees with
	// itself, rather than files from before and a revision from after.
	ledgerName = "ledger"
)

type Backup struct {
	Name         string     `json:"-"`
	From         int        `json:"from"`
	To           int        `json:"to"`
	At           string     `json:"at"`
	AgentVersion string     `json:"agent_version,omitempty"`
	Files        []BackedUp `json:"files"`
}

// Present says whether the file was on the machine when the backup was taken.
// A file a migration created is restored by being removed again.
type BackedUp struct {
	Name    string `json:"name"`
	Present bool   `json:"present"`
}

func backupName(at time.Time, from int) string {
	return at.UTC().Format("20060102T150405Z") + "-r" + itoa(from)
}

// The names a backup holds: every target the pending migrations declare, once,
// plus the ledger. A migration that touches nothing still gets its ledger kept.
func (r *Runner) backedUp(pending []Migration) []string {
	seen := map[string]bool{ledgerName: true}
	names := []string{ledgerName}

	for _, migration := range pending {
		for _, target := range migration.Touches {
			if name := string(target); !seen[name] {
				seen[name] = true
				names = append(names, name)
			}
		}
	}

	return names
}

func (r *Runner) pathOf(name string) string {
	if name == ledgerName {
		return r.paths.Ledger
	}

	return r.paths.Of(Target(name))
}

func (r *Runner) snapshot(ctx *Context, from, to int, names []string) (string, error) {
	backup := Backup{
		AgentVersion: r.options.AgentVersion,
		At:           r.now().UTC().Format(time.RFC3339),
		From:         from,
		Name:         backupName(r.now(), from),
		To:           to,
	}

	dir := path.Join(r.paths.Backups, backup.Name)

	for _, name := range names {
		raw, err := r.options.Sys.ReadFile(r.pathOf(name))
		present := err == nil

		if present {
			if err := ctx.write(path.Join(dir, name), raw); err != nil {
				return "", err
			}
		}

		backup.Files = append(backup.Files, BackedUp{Name: name, Present: present})
	}

	encoded, err := json.MarshalIndent(backup, "", "  ")
	if err != nil {
		return "", err
	}

	if err := ctx.write(path.Join(dir, manifestFile), append(encoded, '\n')); err != nil {
		return "", err
	}

	return backup.Name, nil
}

// Restore puts a batch's files back where they were, the ledger included.
//
// It resolves each file by the name the backup gave it, not by the path it had:
// the paths are the ones this binary reads today, which is where the files have
// to land for it to read them.
func (r *Runner) restore(ctx *Context, name string) error {
	backup, err := r.Backup(name)
	if err != nil {
		return err
	}

	dir := path.Join(r.paths.Backups, name)

	for _, file := range backup.Files {
		target := r.pathOf(file.Name)

		if !file.Present {
			if err := ctx.remove(target); err != nil {
				return err
			}

			continue
		}

		raw, err := r.options.Sys.ReadFile(path.Join(dir, file.Name))
		if err != nil {
			return err
		}

		if err := ctx.write(target, raw); err != nil {
			return err
		}
	}

	return nil
}

func (r *Runner) Backup(name string) (Backup, error) {
	raw, err := r.options.Sys.ReadFile(path.Join(r.paths.Backups, name, manifestFile))
	if err != nil {
		return Backup{}, unknownBackup(name)
	}

	var backup Backup
	if err := json.Unmarshal(raw, &backup); err != nil {
		return Backup{}, unknownBackup(name)
	}

	backup.Name = name

	return backup, nil
}

// Backups lists what the machine still holds, newest first: the names sort by
// the moment they were taken, because that is how they are written.
func (r *Runner) Backups() []Backup {
	entries, err := r.options.Sys.ReadDir(r.paths.Backups)
	if err != nil {
		return nil
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.Dir {
			names = append(names, entry.Name)
		}
	}

	sort.Sort(sort.Reverse(sort.StringSlice(names)))

	backups := make([]Backup, 0, len(names))
	for _, name := range names {
		if backup, err := r.Backup(name); err == nil {
			backups = append(backups, backup)
		}
	}

	return backups
}

// A machine keeps the last few batches and forgets the rest: a backup nobody
// restored in five releases is not the one a rollback will reach for.
func (r *Runner) prune() {
	entries, err := r.options.Sys.ReadDir(r.paths.Backups)
	if err != nil {
		return
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.Dir {
			names = append(names, entry.Name)
		}
	}

	if len(names) <= r.keep() {
		return
	}

	sort.Strings(names)

	for _, name := range names[:len(names)-r.keep()] {
		_ = r.options.Sys.RemoveIn(r.paths.Backups, name, true)
	}
}

func (r *Runner) keep() int {
	if r.options.Keep > 0 {
		return r.options.Keep
	}

	return DefaultKeep
}
