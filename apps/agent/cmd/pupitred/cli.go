package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"

	"pupitre.sh/agent/internal/contract"
	"pupitre.sh/agent/internal/modules"
	"pupitre.sh/agent/internal/protocol"
)

func runInstall(engine *modules.Engine, args []string, stderr io.Writer) int {
	var only, skip []string
	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--only="):
			only = splitIDs(strings.TrimPrefix(arg, "--only="))
		case strings.HasPrefix(arg, "--skip="):
			skip = splitIDs(strings.TrimPrefix(arg, "--skip="))
		default:
			fmt.Fprintf(stderr, "argument inconnu : %s\n", arg)
			usage(stderr)
			return 2
		}
	}

	request, err := loadRequest(engine.InstallPath)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	if len(only) > 0 {
		request.Modules = only
	}
	request.Modules = without(request.Modules, skip)

	if len(request.Modules) == 0 {
		fmt.Fprintf(stderr, "aucun module à installer : %s est absent et --only n'est pas donné.\nLance l'installation depuis l'app, ou passe --only=<id>.\n", engine.InstallPath)
		return 2
	}

	fmt.Fprintf(stderr, "pupitred %s · install %s\n", engine.AgentVersion, strings.Join(request.Modules, ", "))

	result, err := engine.Install(request, printStep(stderr))
	if err != nil {
		return printFailure(stderr, err)
	}

	return printSummary(stderr, result)
}

func runReport(engine *modules.Engine, stdout, stderr io.Writer) int {
	report, err := engine.Report()
	if err != nil {
		return printFailure(stderr, err)
	}

	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	return 0
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
		return modules.Request{}, fmt.Errorf("%s illisible : %w", path, err)
	}

	return request, nil
}

func printStep(stderr io.Writer) modules.Sink {
	return func(event contract.StepEvent) {
		switch event.Status {
		case contract.StepOK:
			fmt.Fprintf(stderr, "  ✓ %s · %s (%d ms)\n", event.Module, event.Step, event.Ms)
		case contract.StepSkip:
			fmt.Fprintf(stderr, "  · %s · %s (déjà fait)\n", event.Module, event.Step)
		case contract.StepFail:
			fmt.Fprintf(stderr, "  ✗ %s · %s\n    rejeu : %s\n", event.Module, event.Step, event.Replay)
		}
	}
}

func printSummary(stderr io.Writer, result contract.InstallResult) int {
	fmt.Fprintln(stderr)

	for _, warning := range result.Warned {
		fmt.Fprintf(stderr, "  ! %s\n", warning)
	}

	if len(result.Failed) == 0 {
		fmt.Fprintf(stderr, "Aucune étape en échec. Rapport : %s\n", result.ReportPath)
		return 0
	}

	fmt.Fprintf(stderr, "%d étape(s) en échec :\n", len(result.Failed))
	for _, failure := range result.Failed {
		fmt.Fprintf(stderr, "  ✗ %s\n", failure)
	}
	fmt.Fprintf(stderr, "Rapport : %s\n", result.ReportPath)

	return 1
}

func printFailure(stderr io.Writer, err error) int {
	var failure *protocol.Error
	if errors.As(err, &failure) {
		fmt.Fprintf(stderr, "%s : %s\n", failure.Code, failure.Message)
		if failure.Fix != "" {
			fmt.Fprintf(stderr, "  %s\n", failure.Fix)
		}
		return 1
	}

	fmt.Fprintln(stderr, err)

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
