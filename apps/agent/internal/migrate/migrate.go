package migrate

import (
	"fmt"
	"sort"
	"strconv"
	"sync/atomic"
	"time"

	"pupitre.studio/agent/internal/contract"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/lock"
)

const Command = "migrate"

// ID is never reused nor reordered; Touches is what gets backed up and restored; Since is informational only.
type Migration struct {
	ID      int
	Slug    string
	Since   string
	Touches []Target
	Apply   func(*Context) error
}

type Run struct {
	ID   int    `json:"id"`
	Slug string `json:"slug"`
	Ms   int64  `json:"ms"`
}

type Failure struct {
	ID      int    `json:"id"`
	Slug    string `json:"slug"`
	Message string `json:"message"`
}

type Result struct {
	Revision int                  `json:"revision"`
	Expected int                  `json:"expected"`
	State    contract.ConfigState `json:"state"`
	Applied  []Run                `json:"applied"`
	Pending  []int                `json:"pending"`
	Backup   string               `json:"backup,omitempty"`
	Failure  *Failure             `json:"failure,omitempty"`
	Restored bool                 `json:"restored"`
}

type Options struct {
	Sys          sys.Sys
	Now          func() time.Time
	AgentVersion string
	Paths        Paths
	Migrations   []Migration
	Keep         int
	Logf         func(string, ...any)
}

type Runner struct {
	options    Options
	paths      Paths
	migrations []Migration

	// A refusal restores the files, so the ledger alone would read as merely pending until a run goes through.
	refused atomic.Bool
}

func New(options Options) *Runner {
	migrations := options.Migrations
	if migrations == nil {
		migrations = All()
	}

	ordered := append([]Migration(nil), migrations...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].ID < ordered[j].ID })

	return &Runner{options: options, paths: options.Paths.Resolved(), migrations: ordered}
}

func (r *Runner) Expected() int {
	if len(r.migrations) == 0 {
		return 0
	}

	return r.migrations[len(r.migrations)-1].ID
}

// No lock and no write: every session asks it, including one opened while an install runs.
func (r *Runner) State() contract.ConfigRevision {
	ledger, err := readLedger(r.options.Sys, r.paths.Ledger)
	expected := r.Expected()

	if err != nil {
		return contract.ConfigRevision{Revision: 0, Expected: expected, State: contract.ConfigFailed}
	}

	state := stateOf(ledger.Revision, expected)
	if state == contract.ConfigPending && r.refused.Load() {
		state = contract.ConfigFailed
	}

	return contract.ConfigRevision{Revision: ledger.Revision, Expected: expected, State: state}
}

func stateOf(revision, expected int) contract.ConfigState {
	switch {
	case revision == expected:
		return contract.ConfigCurrent
	case revision > expected:
		return contract.ConfigAhead
	default:
		return contract.ConfigPending
	}
}

// A refusing migration is reported as a Result state, not an error, so the backup and the failure are not lost.
func (r *Runner) Run() (Result, error) {
	ledger, err := readLedger(r.options.Sys, r.paths.Ledger)
	if err != nil {
		return Result{}, err
	}

	expected := r.Expected()

	if ledger.Revision >= expected {
		r.refused.Store(false)

		return r.settled(ledger.Revision, expected, nil), nil
	}

	pending := r.after(ledger.Revision)

	// An unconfigured machine has no old shape to carry over, so it is stamped at the current revision.
	if !r.configured() {
		ctx := r.context()
		ledger.Revision = expected
		ledger.AgentVersion = r.options.AgentVersion

		if err := writeLedger(ctx, r.paths.Ledger, ledger); err != nil {
			return Result{}, err
		}

		r.refused.Store(false)

		return r.settled(expected, expected, nil), nil
	}

	release, held, err := lock.Acquire(r.paths.Lock)
	if err != nil {
		return Result{}, err
	}

	// A running install migrated before it started; report pending rather than wait minutes on its lock.
	if !held {
		return r.settled(ledger.Revision, expected, ids(pending)), nil
	}
	defer release()

	return r.apply(ledger, pending, expected)
}

func (r *Runner) apply(ledger Ledger, pending []Migration, expected int) (Result, error) {
	ctx := r.context()
	from := ledger.Revision

	backup, err := r.snapshot(ctx, from, expected, r.backedUp(pending))
	if err != nil {
		return Result{}, err
	}

	applied := []Run{}

	for _, migration := range pending {
		started := r.now()
		ctx.Logf("migration %d %s", migration.ID, migration.Slug)

		if err := apply(migration, ctx); err != nil {
			return r.rollback(ctx, backup, migration, err, from, expected)
		}

		ms := r.now().Sub(started).Milliseconds()
		applied = append(applied, Run{ID: migration.ID, Ms: ms, Slug: migration.Slug})

		ledger.Revision = migration.ID
		ledger.AgentVersion = r.options.AgentVersion
		ledger.Applied = append(ledger.Applied, Applied{
			AgentVersion: r.options.AgentVersion,
			At:           started.UTC().Format(time.RFC3339),
			ID:           migration.ID,
			Ms:           ms,
			Slug:         migration.Slug,
		})

		// Written per migration so a power loss mid-batch replays only what is still owed.
		if err := writeLedger(ctx, r.paths.Ledger, ledger); err != nil {
			return Result{}, err
		}
	}

	r.prune()
	r.refused.Store(false)

	result := r.settled(ledger.Revision, expected, nil)
	result.Applied = applied
	result.Backup = backup

	return result, nil
}

// A panic refuses like an error; otherwise serve would crash at every reconnection with the lock held.
func apply(migration Migration, ctx *Context) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("migration %d panicked: %v", migration.ID, recovered)
		}
	}()

	return migration.Apply(ctx)
}

// The whole batch goes back, ledger included: half a batch is a shape no binary was written to read.
func (r *Runner) rollback(ctx *Context, backup string, migration Migration, cause error, from, expected int) (Result, error) {
	restored := r.restore(ctx, backup) == nil
	r.refused.Store(true)
	ctx.Logf("migration %d %s refused: %s", migration.ID, migration.Slug, cause)

	result := r.settled(from, expected, ids(r.after(from)))
	result.State = contract.ConfigFailed
	result.Backup = backup
	result.Restored = restored
	result.Failure = &Failure{
		ID:      migration.ID,
		Message: cause.Error(),
		Slug:    migration.Slug,
	}

	return result, nil
}

// The ledger goes back with the files so the next start replays the batch; whatever was configured since is lost.
func (r *Runner) Restore(name string) (Result, error) {
	release, held, err := lock.Acquire(r.paths.Lock)
	if err != nil {
		return Result{}, err
	}

	if !held {
		return Result{}, busy()
	}
	defer release()

	ctx := r.context()

	if err := r.restore(ctx, name); err != nil {
		return Result{}, err
	}

	r.refused.Store(false)

	ledger, err := readLedger(r.options.Sys, r.paths.Ledger)
	if err != nil {
		return Result{}, err
	}

	return r.settled(ledger.Revision, r.Expected(), ids(r.after(ledger.Revision))), nil
}

func (r *Runner) settled(revision, expected int, pending []int) Result {
	if pending == nil {
		pending = []int{}
	}

	return Result{
		Applied:  []Run{},
		Expected: expected,
		Pending:  pending,
		Revision: revision,
		State:    stateOf(revision, expected),
	}
}

func (r *Runner) after(revision int) []Migration {
	var pending []Migration

	for _, migration := range r.migrations {
		if migration.ID > revision {
			pending = append(pending, migration)
		}
	}

	return pending
}

func (r *Runner) configured() bool {
	exists, err := r.options.Sys.Exists(r.paths.Install)

	return err == nil && exists
}

func (r *Runner) context() *Context {
	return &Context{Paths: r.paths, logf: r.options.Logf, machine: r.options.Sys, now: r.now}
}

func (r *Runner) now() time.Time {
	if r.options.Now == nil {
		return time.Now()
	}

	return r.options.Now()
}

func ids(migrations []Migration) []int {
	numbers := make([]int, 0, len(migrations))

	for _, migration := range migrations {
		numbers = append(numbers, migration.ID)
	}

	return numbers
}

func itoa(value int) string {
	return strconv.Itoa(value)
}

// For display only: an unreadable ledger shows as empty, and State says why.
func (r *Runner) Ledger() Ledger {
	ledger, _ := readLedger(r.options.Sys, r.paths.Ledger)

	return ledger
}

func (r *Runner) Pending() []Migration {
	return r.after(r.Ledger().Revision)
}
