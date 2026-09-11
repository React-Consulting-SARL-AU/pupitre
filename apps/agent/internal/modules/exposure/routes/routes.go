// Package routes holds what every exposure module answers with: the state of its service and the address it gives each project.
package routes

import (
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
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

// One route per port that carries a name on the web, under the domain the machine publishes; the other ports stay behind the app's SSH session.
func For(domain string, projects []registry.Project) []Route {
	list := []Route{}
	if domain == "" {
		return list
	}

	for _, project := range projects {
		for _, route := range project.Routes {
			if route.Hostname == "" || !strings.HasSuffix(route.Hostname, "."+domain) {
				continue
			}

			list = append(list, Route{
				Hostname: route.Hostname,
				Service:  "http://" + project.Host + ":" + strconv.Itoa(route.Port),
				Project:  project.Name,
			})
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
