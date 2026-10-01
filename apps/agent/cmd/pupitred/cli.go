package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/probe"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys/lock"
)

// The verbs reach a root server when this account cannot read what the answer depends on.
func runDev(engine *modules.Engine, args []string, stdout, stderr io.Writer) int {
	local := func() devcli.Caller { return newServer(engine, false) }

	caller, err := devcli.RealElevation(engine.Sys, tokenPath(), licensePath()).Caller(local, version)
	if err != nil {
		return devcli.PrintFailure(stderr, err)
	}

	if remote, isRemote := caller.(*devcli.Remote); isRemote {
		defer remote.Close()
	}

	return devcli.Run(devcli.Options{Server: caller, Tmux: stateOptions().Tmux}, args, stdout, stderr)
}

func runInstall(engine *modules.Engine, config contract.ConfigRevision, args []string, stderr io.Writer) int {
	if !config.Current() {
		return devcli.PrintFailure(stderr, protocol.MigrationRequired(config))
	}

	var only, skip []string

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--only="):
			only = splitIDs(strings.TrimPrefix(arg, "--only="))
		case strings.HasPrefix(arg, "--skip="):
			skip = splitIDs(strings.TrimPrefix(arg, "--skip="))
		default:
			fmt.Fprintln(stderr, i18n.T("cli.argument.unknown", arg))
			usage(stderr)
			return 2
		}
	}

	request, err := loadRequest(engine.InstallPath)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	// Naming a deferred module answers for it, so that answer is persisted as the app's would be.
	if len(only) > 0 {
		answered := without(request.Defer, without(request.Defer, only))
		request.Modules = only
		request.Defer = without(request.Defer, only)
		request.Persist = len(answered) > 0
	}

	request.Modules = without(request.Modules, skip)

	if len(request.Modules) == 0 {
		fmt.Fprintln(stderr, i18n.T("cli.install.nothing", engine.InstallPath))
		fmt.Fprintln(stderr, i18n.T("cli.install.nothing.fix"))
		return 2
	}

	fmt.Fprintf(stderr, "pupitred %s · install %s\n", engine.AgentVersion, strings.Join(request.Modules, ", "))

	result, err := engine.Install(request, printStep(stderr))
	if err != nil {
		return devcli.PrintFailure(stderr, err)
	}

	return printSummary(stderr, result)
}

// --script hands probe.sh to the app, which runs it on a bare machine before any binary exists there.
func runProbe(options probe.Options, args []string, stdout, stderr io.Writer) int {
	for _, arg := range args {
		switch {
		case arg == "--script":
			fmt.Fprint(stdout, probe.Script)
			return 0
		case strings.HasPrefix(arg, "--projects="):
			options.ProjectsDir = strings.TrimPrefix(arg, "--projects=")
		default:
			fmt.Fprintln(stderr, i18n.T("cli.argument.unknown", arg))
			usage(stderr)
			return 2
		}
	}

	raw, err := probe.Run(options).JSON()
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	if _, err := stdout.Write(raw); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	return 0
}

// An unfinished report while nobody holds the install lock is a run that died: answering interrupted stops the wait.
func runReport(engine *modules.Engine, stdout, stderr io.Writer) int {
	report, err := engine.Report()
	if err != nil {
		return devcli.PrintFailure(stderr, err)
	}

	if report.FinishedAt == "" && nobodyInstalls(engine.LockPath) {
		report = report.Interrupted(time.Now())
	}

	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")

	if err := encoder.Encode(report); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	return 0
}

func nobodyInstalls(lockPath string) bool {
	release, free, err := lock.Acquire(lockPath)
	if err != nil || !free {
		return false
	}

	release()

	return true
}

func loadRequest(path string) (modules.Request, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return modules.Request{}, nil
	}

	if err != nil {
		return modules.Request{}, err
	}

	var request modules.Request
	if err := json.Unmarshal(raw, &request); err != nil {
		return modules.Request{}, errors.New(i18n.T("cli.install.unreadable", path, err.Error()))
	}

	return request, nil
}

func printStep(stderr io.Writer) modules.Sink {
	return func(event contract.StepEvent) {
		switch event.Status {
		case contract.StepOK:
			fmt.Fprintf(stderr, "  ✓ %s · %s (%d ms)\n", event.Module, event.Step, event.Ms)
		case contract.StepSkip:
			fmt.Fprintf(stderr, "  · %s · %s (%s)\n", event.Module, event.Step, i18n.T("cli.step.done"))
		case contract.StepFail:
			fmt.Fprintf(stderr, "  ✗ %s · %s\n    %s\n", event.Module, event.Step, i18n.T("cli.step.replay", event.Replay))
		}
	}
}

func printSummary(stderr io.Writer, result contract.InstallResult) int {
	fmt.Fprintln(stderr)

	for _, warning := range result.Warned {
		fmt.Fprintf(stderr, "  ! %s\n", warning)
	}

	if len(result.Failed) == 0 {
		fmt.Fprintln(stderr, i18n.T("cli.summary.clean", result.ReportPath))
		return 0
	}

	fmt.Fprintln(stderr, i18n.T("cli.summary.failed", len(result.Failed)))

	for _, failure := range result.Failed {
		fmt.Fprintf(stderr, "  ✗ %s\n", failure)
	}

	fmt.Fprintln(stderr, i18n.T("cli.summary.report", result.ReportPath))

	return 1
}

func splitIDs(list string) []string {
	var ids []string

	for _, id := range strings.Split(list, ",") {
		if trimmed := strings.TrimSpace(id); trimmed != "" {
			ids = append(ids, trimmed)
		}
	}

	return ids
}

func without(ids, excluded []string) []string {
	skipped := map[string]bool{}

	for _, id := range excluded {
		skipped[id] = true
	}

	var kept []string

	for _, id := range ids {
		if !skipped[id] {
			kept = append(kept, id)
		}
	}

	return kept
}
