package cloudflare

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Unit = "cloudflared"

	pkg        = "cloudflared"
	tunnelName = "pupitre"
	comment    = "pupitre"

	keyURL      = "https://pkg.cloudflare.com/cloudflare-main.gpg"
	keyringPath = "/usr/share/keyrings/cloudflare-main.gpg"
	keyTempPath = "/tmp/pupitre-cloudflare.gpg"
	sourcePath  = "/etc/apt/sources.list.d/cloudflared.list"
	sourceLine  = "deb [signed-by=" + keyringPath + "] https://pkg.cloudflare.com/cloudflared any main\n"

	configDir       = "/etc/cloudflared"
	configPath      = configDir + "/config.yml"
	credentialsPath = configDir + "/" + tunnelName + ".json"
	unitPath        = "/etc/systemd/system/" + Unit + ".service"

	tokenKey = "CLOUDFLARE_API_TOKEN"
)

var unit = []byte(`[Unit]
Description=Cloudflare Tunnel (Pupitre)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate --config ` + configPath + ` tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{
		Installed:  true,
		Version:    version,
		Configured: file.Exists(ctx, configPath) && file.Exists(ctx, credentialsPath),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-cloudflared", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		if err := addRepository(ctx); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func addRepository(ctx *modules.Context) error {
	if !file.Exists(ctx, keyringPath) {
		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", keyTempPath, keyURL}}); err != nil {
			return err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"gpg", "--batch", "--yes", "--dearmor", "-o", keyringPath, keyTempPath}}); err != nil {
			return err
		}

		if _, err := file.Remove(ctx, keyTempPath); err != nil {
			return err
		}
	}

	if !file.Same(ctx, sourcePath, []byte(sourceLine)) {
		if err := file.WriteAtomic(ctx, sourcePath, []byte(sourceLine), 0o644); err != nil {
			return err
		}
	}

	return apt.Refresh(ctx)
}

// The token, the account and the zone come from the app: without them there is nothing to configure, and the module says so instead of leaving half a tunnel.
func (m Module) Configure(ctx *modules.Context) error {
	if err := ctx.RequireFields(); err != nil {
		return err
	}

	id, err := tunnel(ctx)
	if err != nil {
		return err
	}

	changed, err := writeIngress(ctx, id)
	if err != nil {
		return err
	}

	if err := storeDomain(ctx); err != nil {
		return err
	}

	if err := service(ctx, changed); err != nil {
		return err
	}

	return syncRecords(ctx, id)
}

func tunnel(ctx *modules.Context) (string, error) {
	id := recorded(ctx).TunnelID

	err := ctx.Step("create-tunnel", func() (modules.Outcome, error) {
		if id != "" {
			return modules.Skipped, nil
		}

		created, err := create(ctx)
		if err != nil {
			return modules.Failed, err
		}

		id = created

		return modules.Done, nil
	})

	return id, err
}

// A tunnel that survived a reinstall of the server is unusable: its secret lived on the old machine, so we delete it and start clean.
func create(ctx *modules.Context) (string, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", err
	}
	encoded := base64.StdEncoding.EncodeToString(secret)

	client := clientOf(ctx)

	id, err := client.createTunnel(tunnelName, encoded)
	if err != nil {
		orphan := client.findTunnel(tunnelName)
		if orphan == "" {
			return "", err
		}

		ctx.Logf("tunnel %s orphelin (%s), suppression", tunnelName, orphan)
		if removeErr := client.deleteTunnel(orphan); removeErr != nil {
			return "", err
		}

		if id, err = client.createTunnel(tunnelName, encoded); err != nil {
			return "", err
		}
	}

	content := credentials{AccountTag: ctx.String("account_id"), TunnelID: id, TunnelSecret: encoded}.encode()
	if err := ctx.Sys().MkdirAll(configDir, 0o755); err != nil {
		return "", err
	}

	return id, file.WriteAtomic(ctx, credentialsPath, content, 0o600)
}

func writeIngress(ctx *modules.Context, id string) (bool, error) {
	changed := false

	err := ctx.Step("write-ingress", func() (modules.Outcome, error) {
		content := ingress(id, ctx.String("domain"), declared(ctx))
		if file.Same(ctx, configPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(configDir, 0o755); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, configPath, content, 0o644)
	})

	return changed, err
}

func storeDomain(ctx *modules.Context) error {
	return ctx.Step("store-domain", func() (modules.Outcome, error) {
		stored := false

		for key, value := range map[string]string{env.DomainKey: ctx.String("domain"), tokenKey: ctx.Secret("api_token")} {
			changed, err := env.Set(ctx, key, value)
			if err != nil {
				return modules.Failed, err
			}

			stored = stored || changed
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func service(ctx *modules.Context, ingressChanged bool) error {
	written := false

	if err := ctx.Step("write-service", func() (modules.Outcome, error) {
		if file.Same(ctx, unitPath, unit) {
			return modules.Skipped, nil
		}

		written = true

		return modules.Done, systemd.WriteUnit(ctx, Unit, unit)
	}); err != nil {
		return err
	}

	return ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, Unit) && !written && !ingressChanged {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, Unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, Unit)
	})
}

func syncRecords(ctx *modules.Context, id string) error {
	return ctx.Step("sync-dns", func() (modules.Outcome, error) {
		client := clientOf(ctx)
		target := id + ".cfargotunnel.com"
		touched, failed := 0, 0

		for _, route := range routes(ctx.String("domain"), declared(ctx)) {
			existing, err := client.findRecord(route.Hostname)
			if err != nil {
				failed++
				continue
			}

			switch {
			case existing.Content == target:
			case existing.ID != "":
				if err := client.updateRecord(existing.ID, target); err != nil {
					failed++
					continue
				}
				touched++
			default:
				if err := client.createRecord(route.Hostname, target); err != nil {
					failed++
					continue
				}
				touched++
			}
		}

		if failed > 0 {
			ctx.Warn(fmt.Sprintf("%d enregistrement(s) DNS refusé(s) par Cloudflare : vérifie les droits DNS du jeton sur la zone %s", failed, ctx.String("zone_name")))
		}

		if touched == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-cloudflared", func() (modules.Outcome, error) {
		upgraded, err := apt.Upgrade(ctx, pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The tunnel and its records live on the Cloudflare account, which belongs to the client: uninstalling gives back the machine, never the account.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !file.Exists(ctx, unitPath) {
			return modules.Skipped, nil
		}

		if err := systemd.Disable(ctx, Unit); err != nil {
			return modules.Failed, err
		}

		removed, err := file.Remove(ctx, unitPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		cleared := false

		for _, path := range []string{configPath, credentialsPath, sourcePath} {
			removed, err := file.Remove(ctx, path)
			if err != nil {
				return modules.Failed, err
			}

			cleared = cleared || removed
		}

		if !cleared {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-cloudflared", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	return ctx.Step("forget-domain", func() (modules.Outcome, error) {
		forgotten := false

		for _, key := range []string{env.DomainKey, tokenKey} {
			removed, err := env.Unset(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			forgotten = forgotten || removed
		}

		if !forgotten {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, Unit)
	status.Unit = Unit
	status.Credentials = map[string]string{"Jeton d'API": tokenKey, "Domaine": env.DomainKey}

	return status, nil
}

func recorded(ctx *modules.Context) credentials {
	raw, err := file.Read(ctx, credentialsPath)
	if err != nil {
		return credentials{}
	}

	var found credentials
	if err := json.Unmarshal(raw, &found); err != nil {
		return credentials{}
	}

	return found
}

// A command runs long after the install: the token comes from the remembered values, or from /etc/pupitre/env where the configuration left it.
func clientOf(ctx *modules.Context) api {
	bearer := ctx.Secret("api_token")
	if bearer == "" {
		bearer, _, _ = env.Get(ctx, tokenKey)
	}

	return api{ctx: ctx, token: bearer, account: ctx.String("account_id"), zone: ctx.String("zone_id")}
}
