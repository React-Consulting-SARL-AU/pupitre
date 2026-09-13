package catalog_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	_ "pupitre.studio/agent/internal/modules/ai"
	_ "pupitre.studio/agent/internal/modules/core"
	_ "pupitre.studio/agent/internal/modules/db"
	"pupitre.studio/agent/internal/modules/download"
	_ "pupitre.studio/agent/internal/modules/editor"
	_ "pupitre.studio/agent/internal/modules/exposure"
	"pupitre.studio/agent/internal/modules/modtest"
	_ "pupitre.studio/agent/internal/modules/runtime"
	_ "pupitre.studio/agent/internal/modules/tool"
)

/*
What this file proves: the catalogue holds the rule that makes it usable twice.
A module installed then reinstalled on the same machine no longer touches it —
every step turns to `skip` — because that is exactly what the app does when it
adds a service to a server already running, when it replays a failed module, or
when it resumes an interrupted installation.

The fake machine is not a machine: it has no service to query, no archive to
extract, no API to reach. Modules that read their state through one of those
three means cannot be played here — their second pass would find a machine that
retained nothing — and the staging tests, against a real VPS, are what cover
them. Each is named below with what it lacks, never dropped in silence.
*/

const secret = "s3cret-de-test"

var elsewhere = map[string]string{
	"ai.hermes":           "its providers are a list of secrets that only the form composes",
	"db.mysql":            "its accounts are read by querying mysql",
	"db.postgres":         "its roles and extensions are read by querying postgres",
	"db.redis":            "its password is checked by opening a redis session",
	"editor.jetbrains":    "its version is read from the JetBrains download index",
	"editor.vscode":       "its command appears by extracting the downloaded archive",
	"editor.zed":          "its version is read from the downloaded archive",
	"exposure.caddy":      "its rules can only be read from an active ufw",
	"exposure.cloudflare": "its tunnel is created through the Cloudflare API",
	"runtime.docker":      "its group is read from the dev user core.system creates",
	"tool.1password":      "its service account is checked against 1Password",
	"tool.github":         "its key is born of ssh-keygen and registered with GitHub",
}

// A module that reads a release index answers it here, as the network would.
var served = map[string]func(fake *modtest.FakeSys){
	"ai.claude": func(fake *modtest.FakeSys) {
		checksum := modtest.Digest(modtest.Downloaded)
		fake.Answer("claude-code-releases/latest", "2.1.263\n")
		fake.Answer("/2.1.263/manifest.json", `{"platforms":{"linux-x64":{"checksum":"`+checksum+`"},"linux-arm64":{"checksum":"`+checksum+`"}}}`)
	},
	"ai.cursor": func(fake *modtest.FakeSys) {
		fake.Answer("cursor.com/install", "DOWNLOAD_URL=\"https://downloads.cursor.com/lab/2026.09.10-fd3934a/${OS}/${ARCH}/agent-cli-package.tar.gz\"\n")
		fake.Archives[download.Dir+"/cursor-agent-2026.09.10-fd3934a.tar.gz"] = []string{"cursor-agent", "node", "index.js"}
	},
	"ai.opencode": func(fake *modtest.FakeSys) {
		checksum := modtest.Digest(modtest.Downloaded)
		assets := ""
		for _, name := range []string{"opencode-linux-x64.tar.gz", "opencode-linux-x64-baseline.tar.gz", "opencode-linux-arm64.tar.gz"} {
			assets += `{"name":"` + name + `","digest":"sha256:` + checksum + `","browser_download_url":"https://github.com/anomalyco/opencode/releases/download/v1.18.30/` + name + `"},`
		}
		fake.Files["/proc/cpuinfo"] = []byte("flags : avx2\n")
		fake.Answer("releases/latest", `{"tag_name":"v1.18.30","assets":[`+strings.TrimSuffix(assets, ",")+`]}`)
		fake.Archives[download.Dir+"/opencode-1.18.30.tar.gz"] = []string{"opencode"}
	},
}

// answers fills in what the form would have: the manifest defaults, plus a value for whatever it declares required.
func answers(manifest contract.Manifest) (modtest.Values, modtest.Secrets) {
	values := modtest.Values{}
	secrets := modtest.Secrets{}

	for _, field := range manifest.Fields {
		switch field.Kind {
		case contract.FieldSecret:
			secrets[field.Key] = secret
		case contract.FieldBoolean:
			values[field.Key] = field.Default
		default:
			if field.Default != nil {
				values[field.Key] = field.Default
			} else if field.Required {
				values[field.Key] = placeholder(field.Key)
			}
		}
	}

	return values, secrets
}

func placeholder(key string) string {
	switch key {
	case "git_email":
		return "jordan@example.org"
	case "domain":
		return "exemple.pupitre.sh"
	default:
		return "pupitre"
	}
}

func pass(t *testing.T, module modules.Module, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	manifest := module.Manifest()
	values, secrets := answers(manifest)
	ctx := modtest.NewContext(t, fake, modtest.Options{Manifest: manifest, Secrets: secrets, Values: values})

	if err := module.Install(ctx); err != nil {
		t.Fatalf("%s : install = %v", manifest.ID, err)
	}

	if err := module.Configure(ctx); err != nil {
		t.Fatalf("%s : configure = %v", manifest.ID, err)
	}

	return ctx
}

func TestASecondInstallLeavesTheMachineAlone(t *testing.T) {
	for _, module := range modules.Default().All() {
		id := module.Manifest().ID

		if _, staged := elsewhere[id]; staged {
			continue
		}

		t.Run(id, func(t *testing.T) {
			fake := modtest.NewFakeSys()
			if serve, listed := served[id]; listed {
				serve(fake)
			}

			pass(t, module, fake)

			written := len(fake.Mutations)
			again := pass(t, module, fake)

			for _, event := range again.Events() {
				if event.Status != contract.StepSkip {
					t.Errorf("step %s: %s on the second pass, want skip", event.Step, event.Status)
				}
			}

			if len(fake.Mutations) != written {
				t.Errorf("second pass: %v", fake.Mutations[written:])
			}
		})
	}
}

// TestNothingIsSkippedWithoutAReason: a module excluded elsewhere that becomes runnable here must come back into this list — it names what the fake machine is missing, not what we tolerate.
func TestNothingIsSkippedWithoutAReason(t *testing.T) {
	known := map[string]bool{}
	for _, module := range modules.Default().All() {
		known[module.Manifest().ID] = true
	}

	for id, reason := range elsewhere {
		if !known[id] {
			t.Errorf("%s is no longer in the catalogue: remove it from the list", id)
		}

		if reason == "" {
			t.Errorf("%s is dropped without a reason", id)
		}
	}
}
