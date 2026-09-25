package docker

import (
	"encoding/json"
	"maps"
	"net"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
)

const (
	hostBindingOption   = "com.docker.network.bridge.host_binding_ipv4"
	defaultBridgeOption = "com.docker.network.bridge.default_bridge"
	defaultBridgeName   = "bridge"
)

type network struct {
	Name    string            `json:"Name"`
	Options map[string]string `json:"Options"`
}

func (n network) isDefaultBridge() bool {
	return n.Options[defaultBridgeOption] == "true" || n.Name == defaultBridgeName
}

type binding struct {
	HostIP   string `json:"HostIp"`
	HostPort string `json:"HostPort"`
}

type container struct {
	Name       string `json:"Name"`
	HostConfig struct {
		PortBindings map[string][]binding `json:"PortBindings"`
	} `json:"HostConfig"`
	NetworkSettings struct {
		Ports map[string][]binding `json:"Ports"`
	} `json:"NetworkSettings"`
}

// Read from dockerd, not daemon.json: a network keeps its creation options, and an unset binding means 0.0.0.0 and [::].
func openNetworks(ctx *modules.Context) []network {
	var listed []network
	if !inspect(ctx, []string{"docker", "network", "ls", "--quiet", "--filter", "driver=bridge"}, []string{"docker", "network", "inspect"}, &listed) {
		return nil
	}

	var open []network

	for _, candidate := range listed {
		if !loopback(candidate.Options[hostBindingOption]) {
			open = append(open, candidate)
		}
	}

	return open
}

// Only ports published without an address count: one published on 0.0.0.0 explicitly was meant to be open.
func openContainers(ctx *modules.Context) []string {
	var running []container
	if !inspect(ctx, []string{"docker", "ps", "--quiet"}, []string{"docker", "inspect"}, &running) {
		return nil
	}

	var open []string

	for _, candidate := range running {
		if addresses := defaultBound(candidate); len(addresses) > 0 {
			open = append(open, strings.TrimPrefix(candidate.Name, "/")+" ("+strings.Join(addresses, ", ")+")")
		}
	}

	return open
}

func defaultBound(candidate container) []string {
	var addresses []string

	for _, port := range slices.Sorted(maps.Keys(candidate.HostConfig.PortBindings)) {
		asked := slices.ContainsFunc(candidate.HostConfig.PortBindings[port], func(b binding) bool { return b.HostIP == "" })
		if !asked {
			continue
		}

		for _, bound := range candidate.NetworkSettings.Ports[port] {
			if !loopback(bound.HostIP) {
				addresses = append(addresses, net.JoinHostPort(bound.HostIP, bound.HostPort))
			}
		}
	}

	return addresses
}

func inspect(ctx *modules.Context, list, describe []string, into any) bool {
	out, err := ctx.Sys().Run(sys.Command{Argv: list})
	if err != nil {
		return false
	}

	ids := strings.Fields(out.Stdout)
	if len(ids) == 0 {
		return false
	}

	described, err := ctx.Sys().Run(sys.Command{Argv: append(slices.Clone(describe), ids...)})
	if err != nil {
		return false
	}

	return json.Unmarshal([]byte(described.Stdout), into) == nil
}

func loopback(address string) bool {
	ip := net.ParseIP(address)

	return ip != nil && ip.IsLoopback()
}

func publishedWarning(networks []network, containers []string) string {
	var parts []string

	if len(containers) > 0 {
		parts = append(parts, i18n.T("warn.docker.published.containers", strings.Join(containers, " · ")))
	}

	if len(networks) > 0 {
		names := make([]string, 0, len(networks))

		for _, open := range networks {
			names = append(names, open.Name)
		}

		parts = append(parts, i18n.T("warn.docker.published.networks", strings.Join(names, ", ")))
	}

	return strings.Join(append(parts, i18n.T("warn.docker.published.fix")), " ; ")
}
