package main

import (
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/lock"
)

const keysCommand = "keys"

var effectiveUID = os.Geteuid

// The way back from the hosting console when every device is lost: one key becomes the whole block and the only signer.
func runKeys(engine *modules.Engine, args []string, stdout, stderr io.Writer) int {
	offered, ok := resetArguments(args)
	if !ok {
		fmt.Fprintln(stderr, i18n.T("keys.reset.usage"))

		return 2
	}

	if effectiveUID() != 0 {
		fmt.Fprintln(stderr, i18n.T("keys.reset.root"))

		return 1
	}

	line, err := offeredKey(engine, offered)
	if err != nil {
		fmt.Fprintln(stderr, i18n.T("keys.reset.unreadable", offered, err.Error()))

		return 1
	}

	key, err := keys.ParsePublic(line)
	if err != nil {
		fmt.Fprintln(stderr, i18n.T("keys.reset.refused"))

		return 1
	}

	if err := reset(engine, key); err != nil {
		fmt.Fprintln(stderr, i18n.T("keys.reset.failed", err.Error()))

		return 1
	}

	fmt.Fprintln(stdout, i18n.T("keys.reset.done", keysPath(), key.Fingerprint()))
	fmt.Fprintln(stdout, i18n.T("keys.reset.next"))

	return 0
}

func resetArguments(args []string) (string, bool) {
	if len(args) == 0 || args[0] != "reset" {
		return "", false
	}

	offered := ""
	rest := args[1:]

	for i := 0; i < len(rest); i++ {
		switch {
		case rest[i] == "--key" && i+1 < len(rest):
			offered = rest[i+1]
			i++
		case strings.HasPrefix(rest[i], "--key="):
			offered = strings.TrimPrefix(rest[i], "--key=")
		default:
			return "", false
		}
	}

	return offered, strings.TrimSpace(offered) != ""
}

func offeredKey(engine *modules.Engine, offered string) (string, error) {
	for _, keyType := range contract.KeyApprovalRules.KeyTypes {
		if strings.HasPrefix(strings.TrimSpace(offered), keyType+" ") {
			return offered, nil
		}
	}

	raw, err := engine.Sys.ReadFile(offered)
	if err != nil {
		return "", err
	}

	return string(raw), nil
}

func reset(engine *modules.Engine, key keys.Key) error {
	release, err := lock.Hold(keysLockPath(), 5*time.Second)
	if err != nil {
		return err
	}
	defer release()

	journal := modules.NewContext(modules.ContextOptions{
		Sys:      engine.Sys,
		Manifest: contract.Manifest{ID: "pupitred"},
		LogPath:  engine.LogPath,
	})

	target := keys.Target{Path: keysPath(), Owner: daemon.DefaultKeysOwner}

	if err := keys.Reset(journal, target, signersPath(), key, time.Now()); err != nil {
		return err
	}

	journal.Logf("keys reset from the machine: %s is the only key of %s and the only signer", key.Fingerprint(), target.Path)

	return nil
}

func keysPath() string {
	return pathFromEnv("PUPITRE_KEYS_PATH", keys.DefaultPath)
}

func signersPath() string {
	return pathFromEnv("PUPITRE_SIGNERS_PATH", keys.DefaultSignersPath)
}

func keysLockPath() string {
	return pathFromEnv("PUPITRE_KEYS_LOCK_PATH", keys.DefaultLockPath)
}
