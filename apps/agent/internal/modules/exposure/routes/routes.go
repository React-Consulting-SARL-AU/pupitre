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

const ModePath = "/etc/pupitre/exposure"

type Route struct {
	Hostname string `json:"hostname"`
	Service  string `json:"service"`
	Project  string `json:"project,omitempty"`
}

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

// Registry holders release it within milliseconds.
const registryWait = 5 * time.Second

// Rewrites the registry under the sessions' projects lock, so a project added meanwhile is not lost.
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

// Must run before the new domain is stored: MoveDomain reads the old one from the environment file.
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

func Marker(provider string) []byte {
	return []byte(provider + "\n")
}

func HeldByAnother(ctx sys.Context, provider string) bool {
	raw, err := file.Read(ctx, ModePath)
	if err != nil {
		return false
	}

	held := strings.TrimSpace(string(raw))

	return held != "" && held != provider
}

// SameAt also compares the mode, so a marker an older agent left readable is closed.
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
