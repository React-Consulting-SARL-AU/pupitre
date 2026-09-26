package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
)

const (
	envCommand = "env"

	// What the last evaluation exported, so that leaving a folder unsets what no longer applies.
	envKeysVariable = "_PUPITRE_ENV_KEYS"
)

// Run by the shell at every prompt as the projects user: no engine, no lock, one file read.
func runEnv(args []string, stdout, stderr io.Writer) int {
	if len(args) > 0 {
		usage(stderr)
		return 2
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return 0
	}

	raw, err := os.ReadFile(filepath.Join(home, registry.EnvironmentFile))
	if err != nil {
		return 0
	}

	dir, err := os.Getwd()
	if err != nil {
		return 0
	}

	fmt.Fprint(stdout, shellEnvironment(raw, dir, os.Getenv(envKeysVariable)))

	return 0
}

// An unreadable document prints nothing: the shell keeps what it has rather than lose PUPITRE=1.
func shellEnvironment(raw []byte, dir, previous string) string {
	var document registry.EnvironmentDocument
	if err := json.Unmarshal(raw, &document); err != nil {
		return ""
	}

	var out strings.Builder

	pairs := document.At(dir)
	names := make([]string, 0, len(pairs))

	for _, pair := range pairs {
		name, _, found := strings.Cut(pair, "=")
		if found {
			names = append(names, name)
		}
	}

	var gone []string

	for _, name := range strings.Fields(previous) {
		if !slices.Contains(names, name) {
			gone = append(gone, name)
		}
	}

	if len(gone) > 0 {
		fmt.Fprintf(&out, "unset %s\n", strings.Join(gone, " "))
	}

	for _, pair := range pairs {
		name, value, found := strings.Cut(pair, "=")
		if found {
			fmt.Fprintf(&out, "export %s=%s\n", name, sys.ShellQuote(value))
		}
	}

	fmt.Fprintf(&out, "export %s=%s\n", envKeysVariable, sys.ShellQuote(strings.Join(names, " ")))

	return out.String()
}
