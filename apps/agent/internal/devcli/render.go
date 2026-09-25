package devcli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
)

type printer struct {
	out  io.Writer
	err  io.Writer
	json bool
}

func render[T any](out *printer, result any, show func(T)) int {
	if out.json {
		return out.raw(result)
	}

	value, err := as[T](result)
	if err != nil {
		return out.failure(err)
	}

	show(value)

	return 0
}

func (p *printer) raw(value any) int {
	encoder := json.NewEncoder(p.out)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(false)

	if err := encoder.Encode(value); err != nil {
		fmt.Fprintln(p.err, err)

		return 1
	}

	return 0
}

func (p *printer) line(text string) {
	fmt.Fprintln(p.out, text)
}

func (p *printer) logEvent(event string, fields map[string]any) {
	if event != "log" {
		return
	}

	if line, ok := fields["line"].(string); ok {
		p.line(line)
	}
}

func (p *printer) usage(err error) int {
	fmt.Fprintln(p.err, err)
	fmt.Fprint(p.err, Usage())

	return 2
}

func (p *printer) failure(err error) int {
	return PrintFailure(p.err, err)
}

func PrintFailure(stderr io.Writer, err error) int {
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

func (p *printer) projectAction(name string, result contract.ProjectActionResult) {
	if len(result.Projects) == 0 {
		p.line(fmt.Sprintf("%-24s %-9s", name, result.State))

		return
	}

	for _, project := range result.Projects {
		p.line(fmt.Sprintf("%-24s %-9s", project.Name, project.State))
	}
}

func (p *printer) status(status contract.Status) {
	for _, service := range status.Services {
		p.line(fmt.Sprintf("%-24s %-9s %s", service.ID, service.State, service.Version))
	}

	if len(status.Services) > 0 && len(status.Projects) > 0 {
		p.line("")
	}

	for _, project := range status.Projects {
		if len(project.Processes) == 1 {
			p.line(fmt.Sprintf("%-24s %-9s %-11s %s", project.Name, project.State, port(project.Processes[0].Port), project.Branch))
			continue
		}

		p.line(fmt.Sprintf("%-24s %-9s %-11s %s", project.Name, project.State, "", project.Branch))

		for _, process := range project.Processes {
			p.line(fmt.Sprintf("  %-22s %-9s %s", process.ID, process.State, port(process.Port)))
		}
	}
}

func (p *printer) stepEvent(event string, fields map[string]any) {
	if event != "step" || p.json {
		return
	}

	step, _ := fields["step"].(string)
	message, _ := fields["message"].(string)

	switch fields["status"] {
	case string(contract.StepOK):
		p.line("  ✓ " + step)
	case string(contract.StepSkip):
		p.line("  · " + step + " (" + i18n.T("devcli.backup.copied") + ")")
	case string(contract.StepFail):
		p.line("  ✗ " + step + " : " + message)
	}
}

func (p *printer) backupRun(result contract.BackupRunResult) {
	p.line(i18n.T("devcli.backup.made", result.ID, len(result.Parts), megabytes(result.Bytes)))

	if !result.Declared {
		p.line("  ! " + i18n.T("devcli.backup.undeclared"))
	}

	for _, warning := range result.Warnings {
		p.line("  ! " + warning)
	}
}

func (p *printer) backupStatus(status contract.BackupStatusResult) {
	if !status.Configured {
		p.line(i18n.T("devcli.backup.unconfigured"))

		return
	}

	if status.IntervalHours == 0 {
		p.line(i18n.T("devcli.backup.manual", status.Keep))
	} else {
		p.line(i18n.T("devcli.backup.schedule", status.IntervalHours, status.Keep))
	}

	if status.NextRunAt != "" {
		p.line(i18n.T("devcli.backup.next", status.NextRunAt))
	}

	if status.Running {
		p.line(i18n.T("devcli.backup.running"))
	}

	switch {
	case status.Last == nil:
		p.line(i18n.T("devcli.backup.never"))
	case status.Last.OK:
		p.line(i18n.T("devcli.backup.last.ok", status.Last.At, status.Last.ID, megabytes(status.Last.Bytes)))
	default:
		p.line(i18n.T("devcli.backup.last.failed", status.Last.At, status.Last.Error))
	}
}

func megabytes(bytes int64) string {
	return fmt.Sprintf("%.1f", float64(bytes)/(1<<20))
}

func port(value int) string {
	if value == 0 {
		return ""
	}

	return "port " + fmt.Sprint(value)
}

func mark(ok bool) string {
	if ok {
		return "ok"
	}

	return "KO"
}

func current(is bool) string {
	if is {
		return "*"
	}

	return " "
}

func done(changed bool, yes, no string) string {
	if changed {
		return yes
	}

	return no
}

func when(condition bool, text string) string {
	if condition {
		return text
	}

	return ""
}

func first(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}

	return ""
}
