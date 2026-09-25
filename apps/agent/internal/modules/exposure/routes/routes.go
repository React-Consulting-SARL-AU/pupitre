// Package routes holds what every exposure module answers with: the state of its service and the address it gives each project.
package routes

import (
	"errors"
	"path"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/lock"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	StateRunning = "running"
	StateStopped = "stopped"
	StateFailed  = "failed"
	StateAbsent  = "absent"
)

// ModePath is the marker on disk saying which exposure module currently holds the machine.
const ModePath = "/etc/pupitre/exposure"

type Route struct {
	Hostname string `json:"hostname"`
	Service  string `json:"service"`
	Project  string `json:"project,omitempty"`
}

// Provider names the module that answered, and is empty when none holds the machine.
type Report struct {
	Provider  *string `json:"provider"`
	Installed bool    `json:"installed"`
	State     string  `json:"state"`
	Routes    []Route `json:"routes"`
}

func Held(id string) *string {
	return &id
}

func Declared(ctx sys.Context) []registry.Project {
	return registry.Load(ctx, registry.Paths{}).Projects
}

// How long the step waits its turn on the registry: its holders are gone in milliseconds.
const registryWait = 5 * time.Second

// MoveDomain carries every name the projects answer to from the domain the
// machine published so far to the one the module is now told, and answers the
// names that moved. The registry is read and rewritten under the lock every
// session takes for it, so a project added meanwhile is not lost.
func MoveDomain(ctx *modules.Context, to string) ([]string, error) {
	release, err := lock.Hold(ctx.ProjectsLock(), registryWait)
	if errors.Is(err, lock.ErrHeld) {
		return nil, protocol.NewError(contract.ErrorBusy, i18n.T("state.registry.busy")).
			WithFix(i18n.T("state.registry.busy.fix"))
	}
	if err != nil {
		return nil, err
	}
	defer release()

	from, _, err := env.Get(ctx, env.DomainKey)
	if err != nil {
		return nil, err
	}

	paths := registry.Paths{Lock: ctx.ProjectsLock()}

	return registry.Load(ctx, paths).Rehost(ctx, from, to)
}

// MoveRoutes is the step both exposure modules run before storing another domain: a project may not go on answering under the old one.
func MoveRoutes(ctx *modules.Context) error {
	return ctx.Step("move-routes", func() (modules.Outcome, error) {
		moved, err := MoveDomain(ctx, ctx.String("domain"))
		if err != nil {
			return modules.Failed, err
		}

		if len(moved) == 0 {
			return modules.Skipped, nil
		}

		ctx.Logf("%d name(s) moved under %s", len(moved), ctx.String("domain"))

		return modules.Done, nil
	})
}

// Marker is what ModePath holds while provider holds the machine.
func Marker(provider string) []byte {
	return []byte(provider + "\n")
}

// HeldByAnother says the marker names another exposure: the domain and the marker are then that one's, and an uninstall of this one leaves them.
func HeldByAnother(ctx sys.Context, provider string) bool {
	raw, err := file.Read(ctx, ModePath)
	if err != nil {
		return false
	}

	held := strings.TrimSpace(string(raw))

	return held != "" && held != provider
}

// DeclareMode writes the marker root's alone, like everything under /etc/pupitre, and closes one an older agent left readable.
func DeclareMode(ctx *modules.Context, provider string) error {
	return ctx.Step("declare-mode", func() (modules.Outcome, error) {
		if file.SameAt(ctx, ModePath, Marker(provider), 0o600) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(path.Dir(ModePath), 0o700); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, ModePath, Marker(provider), 0o600)
	})
}

// One route per port that carries a name on the web, under the domain the machine publishes; the other ports stay behind the app's SSH session.
func For(domain string, projects []registry.Project) []Route {
	list := []Route{}
	if domain == "" {
		return list
	}

	for _, project := range projects {
		for _, process := range project.Processes {
			for _, route := range process.Routes {
				if route.Hostname == "" || !strings.HasSuffix(route.Hostname, "."+domain) {
					continue
				}

				list = append(list, Route{
					Hostname: route.Hostname,
					Service:  "http://" + process.Host + ":" + strconv.Itoa(route.Port),
					Project:  project.Name,
				})
			}
		}
	}

	return list
}

func State(ctx sys.Context, present bool, unit string) string {
	if !present {
		return StateAbsent
	}

	switch systemd.State(ctx, unit) {
	case contract.ServiceRunning:
		return StateRunning
	case contract.ServiceFailed:
		return StateFailed
	case contract.ServiceStopped:
		return StateStopped
	}

	return StateAbsent
}
