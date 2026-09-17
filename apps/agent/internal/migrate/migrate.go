// Package migrate brings the configuration on the machine to the shape the
// binary reading it expects.
//
// A binary and its configuration travel apart: `agent.upgrade` replaces one,
// the other stays where it is. When a release changes the shape of a file under
// /etc/pupitre — a field renamed, a module split in two, a value that stopped
// meaning what it meant — the new binary would read the old shape and get it
// wrong. This is where that gap is closed, once, in order, and only forwards.
//
// The revision is a plain counter, not a version. Shapes do not change once per
// release, and a pre-release or a development build has no place in an ordering
// that has to be exact.
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

// Command is the sub-command a human runs on the machine: the same ledger the
// app reaches over the protocol, with the backups a rollback needs.
const Command = "migrate"

// A Migration is one change of shape.
//
// Its identifier is what the machine remembers, so it is never reused and never
// reordered. `Touches` names the files it may write, which is what gets kept
// before the batch runs and put back if it fails. `Since` is the agent version
// that first shipped it, for a reader looking at a ledger years later; nothing
// is decided on it.
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
	// Migrations defaults to the ledger this binary carries. Tests pass their
	// own; nothing else does.
	Migrations []Migration
	Keep       int
	Logf       func(string, ...any)
}

type Runner struct {
	options    Options
	paths      Paths
	migrations []Migration

	// A refusal puts the files back, which leaves the ledger saying the machine
	// is merely behind. It is behind because a migration refused, and a reader
	// who is told to try again learns nothing. The process that ran it
	// remembers, until a run goes through.
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

// Expected is the revision this binary reads: the last migration it carries.
func (r *Runner) Expected() int {
	if len(r.migrations) == 0 {
		return 0
	}

	return r.migrations[len(r.migrations)-1].ID
}

// State reads where the machine stands without taking the lock and without
// writing anything. Every session asks it, including one opened while an
// install runs, so it has to cost a single read of a small file.
func (r *Runner) State() contract.ConfigRevision {
	ledger, _ := readLedger(r.options.Sys, r.paths.Ledger)
	expected := r.Expected()

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

// Run brings the machine to the revision this binary expects.
//
// It answers rather than fails: a migration that refused is a state to show,
// with the batch that was kept and the one that broke, not an error envelope
// that loses both. What refuses is every other command, for as long as the
// configuration is not the shape this binary reads.
func (r *Runner) Run() (Result, error) {
	ledger, _ := readLedger(r.options.Sys, r.paths.Ledger)
	expected := r.Expected()

	if ledger.Revision >= expected {
		r.refused.Store(false)

		return r.settled(ledger.Revision, expected, nil), nil
	}

	pending := r.after(ledger.Revision)

	// A machine that has never been configured is born at the current revision:
	// there is no shape to carry over, and stamping it says as much to whoever
	// reads the ledger later.
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

	// An install is running: it migrated before it started, so the machine is
	// not stuck — this reader is early. Saying so beats waiting on a lock the
	// session holding it may hold for minutes.
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

		// The ledger is written after every migration, not after the batch: a
		// machine that loses power mid-batch comes back agreeing with itself,
		// and replays only what it owes.
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

// A migration that panics refuses like one that errs: the alternative is a
// serve that crashes at every reconnection, the lock held and nothing said.
func apply(migration Migration, ctx *Context) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("migration %d panicked: %v", migration.ID, recovered)
		}
	}()

	return migration.Apply(ctx)
}

// The whole batch goes back, ledger included: half a batch is a shape no binary
// was ever written to read.
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

// Restore puts a batch's files back and leaves the ledger at the revision they
// belong to, so the next start replays what that batch had done. It is the way
// back for a machine that has to run an older agent again, and it is a
// deliberate gesture: what was configured since is lost with it.
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
	ledger, _ := readLedger(r.options.Sys, r.paths.Ledger)

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

// A machine holds a configuration once an install has been asked for on it.
// Before that there is nothing of yesterday's shape to carry over.
func (r *Runner) configured() bool {
	exists, err := r.options.Sys.Exists(r.paths.Install)

	return err == nil && exists
}

func (r *Runner) context() *Context {
	return &Context{Paths: r.paths, logf: r.options.Logf, machine: r.options.Sys}
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

// Ledger is what the machine remembers, for a reader rather than a decision.
func (r *Runner) Ledger() Ledger {
	ledger, _ := readLedger(r.options.Sys, r.paths.Ledger)

	return ledger
}

// Pending names the migrations the machine still owes this binary.
func (r *Runner) Pending() []Migration {
	return r.after(r.Ledger().Revision)
}
