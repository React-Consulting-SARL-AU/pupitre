package main

import (
	"fmt"
	"io"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/migrate"
)

// The ledger from a terminal on the machine.
//
// It is the way back when the app is not the one holding the channel: a status
// to read, a batch to run again, and the backup to put back when a server has
// to run an older agent than the one that configured it.
func runMigrate(migrator *migrate.Runner, args []string, stdout, stderr io.Writer) int {
	status, restore := false, ""

	for _, arg := range args {
		switch {
		case arg == "--status":
			status = true
		case strings.HasPrefix(arg, "--restore="):
			restore = strings.TrimPrefix(arg, "--restore=")
		default:
			fmt.Fprintln(stderr, i18n.T("migrate.argument.unknown", arg))
			usage(stderr)

			return 2
		}
	}

	if status {
		return printStatus(migrator, stdout)
	}

	if restore != "" {
		return printRestore(migrator, restore, stdout, stderr)
	}

	return printRun(migrator, stdout, stderr)
}

func printRun(migrator *migrate.Runner, stdout, stderr io.Writer) int {
	result, err := migrator.Run()
	if err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	if result.Failure != nil {
		fmt.Fprintln(stderr, i18n.T("migrate.failed", result.Failure.ID, result.Failure.Slug, result.Failure.Message))

		if result.Restored {
			fmt.Fprintln(stderr, i18n.T("migrate.restored", result.Backup))
		}

		return 1
	}

	if len(result.Applied) == 0 {
		fmt.Fprintln(stdout, i18n.T("migrate.nothing", result.Revision))

		return 0
	}

	fmt.Fprintln(stdout, i18n.T("migrate.done", result.Revision))

	return 0
}

func printRestore(migrator *migrate.Runner, name string, stdout, stderr io.Writer) int {
	result, err := migrator.Restore(name)
	if err != nil {
		fmt.Fprintln(stderr, err)

		return 1
	}

	fmt.Fprintln(stdout, i18n.T("migrate.restore.done", name, result.Revision))

	return 0
}

func printStatus(migrator *migrate.Runner, stdout io.Writer) int {
	state := migrator.State()
	fmt.Fprintln(stdout, i18n.T("migrate.status.revision", state.Revision, state.Expected, string(state.State)))

	ledger := migrator.Ledger()
	fmt.Fprintln(stdout, i18n.T("migrate.status.applied"))
	if len(ledger.Applied) == 0 {
		fmt.Fprintln(stdout, "  "+i18n.T("migrate.status.none"))
	}
	for _, applied := range ledger.Applied {
		fmt.Fprintf(stdout, "  %d %s  %s\n", applied.ID, applied.Slug, applied.At)
	}

	fmt.Fprintln(stdout, i18n.T("migrate.status.pending"))
	pending := migrator.Pending()
	if len(pending) == 0 {
		fmt.Fprintln(stdout, "  "+i18n.T("migrate.status.none"))
	}
	for _, migration := range pending {
		fmt.Fprintf(stdout, "  %d %s\n", migration.ID, migration.Slug)
	}

	fmt.Fprintln(stdout, i18n.T("migrate.status.backups"))
	backups := migrator.Backups()
	if len(backups) == 0 {
		fmt.Fprintln(stdout, "  "+i18n.T("migrate.status.none"))
	}
	for _, backup := range backups {
		fmt.Fprintf(stdout, "  %s  r%d → r%d\n", backup.Name, backup.From, backup.To)
	}

	return failing(state)
}

// A status says what it found in its exit code, so a script on the machine
// reads it without parsing a sentence.
func failing(state contract.ConfigRevision) int {
	if state.Current() {
		return 0
	}

	return 1
}
