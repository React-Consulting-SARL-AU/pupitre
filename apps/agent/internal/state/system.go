package state

import (
	"fmt"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

// What the machine is expected to answer with, and how it says its version: java writes it on the error output, everyone else on the standard one.
var tools = [][]string{
	{"node", "-v"},
	{"bun", "-v"},
	{"pnpm", "-v"},
	{"java", "-version"},
	{"claude", "--version"},
	{"codex", "--version"},
}

func (r *Reader) Reboot() error {
	if _, err := sys.Exec(r.ctx(), sys.Command{Argv: []string{"systemctl", "reboot"}}); err != nil {
		return protocol.NewError(contract.ErrorInternal, i18n.T("state.reboot.refused")).
			WithFix(i18n.T("state.reboot.refused.fix"))
	}

	return nil
}

func (r *Reader) Doctor() []contract.DoctorCheck {
	checks := []contract.DoctorCheck{}
	checks = append(checks, r.toolChecks()...)
	checks = append(checks, r.serviceChecks()...)
	checks = append(checks, r.sessionCheck())
	checks = append(checks, r.projectChecks()...)

	return checks
}

func (r *Reader) toolChecks() []contract.DoctorCheck {
	owner := r.options.Tmux.Resolved().User

	checks := make([]contract.DoctorCheck, 0, len(tools))
	for _, argv := range tools {
		out, err := user.Run(r.ctx(), owner, argv...)
		checks = append(checks, contract.DoctorCheck{
			Name:    argv[0],
			OK:      err == nil,
			Message: firstLine(out),
			Fix:     absent(err, i18n.T("state.doctor.tool.fix", argv[0])),
		})
	}

	return checks
}

func (r *Reader) serviceChecks() []contract.DoctorCheck {
	services := r.services(false)

	checks := make([]contract.DoctorCheck, 0, len(services))
	for _, service := range services {
		running := service.State == contract.ServiceRunning
		checks = append(checks, contract.DoctorCheck{
			Name:    service.Name + " (" + service.ID + ")",
			OK:      running,
			Message: string(service.State),
			Fix:     when(!running, i18n.T("state.doctor.service.fix", service.ID)),
		})
	}

	return checks
}

func (r *Reader) sessionCheck() contract.DoctorCheck {
	session := r.options.Tmux.Resolved().Session
	_, err := r.ctx().Sys().Run(sys.Command{Argv: []string{"tmux", "has-session", "-t", session}})

	return contract.DoctorCheck{
		Name: i18n.T("state.doctor.session", session),
		OK:   err == nil,
		Fix:  absent(err, i18n.T("state.doctor.session.fix")),
	}
}

func (r *Reader) projectChecks() []contract.DoctorCheck {
	ctx := r.ctx()
	projects := r.options.Paths.Resolved().Projects

	checks := []contract.DoctorCheck{}
	for _, project := range r.registry().Projects {
		if project.IsService() {
			continue
		}

		dir := project.Path(projects)
		present := file.Exists(ctx, dir)
		checks = append(checks, contract.DoctorCheck{
			Name:    project.Name,
			OK:      present,
			Message: when(!present, i18n.T("state.dir.absent", dir)),
			Fix:     when(!present, i18n.T("state.project.sync.fix", project.Name)),
		})
	}

	return checks
}

// One plain-text page: what a support request should carry, with no secret and nothing to interpret.
func (r *Reader) Diag() contract.Diag {
	now := r.options.Now().UTC()
	machine := Machine(r.ctx(), r.options.AgentVersion)

	var report strings.Builder
	fmt.Fprintf(&report, "pupitred %s · %s · %s %s · %s\n", machine.AgentVersion, machine.Hostname, machine.OS, machine.Version, machine.Arch)
	report.WriteString(i18n.T("state.diag.entitlement", r.entitlement()) + "\n")
	report.WriteString(i18n.T("state.diag.machine",
		machine.Load[0], machine.Load[1], machine.Load[2],
		machine.RAMUsedMB, machine.RAMTotalMB, machine.DiskFreeGB, machine.DiskTotalGB,
		(time.Duration(machine.UptimeS)*time.Second).String()) + "\n")

	report.WriteString("\n" + i18n.T("state.diag.services") + "\n")
	for _, service := range r.services(false) {
		fmt.Fprintf(&report, "  %-24s %-8s %s\n", service.ID, service.State, service.Version)
	}

	report.WriteString("\n" + i18n.T("state.diag.projects") + "\n")
	for _, project := range r.projects() {
		fmt.Fprintf(&report, "  %-24s %-9s port %-6d %s\n", project.Name, project.State, project.Port, project.Branch)
	}

	report.WriteString("\n" + i18n.T("state.diag.sessions") + "\n")
	for _, session := range r.Sessions() {
		fmt.Fprintf(&report, "  %-8d %-7s %5d %s %s\n", session.PID, session.Kind, session.RAMMB, i18n.T("state.diag.megabytes"), session.Command)
	}

	report.WriteString("\n" + i18n.T("state.diag.doctor") + "\n")
	for _, check := range r.Doctor() {
		fmt.Fprintf(&report, "  %s %-30s %s\n", mark(check.OK), check.Name, check.Message)
	}

	return contract.Diag{GeneratedAt: now.Format(time.RFC3339), Report: report.String()}
}

func mark(ok bool) string {
	if ok {
		return "ok"
	}

	return "KO"
}

func firstLine(out string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(out), "\n")

	return line
}

func absent(err error, fix string) string {
	return when(err != nil, fix)
}

func when(condition bool, text string) string {
	if condition {
		return text
	}

	return ""
}
