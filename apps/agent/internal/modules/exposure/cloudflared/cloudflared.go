// Package cloudflared holds the daemon the Cloudflare exposure drives: its unit, its credentials, and the ingress it reads.
package cloudflared

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/registry"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Unit = "cloudflared"
	Pkg  = "cloudflared"

	ConfigDir       = "/etc/cloudflared"
	ConfigPath      = ConfigDir + "/config.yml"
	CredentialsPath = ConfigDir + "/pupitre.json"
	UnitPath        = "/etc/systemd/system/" + Unit + ".service"
	SourcePath      = "/etc/apt/sources.list.d/cloudflared.list"

	KeyringPath = "/usr/share/keyrings/cloudflare-main.gpg"
	SourceLine  = "deb [signed-by=" + KeyringPath + "] https://pkg.cloudflare.com/cloudflared any main\n"

	keyURL = "https://pkg.cloudflare.com/cloudflare-main.gpg"
)

// How long systemd waits for the tunnel to carry something, in seconds.
//
// cloudflared answers a notify unit only once a connection is registered, and a
// tunnel Cloudflare was told about seconds earlier is refused by the edge until
// it has been propagated — a minute, sometimes more. The old forty-five seconds
// killed the daemon in the middle of that wait, at the very moment its retries
// were backing off, and left the install judging a tunnel that was about to
// work. This is shorter than the three minutes the agent gives systemctl, so
// the unit's own verdict is what ends the wait rather than a clock that beat it.
const startSeconds = 150

var UnitFile = []byte(`[Unit]
Description=Cloudflare Tunnel (Pupitre)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate --config ` + ConfigPath + ` tunnel run
Restart=always
RestartSec=5
TimeoutStartSec=` + strconv.Itoa(startSeconds) + `

[Install]
WantedBy=multi-user.target
`)

type Credentials struct {
	AccountTag   string `json:"AccountTag"`
	TunnelID     string `json:"TunnelID"`
	TunnelSecret string `json:"TunnelSecret"`
}

func (c Credentials) Encode() []byte {
	content, _ := json.Marshal(c)

	return append(content, '\n')
}

func Recorded(ctx *modules.Context) Credentials {
	raw, err := file.Read(ctx, CredentialsPath)
	if err != nil {
		return Credentials{}
	}

	var found Credentials
	if err := json.Unmarshal(raw, &found); err != nil {
		return Credentials{}
	}

	return found
}

// What cloudflared answers when the credentials name a tunnel the account no longer holds.
const unknownTunnel = "Tunnel not found"

// What it says the moment the tunnel carries a connection.
const registered = "Registered tunnel connection"

// A retry cycle of cloudflared runs to about a dozen lines; three of them hold
// the answer whatever the connection was doing when the verification asked.
const verifiedLines = 60

// What the daemon last said, for a wait that ended on nothing else.
const keptSaidLines = 2

// StartFailure turns a unit that would not come up into a sentence naming the
// cause. systemctl only says the job failed; the daemon's own journal says why,
// and the one cause the client can act on is a tunnel that no longer exists.
func StartFailure(ctx *modules.Context, err error) error {
	said := systemd.Diagnose(ctx, Unit)

	if strings.Contains(said, unknownTunnel) {
		return errors.New(i18n.T("modules.cloudflared.start_failed", err.Error(), i18n.T("cloudflared.tunnel.unknown")))
	}

	if said == "" {
		return err
	}

	return errors.New(i18n.T("modules.cloudflared.start_failed", err.Error(), said))
}

// Registered refuses the one verdict the machine gives for certain: a tunnel
// whose credentials name something the account no longer holds. cloudflared
// says that on its first attempts and repeats it at every retry.
//
// A unit systemd calls active has already answered the question: this one
// notifies its start only once a connection is registered, so an active unit is
// a tunnel the edge took, whatever it said of it while it was being propagated.
// Only a daemon that never got there is judged on its words.
func Registered(ctx *modules.Context) error {
	if systemd.Active(ctx, Unit) {
		return nil
	}

	said := systemd.Recent(ctx, Unit, verifiedLines)

	refused := strings.LastIndex(said, unknownTunnel)
	if refused < 0 {
		return nil
	}

	// A tunnel that carried a connection after the refusal is a tunnel that
	// exists: the first attempts on a freshly made one can reach an edge that
	// has not been told about it yet. Only a refusal nothing answered is a
	// verdict, and the journal is in the order the daemon spoke.
	if strings.LastIndex(said, registered) > refused {
		return nil
	}

	return errors.New(i18n.T("cloudflared.tunnel.unknown"))
}

// Serving says whether the tunnel carries anything yet, and what the daemon
// last said if it does not.
//
// cloudflared answers systemd that it started before it has registered, so a
// unit that came up proves nothing on its own; a tunnel that opened a
// connection says so in its journal. Neither is a verdict on the install: a
// machine on a slow link reaches the same place ten seconds later, and failing
// the step for that would refuse an installation that worked.
func Serving(ctx *modules.Context) (bool, string) {
	said := systemd.Recent(ctx, Unit, verifiedLines)

	if strings.Contains(said, registered) || systemd.Active(ctx, Unit) {
		return true, ""
	}

	return false, lastSaid(said)
}

func lastSaid(said string) string {
	lines := strings.Split(said, " / ")

	if len(lines) > keptSaidLines {
		lines = lines[len(lines)-keptSaidLines:]
	}

	return strings.Join(lines, " / ")
}

func Installed(ctx *modules.Context) bool {
	return apt.Installed(ctx, Pkg)
}

func Version(ctx *modules.Context) (string, error) {
	return apt.Version(ctx, Pkg)
}

func Install(ctx *modules.Context) error {
	if err := addRepository(ctx); err != nil {
		return err
	}

	return apt.Install(ctx, Pkg)
}

func addRepository(ctx *modules.Context) error {
	if !file.Exists(ctx, KeyringPath) {
		if err := apt.DearmorKey(ctx, keyURL, KeyringPath); err != nil {
			return err
		}
	}

	if !file.Same(ctx, SourcePath, []byte(SourceLine)) {
		if err := file.WriteAtomic(ctx, SourcePath, []byte(SourceLine), 0o644); err != nil {
			return err
		}
	}

	return apt.RefreshAdded(ctx, SourcePath, KeyringPath)
}

func WriteCredentials(ctx *modules.Context, content Credentials) error {
	if err := ctx.Sys().MkdirAll(ConfigDir, 0o755); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, CredentialsPath, content.Encode(), 0o600)
}

// Host rewriting neutralises the allowedHosts check of a dev server without touching a single vite.config.ts.
func Ingress(tunnelID, domain string, projects []registry.Project) []byte {
	var out strings.Builder

	fmt.Fprintf(&out, "# Generated by pupitred — source: %s\n", registry.DefaultConf)
	fmt.Fprintf(&out, "tunnel: %s\n", tunnelID)
	fmt.Fprintf(&out, "credentials-file: %s\n", CredentialsPath)
	out.WriteString("originRequest:\n  connectTimeout: 30s\ningress:\n")

	for _, route := range routes.For(domain, projects) {
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

func Declared(ctx sys.Context) []registry.Project {
	return routes.Declared(ctx)
}
