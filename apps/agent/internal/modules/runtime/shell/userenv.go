package shell

import (
	"errors"
	"io/fs"
	"regexp"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	UserEnvDir  = Home + "/.config/pupitre"
	UserEnvPath = UserEnvDir + "/env"

	userEnvBlock = "pupitre-env"
	userEnvHook  = `[[ -r "$HOME/.config/pupitre/env" ]] && source "$HOME/.config/pupitre/env"` + "\n"
)

var exportPattern = regexp.MustCompile(`^export ([A-Z][A-Z0-9_]*)='(.*)'$`)

// /etc/pupitre/env is root's, so a key dev's own CLIs must read goes here instead.
func SetUserEnv(ctx *modules.Context, key, value string) (bool, error) {
	entries, err := readUserEnv(ctx)
	if err != nil {
		return false, err
	}

	hooked, err := file.EnsureBlock(ctx, EnvPath, userEnvBlock, []byte(userEnvHook))
	if err != nil {
		return false, err
	}

	if hooked {
		if err := file.Chown(ctx, EnvPath, User, User); err != nil {
			return false, err
		}
	}

	if current, ok := entries[key]; ok && current == value {
		return hooked, nil
	}

	entries[key] = value
	ctx.Logf("user env: set %s", key)

	return true, writeUserEnv(ctx, entries)
}

func UnsetUserEnv(ctx *modules.Context, key string) (bool, error) {
	entries, err := readUserEnv(ctx)
	if err != nil {
		return false, err
	}

	if _, ok := entries[key]; !ok {
		return false, nil
	}

	delete(entries, key)
	ctx.Logf("user env: unset %s", key)

	if len(entries) > 0 {
		return true, writeUserEnv(ctx, entries)
	}

	if _, err := file.Remove(ctx, UserEnvPath); err != nil {
		return false, err
	}

	_, err = file.RemoveBlock(ctx, EnvPath, userEnvBlock)

	return true, err
}

func readUserEnv(ctx *modules.Context) (map[string]string, error) {
	entries := map[string]string{}

	raw, err := ctx.Sys().ReadFile(UserEnvPath)
	if errors.Is(err, fs.ErrNotExist) {
		return entries, nil
	}

	if err != nil {
		return nil, err
	}

	for _, line := range strings.Split(string(raw), "\n") {
		if match := exportPattern.FindStringSubmatch(line); match != nil {
			entries[match[1]] = strings.ReplaceAll(match[2], `'\''`, "'")
		}
	}

	return entries, nil
}

func writeUserEnv(ctx *modules.Context, entries map[string]string) error {
	keys := make([]string, 0, len(entries))

	for key := range entries {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	var content strings.Builder

	for _, key := range keys {
		content.WriteString("export " + key + "='" + strings.ReplaceAll(entries[key], "'", `'\''`) + "'\n")
	}

	if err := file.MkdirOwned(ctx, UserEnvDir, User, User, 0o700); err != nil {
		return err
	}

	if err := file.WriteAtomic(ctx, UserEnvPath, []byte(content.String()), 0o600); err != nil {
		return err
	}

	return file.Chown(ctx, UserEnvPath, User, User)
}
