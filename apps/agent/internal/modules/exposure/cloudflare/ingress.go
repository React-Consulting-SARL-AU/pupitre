package cloudflare

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
)

type Route struct {
	Hostname string `json:"hostname"`
	Service  string `json:"service"`
	Project  string `json:"project,omitempty"`
}

type credentials struct {
	AccountTag   string `json:"AccountTag"`
	TunnelID     string `json:"TunnelID"`
	TunnelSecret string `json:"TunnelSecret"`
}

func (c credentials) encode() []byte {
	content, _ := json.Marshal(c)

	return append(content, '\n')
}

func declared(ctx sys.Context) []registry.Project {
	return registry.Load(ctx, registry.Paths{}).Projects
}

// Only a project that declares a subdomain has a public address; the others stay on their port, behind the app's SSH session.
func routes(domain string, projects []registry.Project) []Route {
	list := []Route{}
	if domain == "" {
		return list
	}

	for _, project := range projects {
		sub := project.Sub()
		if sub == "" {
			continue
		}

		list = append(list, Route{
			Hostname: sub + "." + domain,
			Service:  "http://" + project.Host + ":" + strconv.Itoa(project.Port),
			Project:  project.Name,
		})
	}

	return list
}

// Host rewriting neutralises the allowedHosts check of a dev server without touching a single vite.config.ts.
func ingress(tunnelID, domain string, projects []registry.Project) []byte {
	var out strings.Builder

	fmt.Fprintf(&out, "# Généré par pupitred — source : %s\n", registry.DefaultConf)
	fmt.Fprintf(&out, "tunnel: %s\n", tunnelID)
	fmt.Fprintf(&out, "credentials-file: %s\n", credentialsPath)
	out.WriteString("originRequest:\n  connectTimeout: 30s\ningress:\n")

	for _, route := range routes(domain, projects) {
		origin := strings.TrimPrefix(route.Service, "http://")

		fmt.Fprintf(&out, "  # %s\n", route.Project)
		fmt.Fprintf(&out, "  - hostname: %s\n", route.Hostname)
		fmt.Fprintf(&out, "    service: %s\n", route.Service)
		out.WriteString("    originRequest:\n")
		fmt.Fprintf(&out, "      httpHostHeader: %s\n", origin)
	}

	out.WriteString("  - service: http_status:404\n")

	return []byte(out.String())
}
