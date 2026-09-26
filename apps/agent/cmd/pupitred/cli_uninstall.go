package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/devcli"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/selfupdate"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	uninstallCommand = "uninstall"

	agentBinary      = selfupdate.DefaultBinaryPath
	unitDir          = "/etc/systemd/system"
	configDir        = migrate.DefaultDir
	stateDir         = "/var/lib/pupitre"
	logRotationPath  = "/etc/logrotate.d/pupitre"
	confirmedAnswers = "y yes o oui"
)

var interactive = func(stdin io.Reader) bool {
	terminal, isFile := stdin.(*os.File)
	if !isFile {
		return false
	}

	info, err := terminal.Stat()

	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

type removal struct {
	label string
	fix   string
	apply func(sys.Context) error
}

// Its journal is /var/log/pupitre.log, which this command deletes: writing to it would bring the file back.
type unjournaled struct {
	sys sys.Sys
}

func (u unjournaled) Sys() sys.Sys {
	return u.sys
}

func (unjournaled) Logf(string, ...any) {}

func (unjournaled) Once(_ string, fn func() error) error {
	return fn()
}

func runUninstall(sysImpl sys.Sys, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	confirmed, known := uninstallArguments(args)
	if !known {
		fmt.Fprintln(stderr, i18n.T("uninstall.usage"))

		return 2
	}

	if effectiveUID() != 0 {
		fmt.Fprintln(stderr, i18n.T("uninstall.root"))

		return 1
	}

	ctx := unjournaled{sys: sysImpl}
	removals, binary := uninstallPlan(ctx)

	if len(removals) == 0 && binary == nil {
		fmt.Fprintln(stdout, i18n.T("uninstall.nothing"))
		fmt.Fprintln(stdout, i18n.T("uninstall.seat"))

		return 0
	}

	if !confirmed && !interactive(stdin) {
		fmt.Fprintln(stderr, i18n.T("uninstall.terminal"))

		return 1
	}

	printPlan(ctx, stdout, removals, binary)

	if !confirmed && !confirm(stdin, stdout) {
		fmt.Fprintln(stdout, i18n.T("uninstall.declined"))

		return 1
	}

	fmt.Fprintln(stdout)

	failed := apply(ctx, stdout, removals)

	if binary != nil && failed == 0 {
		failed += apply(ctx, stdout, []removal{*binary})
	} else if binary != nil {
		fmt.Fprintf(stdout, "  · %s\n", i18n.T("uninstall.binary.kept", agentBinary))
	}

	fmt.Fprintln(stdout)

	if failed > 0 {
		fmt.Fprintln(stderr, i18n.T("uninstall.failed", failed))

		return 1
	}

	fmt.Fprintln(stdout, i18n.T("uninstall.done"))
	fmt.Fprintln(stdout, i18n.T("uninstall.seat"))

	return 0
}

func uninstallArguments(args []string) (confirmed, known bool) {
	switch {
	case len(args) == 0:
		return false, true
	case len(args) == 1 && args[0] == "--yes":
		return true, true
	}

	return false, false
}

// The binary goes last and only after everything else went, so a failed run can be run again.
func uninstallPlan(ctx sys.Context) ([]removal, *removal) {
	var removals []removal

	removals = append(removals, agentUnits(ctx)...)
	removals = append(removals, agentCommands(ctx)...)
	removals = append(removals, sudoRule(ctx)...)
	removals = append(removals, agentConfig(ctx)...)
	removals = append(removals, agentState(ctx)...)
	removals = append(removals, agentLogs(ctx)...)

	if !file.Exists(ctx, agentBinary) {
		return removals, nil
	}

	return removals, &removal{
		label: i18n.T("uninstall.binary", agentBinary),
		fix:   "sudo rm " + agentBinary,
		apply: func(ctx sys.Context) error { return removeEntry(ctx, agentBinary, false) },
	}
}

// Found by what they run rather than by name: pupitre-mailpit is a client's service, pupitre-shots is the agent.
func agentUnits(ctx sys.Context) []removal {
	nodes, err := ctx.Sys().ListIn(unitDir, ".")
	if err != nil {
		return nil
	}

	var removals []removal

	for _, node := range nodes {
		if node.Kind != sys.NodeFile || !strings.HasSuffix(node.Name, ".service") {
			continue
		}

		content, err := ctx.Sys().ReadFileIn(unitDir, node.Name)
		if err != nil || !runsAgent(content) {
			continue
		}

		removals = append(removals, unitRemoval(strings.TrimSuffix(node.Name, ".service")))
	}

	return removals
}

func runsAgent(unit []byte) bool {
	for _, line := range strings.Split(string(unit), "\n") {
		command, isExec := strings.CutPrefix(strings.TrimSpace(line), "ExecStart=")
		fields := strings.Fields(command)

		if isExec && len(fields) > 0 && strings.TrimLeft(fields[0], "-@+!:") == agentBinary {
			return true
		}
	}

	return false
}

// The resume unit's cgroup holds the tmux server of the projects it brought back: stopping it would kill them.
func unitRemoval(unit string) removal {
	path := unitDir + "/" + unit + ".service"
	stop := unit != daemon.ResumeUnit

	label, fix := i18n.T("uninstall.unit.stopped", unit), "sudo systemctl disable --now "+unit
	if !stop {
		label, fix = i18n.T("uninstall.unit.resume", unit), "sudo systemctl disable "+unit
	}

	return removal{
		label: label,
		fix:   fix + " && sudo rm " + path + " && sudo systemctl daemon-reload",
		apply: func(ctx sys.Context) error {
			if err := disableUnit(ctx, unit, stop); err != nil {
				return err
			}

			if _, err := file.Remove(ctx, path); err != nil {
				return err
			}

			_, err := sys.Exec(ctx, sys.Command{Argv: []string{"systemctl", "daemon-reload"}})

			return err
		},
	}
}

func disableUnit(ctx sys.Context, unit string, stop bool) error {
	if stop {
		return systemd.Disable(ctx, unit)
	}

	_, err := sys.Exec(ctx, sys.Command{Argv: []string{"systemctl", "disable", unit}})

	return err
}

func agentCommands(ctx sys.Context) []removal {
	var removals []removal

	for _, link := range []string{devcli.Link, shots.Link} {
		if !isAgent(ctx, link) {
			continue
		}

		removals = append(removals, removal{
			label: i18n.T("uninstall.command", link),
			fix:   "sudo rm " + link,
			apply: func(ctx sys.Context) error { return removeEntry(ctx, link, false) },
		})
	}

	return removals
}

// A link to the binary or a copy of it; any other program under that name is someone else's.
func isAgent(ctx sys.Context, path string) bool {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"readlink", path}})
	if err == nil {
		target := strings.TrimSpace(out.Stdout)
		if !filepath.IsAbs(target) {
			target = filepath.Join(filepath.Dir(path), target)
		}

		return target == agentBinary
	}

	if _, _, err := ctx.Sys().Stat(path); err != nil {
		return false
	}

	command, err := ctx.Sys().ReadFile(path)
	if err != nil {
		return false
	}

	agent, err := ctx.Sys().ReadFile(agentBinary)

	return err == nil && bytes.Equal(command, agent)
}

func sudoRule(ctx sys.Context) []removal {
	raw, err := ctx.Sys().ReadFile(sudo.Path)
	if err != nil || string(raw) != sudo.Restricted {
		return nil
	}

	return []removal{{
		label: i18n.T("uninstall.sudo", sudo.Path),
		fix:   "sudo visudo -f " + sudo.Path,
		apply: func(ctx sys.Context) error { return sudo.Write(ctx, sudo.Password) },
	}}
}

// env holds the only copy of the services' passwords and tokens: it stays, and so does its folder.
func agentConfig(ctx sys.Context) []removal {
	nodes, err := ctx.Sys().ListIn(configDir, ".")
	if err != nil {
		return nil
	}

	envName := filepath.Base(env.Path)
	keepsEnv := slices.ContainsFunc(nodes, func(node sys.Node) bool { return node.Name == envName })

	if keepsEnv && len(nodes) == 1 {
		return nil
	}

	if !keepsEnv {
		return []removal{{
			label: configDir,
			fix:   "sudo rm -r " + configDir,
			apply: func(ctx sys.Context) error { return removeEntry(ctx, configDir, true) },
		}}
	}

	return []removal{{
		label: i18n.T("uninstall.config", configDir, env.Path),
		fix:   "sudo find " + configDir + " -mindepth 1 -maxdepth 1 ! -name " + envName + " -exec rm -r {} +",
		apply: func(ctx sys.Context) error {
			for _, node := range nodes {
				if node.Name == envName {
					continue
				}

				if err := ctx.Sys().RemoveIn(configDir, node.Name, true); err != nil {
					return err
				}
			}

			return nil
		},
	}}
}

func agentState(ctx sys.Context) []removal {
	if _, err := ctx.Sys().ListIn(stateDir, "."); err != nil {
		return nil
	}

	return []removal{{
		label: i18n.T("uninstall.state", stateDir),
		fix:   "sudo rm -r " + stateDir,
		apply: func(ctx sys.Context) error { return removeEntry(ctx, stateDir, true) },
	}}
}

func agentLogs(ctx sys.Context) []removal {
	var removals []removal

	logDir, logName := filepath.Dir(modules.DefaultLogPath), filepath.Base(modules.DefaultLogPath)

	if nodes, err := ctx.Sys().ListIn(logDir, "."); err == nil {
		var journals []string

		for _, node := range nodes {
			if node.Name == logName || strings.HasPrefix(node.Name, logName+".") {
				journals = append(journals, node.Name)
			}
		}

		if len(journals) > 0 {
			removals = append(removals, removal{
				label: i18n.T("uninstall.logs", modules.DefaultLogPath),
				fix:   "sudo rm " + modules.DefaultLogPath + "*",
				apply: func(ctx sys.Context) error {
					for _, name := range journals {
						if err := ctx.Sys().RemoveIn(logDir, name, false); err != nil {
							return err
						}
					}

					return nil
				},
			})
		}
	}

	if file.Exists(ctx, logRotationPath) {
		removals = append(removals, removal{
			label: i18n.T("uninstall.rotation", logRotationPath),
			fix:   "sudo rm " + logRotationPath,
			apply: func(ctx sys.Context) error { return removeEntry(ctx, logRotationPath, false) },
		})
	}

	return removals
}

// Through the parent folder, so a link at the name is removed as a link and never followed.
func removeEntry(ctx sys.Context, path string, recursive bool) error {
	return ctx.Sys().RemoveIn(filepath.Dir(path), filepath.Base(path), recursive)
}

func printPlan(ctx sys.Context, stdout io.Writer, removals []removal, binary *removal) {
	fmt.Fprintln(stdout, i18n.T("uninstall.removes"))

	for _, planned := range removals {
		fmt.Fprintf(stdout, "  - %s\n", planned.label)
	}

	if binary != nil {
		fmt.Fprintf(stdout, "  - %s\n", binary.label)
	}

	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, i18n.T("uninstall.keeps"))

	for _, kept := range keptLines(ctx) {
		fmt.Fprintf(stdout, "  - %s\n", kept)
	}

	fmt.Fprintln(stdout)
}

func keptLines(ctx sys.Context) []string {
	kept := []string{
		i18n.T("uninstall.keep.services"),
		i18n.T("uninstall.keep.dev"),
		i18n.T("uninstall.keep.exposure"),
		i18n.T("uninstall.keep.hardening"),
		i18n.T("uninstall.keep.keys"),
	}

	if file.Exists(ctx, env.Path) {
		kept = append(kept, i18n.T("uninstall.keep.env", env.Path))
	}

	raw, err := ctx.Sys().ReadFile(sudo.Path)

	switch {
	case err != nil, string(raw) == sudo.Restricted:
	case string(raw) == sudo.Password:
		kept = append(kept, i18n.T("uninstall.keep.sudo.password", sudo.Path))
	case string(raw) == sudo.Open:
		kept = append(kept, i18n.T("uninstall.keep.sudo.open", sudo.Path))
	default:
		kept = append(kept, i18n.T("uninstall.keep.sudo.other", sudo.Path))
	}

	return kept
}

func confirm(stdin io.Reader, stdout io.Writer) bool {
	fmt.Fprint(stdout, i18n.T("uninstall.confirm"))

	answer, _ := bufio.NewReader(stdin).ReadString('\n')

	return slices.Contains(strings.Fields(confirmedAnswers), strings.ToLower(strings.TrimSpace(answer)))
}

func apply(ctx sys.Context, stdout io.Writer, removals []removal) int {
	failed := 0

	for _, planned := range removals {
		if err := planned.apply(ctx); err != nil {
			failed++

			fmt.Fprintf(stdout, "  ✗ %s\n    %s\n    %s\n", planned.label, err, i18n.T("uninstall.fix", planned.fix))

			continue
		}

		fmt.Fprintf(stdout, "  ✓ %s\n", planned.label)
	}

	return failed
}
