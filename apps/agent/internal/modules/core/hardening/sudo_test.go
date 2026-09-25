package hardening

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
)

const (
	passwordHash = "$6$rounds=100000$Wq3vX8zYk1pL0sQe$PrJH1rPtYcXhyW28FJS0rQ7sq5jLB9mY/GZ8GL1MQMXesQF1UBBe.X8g.Z1cutPJzEeignRlhLB1GHAcUHivm."
	lockedShadow = "root:*:20000:0:99999:7:::\ndev:!:20000:0:99999:7:::\n"
)

func securedMachine(t *testing.T) *modtest.FakeSys {
	t.Helper()

	fake := hardenedMachine(t)
	if result := Harden(newContext(t, fake, Options{})); !result.RootClosed {
		t.Fatalf("harden: %+v", result)
	}

	fake.Files[sudo.Binary] = []byte("pupitred")
	fake.Modes[sudo.Binary] = 0o755
	fake.Files[sudo.Path] = []byte(sudo.Open)
	fake.Modes[sudo.Path] = 0o440
	fake.Files[shadowPath] = []byte(lockedShadow)

	return fake
}

func setPassword(t *testing.T, fake *modtest.FakeSys, hash string) (SudoResult, []string, error) {
	t.Helper()

	ctx := newContext(t, fake, Options{})
	result, err := SetSudoPassword(ctx, "dev", hash)

	var steps []string

	for _, event := range ctx.Events() {
		steps = append(steps, event.Step+"="+string(event.Status))
	}

	if strings.Contains(strings.Join(ctx.Output(), "\n"), hash) {
		t.Fatal("the hash reached the journal")
	}

	return result, steps, err
}

func TestSudoPasswordIsSetBeforeTheRuleIsRestricted(t *testing.T) {
	fake := securedMachine(t)

	result, steps, err := setPassword(t, fake, passwordHash)
	if err != nil {
		t.Fatal(err)
	}

	if err := contract.ValidateValue("HardenSudoResult", result); err != nil || result.Sudo != contract.SudoPassword {
		t.Fatalf("result = %+v, %v", result, err)
	}

	if want := "check-sshd-passwords=ok check-agent-binary=ok set-password=ok restrict-sudo=ok"; strings.Join(steps, " ") != want {
		t.Fatalf("steps = %v", steps)
	}

	if string(fake.Files[sudo.Path]) != sudo.Restricted || fake.Modes[sudo.Path] != 0o440 {
		t.Fatalf("sudoers = %q (%o)", fake.Files[sudo.Path], fake.Modes[sudo.Path])
	}

	chpasswd := slices.IndexFunc(fake.Calls, func(cmd sys.Command) bool { return cmd.Argv[0] == "chpasswd" })
	visudo := slices.IndexFunc(fake.Calls, func(cmd sys.Command) bool { return cmd.Argv[0] == "visudo" })
	if chpasswd < 0 || visudo < chpasswd {
		t.Fatalf("chpasswd at %d, visudo at %d:\n%s", chpasswd, visudo, strings.Join(fake.Commands(), "\n"))
	}

	if got := fake.Calls[chpasswd]; strings.Join(got.Argv, " ") != "chpasswd -e" || string(got.Stdin) != "dev:"+passwordHash+"\n" {
		t.Fatalf("chpasswd = %v with %q", got.Argv, got.Stdin)
	}

	if got := fake.Calls[visudo].Argv; strings.Join(got, " ") != "visudo -c -f "+sudoCandidatePath {
		t.Fatalf("visudo = %v", got)
	}

	if _, left := fake.Files[sudoCandidatePath]; left {
		t.Fatal("the candidate rule stayed in sudoers.d")
	}
}

func TestSudoPasswordReplayedChangesNothing(t *testing.T) {
	fake := securedMachine(t)
	if _, _, err := setPassword(t, fake, passwordHash); err != nil {
		t.Fatal(err)
	}

	fake.Files[shadowPath] = []byte("root:*:20000:0:99999:7:::\ndev:" + passwordHash + ":20000:0:99999:7:::\n")

	mutations := len(fake.Mutations)
	_, steps, err := setPassword(t, fake, passwordHash)
	if err != nil {
		t.Fatal(err)
	}

	if want := "check-sshd-passwords=ok check-agent-binary=ok set-password=skip restrict-sudo=skip"; strings.Join(steps, " ") != want {
		t.Fatalf("steps = %v", steps)
	}

	if len(fake.Mutations) != mutations {
		t.Fatalf("replay wrote: %v", fake.Mutations[mutations:])
	}
}

func TestSudoPasswordCanBeReplaced(t *testing.T) {
	fake := securedMachine(t)
	fake.Files[sudo.Path] = []byte(sudo.Restricted)
	fake.Files[shadowPath] = []byte("dev:$6$old$" + strings.Repeat("a", 86) + ":20000:0:99999:7:::\n")

	_, steps, err := setPassword(t, fake, passwordHash)
	if err != nil {
		t.Fatal(err)
	}

	if want := "check-sshd-passwords=ok check-agent-binary=ok set-password=ok restrict-sudo=skip"; strings.Join(steps, " ") != want {
		t.Fatalf("steps = %v", steps)
	}
}

func TestSudoPasswordRefusedWhileSSHTakesPasswords(t *testing.T) {
	fake := securedMachine(t)
	delete(fake.Files, FragmentPath)
	mutations := len(fake.Mutations)

	_, _, err := setPassword(t, fake, passwordHash)

	var refusal *protocol.Error
	if !errors.As(err, &refusal) || refusal.Code != contract.ErrorBadRequest || !strings.Contains(refusal.Message, "password") {
		t.Fatalf("err = %v", err)
	}

	if len(fake.Mutations) != mutations || string(fake.Files[sudo.Path]) != sudo.Open {
		t.Fatalf("a refusal touched the machine: %v", fake.Mutations[mutations:])
	}
}

func TestSudoPasswordRefusedWhenDevCouldReplaceTheAgent(t *testing.T) {
	cases := map[string]func(fake *modtest.FakeSys){
		"binary owned by dev":   func(fake *modtest.FakeSys) { fake.Owners[sudo.Binary] = "dev:dev" },
		"binary writable":       func(fake *modtest.FakeSys) { fake.Modes[sudo.Binary] = 0o777 },
		"folder writable":       func(fake *modtest.FakeSys) { fake.Modes["/usr/local/bin"] = 0o777 },
		"folder owned by dev":   func(fake *modtest.FakeSys) { fake.Owners["/usr/local"] = "dev:dev" },
		"binary is a link":      func(fake *modtest.FakeSys) { fake.Links[sudo.Binary] = "/home/dev/pupitred" },
		"binary missing":        func(fake *modtest.FakeSys) { delete(fake.Files, sudo.Binary) },
		"group may write in it": func(fake *modtest.FakeSys) { fake.Modes[sudo.Binary] = 0o775 },
	}

	for name, spoil := range cases {
		t.Run(name, func(t *testing.T) {
			fake := securedMachine(t)
			spoil(fake)
			mutations := len(fake.Mutations)

			_, _, err := setPassword(t, fake, passwordHash)

			var refusal *protocol.Error
			if !errors.As(err, &refusal) || refusal.Code != contract.ErrorInternal {
				t.Fatalf("err = %v", err)
			}

			if len(fake.Mutations) != mutations {
				t.Fatalf("a refusal touched the machine: %v", fake.Mutations[mutations:])
			}
		})
	}
}

func TestSudoRuleRefusedByVisudoStaysOut(t *testing.T) {
	fake := securedMachine(t)
	fake.Failures["visudo"] = "parse error in /etc/sudoers.d/.90-dev.pupitre near line 1"

	_, steps, err := setPassword(t, fake, passwordHash)
	if err == nil {
		t.Fatal("a rule visudo refuses was installed")
	}

	if string(fake.Files[sudo.Path]) != sudo.Open {
		t.Fatalf("sudoers = %q", fake.Files[sudo.Path])
	}

	if _, left := fake.Files[sudoCandidatePath]; left {
		t.Fatal("the refused candidate stayed in sudoers.d")
	}

	if !slices.Contains(steps, "restrict-sudo=fail") {
		t.Fatalf("steps = %v", steps)
	}
}

func TestTheSecretLineCarriesACryptHashAndNothingElse(t *testing.T) {
	hash, refusal := sudoPasswordHash([]byte(`{"password_hash":"` + passwordHash + `"}`))
	if refusal != nil || hash != passwordHash {
		t.Fatalf("hash = %q, refusal = %v", hash, refusal)
	}

	for _, line := range []string{
		`{"password_hash":"k7mp-q2xw-9hdt-3vzc-u8fa-6rne"}`,
		`{"password_hash":"` + passwordHash + `\nroot:$6$x$` + strings.Repeat("a", 86) + `"}`,
		`{"password_hash":"` + passwordHash + `:0:0"}`,
		`{"password_hash":"` + passwordHash + `","user":"root"}`,
		`{}`,
		`not json`,
	} {
		_, refusal := sudoPasswordHash([]byte(line))
		if refusal == nil || refusal.Code != contract.ErrorBadRequest {
			t.Errorf("%s: refusal = %v", line, refusal)

			continue
		}

		if strings.Contains(refusal.Message+refusal.Fix, "k7mp") || strings.Contains(refusal.Message+refusal.Fix, "PrJH1") {
			t.Errorf("the refusal repeats the value: %s", refusal.Message)
		}
	}
}

func TestAFailedPasswordLeavesTheRuleOpen(t *testing.T) {
	fake := securedMachine(t)
	fake.Failures["chpasswd"] = "chpasswd: (user dev) pam_chauthtok() failed"

	_, _, err := setPassword(t, fake, passwordHash)
	if err == nil {
		t.Fatal("chpasswd failed and the command went on")
	}

	if string(fake.Files[sudo.Path]) != sudo.Open {
		t.Fatalf("the rule was restricted without a password: %q", fake.Files[sudo.Path])
	}
}
