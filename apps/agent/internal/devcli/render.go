package devcli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/protocol"
)

type printer struct {
	out  io.Writer
	err  io.Writer
	json bool
}

// The protocol answer, or the same answer read aloud: --json is what a script pipes, the plain lines are what a human reads.
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

// A protocol error as a human reads it: the code so a ticket can name it, the message, and the fix when there is one.
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
		p.line(fmt.Sprintf("%-24s %-9s %s", name, result.State, port(result.Port)))

		return
	}

	for _, project := range result.Projects {
		p.line(fmt.Sprintf("%-24s %-9s %s", project.Name, project.State, port(project.Port)))
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
		p.line(fmt.Sprintf("%-24s %-9s %-11s %s", project.Name, project.State, port(project.Port), project.Branch))
	}
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
