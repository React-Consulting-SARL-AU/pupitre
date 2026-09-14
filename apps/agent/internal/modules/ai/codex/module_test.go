package codex

import (
	"encoding/base64"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/ai/agents"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/modules/runtime/mise"
)

func newContext(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	return modtest.NewContext(t, fake, modtest.Options{Manifest: manifest()})
}

func install(t *testing.T, fake *modtest.FakeSys) *modules.Context {
	t.Helper()

	ctx := newContext(t, fake)

	if err := (Module{}).Install(ctx); err != nil {
		t.Fatal(err)
	}
	if err := (Module{}).Configure(ctx); err != nil {
		t.Fatal(err)
	}

	for _, event := range ctx.Events() {
		if event.Status == contract.StepFail {
			t.Fatalf("step %s failed", event.Step)
		}
	}

	return ctx
}

func TestFirstInstallLaysDownTheCliTheContextAndTheSkills(t *testing.T) {
	fake := modtest.NewFakeSys()

	install(t, fake)

	if fake.Tools[tool] == "" {
		t.Fatalf("the CLI must be installed by mise: %v", fake.Tools)
	}

	context := string(fake.Files[configDir+"/AGENTS.md"])
	if !strings.Contains(context, agents.ProjectsDir) || !strings.Contains(context, agents.SkillsDir) {
		t.Fatalf("the machine context must name the folders:\n%s", context)
	}

	for _, path := range []string{
		agents.SkillsDir + "/capture/SKILL.md",
		agents.SkillsDir + "/ship/SKILL.md",
		configDir + "/skills/capture/SKILL.md",
	} {
		if len(fake.Files[path]) == 0 {
			t.Errorf("%s was not laid down", path)
		}
	}

	status, err := (Module{}).Status(newContext(t, fake))
	if err != nil {
		t.Fatal(err)
	}

	if !status.Installed || !status.Configured {
		t.Fatalf("status = %+v", status)
	}
}

func TestReplayMutatesNothing(t *testing.T) {
	fake := modtest.NewFakeSys()
	install(t, fake)

	fake.Mutations = nil
	ctx := install(t, fake)

	if len(fake.Mutations) != 0 {
		t.Fatalf("a replay must not touch the machine:\n  %s", strings.Join(fake.Mutations, "\n  "))
	}

	for _, event := range ctx.Events() {
		if event.Status != contract.StepSkip {
			t.Errorf("step %s: want skip, got %s", event.Step, event.Status)
		}
	}
}

func TestFailedInstallCarriesItsReplayCommand(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Files[mise.Path] = []byte("mise")
	fake.FailProgram("mise", "mise: npm backend unavailable")

	err := (Module{}).Install(newContext(t, fake))
	if err == nil {
		t.Fatal("expected the install to fail")
	}

	var step *modules.StepError
	if !asStepError(err, &step) || step.Replay != "sudo pupitred install --only="+ID {
		t.Fatalf("unexpected error: %#v", err)
	}
}

func asStepError(err error, target **modules.StepError) bool {
	step, ok := err.(*modules.StepError)
	if ok {
		*target = step
	}

	return ok
}

var _ modules.Module = Module{}

// A JWT whose payload carries an email, as the ChatGPT sign-in leaves one in auth.json; the signature is nothing here.
func identityToken(t *testing.T, email string) string {
	t.Helper()

	payload := base64.RawURLEncoding.EncodeToString([]byte(`{"email":"` + email + `","sub":"user"}`))

	return "eyJhbGciOiJSUzI1NiJ9." + payload + ".signature"
}

// codex login status says whether it holds a session; the account comes from the identity token the sign-in left, or from nowhere.
func TestLoginReadsWhatCodexLoginStatusSays(t *testing.T) {
	cases := map[string]struct {
		answer  string
		refused bool
		auth    string
		want    contract.Login
	}{
		"signed in with ChatGPT": {
			answer: "Logged in using ChatGPT\n",
			auth:   `{"auth_mode":"chatgpt","tokens":{"id_token":"` + identityToken(t, "jordan@example.org") + `","access_token":"x"}}`,
			want:   contract.Login{State: contract.LoginSignedIn, Account: "jordan@example.org"},
		},
		"signed in with an API key": {
			answer: "Logged in using API key\n",
			auth:   `{"auth_mode":"apikey","OPENAI_API_KEY":"sk-test"}`,
			want:   contract.Login{State: contract.LoginSignedIn},
		},
		"nobody": {
			answer:  "Not logged in\n",
			refused: true,
			want:    contract.Login{State: contract.LoginSignedOut, Fix: "Open a terminal on this server and run codex login --device-auth: the code it prints goes on the page it names."},
		},
		"no answer": {
			answer:  "",
			refused: true,
			want:    contract.Login{State: contract.LoginUnknown, Fix: "Codex did not answer its own check: read this service again in a moment, or run codex login status in a terminal on this server."},
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			fake := modtest.NewFakeSys()
			if tc.auth != "" {
				fake.Files[authPath] = []byte(tc.auth)
			}
			if tc.refused {
				fake.Refuse("codex login status", tc.answer)
			} else {
				fake.Answer("codex login status", tc.answer)
			}

			got, asked := (Module{}).Login(newContext(t, fake))
			if !asked || got != tc.want {
				t.Fatalf("login = %+v (%v), want %+v", got, asked, tc.want)
			}

			for _, line := range fake.Commands() {
				if strings.Contains(line, "sk-test") || strings.Contains(line, "eyJ") {
					t.Fatalf("a credential reached a command line: %s", line)
				}
			}
		})
	}
}
