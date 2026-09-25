package state_test

import (
	"strings"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
)

func TestADiagCarriesNoSecretACommandLineHeld(t *testing.T) {
	fake, reader := sessionFixture(t)
	fake.Spawn(modtest.Proc{PID: 5900, PPID: 1, RSS: 100 * 1024, Etimes: 5, CPU: 1, Args: "/home/dev/.local/bin/claude --api-key sk-ant-one --token=tok-two OPENAI_API_KEY=sk-three DATABASE_URL=postgres://app:pw-four@localhost/shop --header Authorization: Bearer tok-five --resume"})

	report := reader.Diag().Report

	for _, secret := range []string{"sk-ant-one", "tok-two", "sk-three", "pw-four", "tok-five"} {
		if strings.Contains(report, secret) {
			t.Errorf("%s reached the diag:\n%s", secret, report)
		}
	}

	for _, kept := range []string{"/home/dev/.local/bin/claude", "--api-key [secret]", "--token=[secret]", "OPENAI_API_KEY=[secret]", "postgres://app:[secret]@localhost/shop", "--resume"} {
		if !strings.Contains(report, kept) {
			t.Errorf("the diag keeps what the command line says, %q missing:\n%s", kept, report)
		}
	}
}
