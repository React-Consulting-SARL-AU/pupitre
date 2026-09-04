package env

import (
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const Path = "/etc/pupitre/env"

var keyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)

func Get(ctx sys.Context, key string) (string, bool, error) {
	entries, err := read(ctx)
	if err != nil {
		return "", false, err
	}

	value, ok := entries[key]

	return value, ok, nil
}

func Keys(ctx sys.Context) ([]string, error) {
	entries, err := read(ctx)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	return keys, nil
}

func Set(ctx sys.Context, key, value string) (bool, error) {
	if !keyPattern.MatchString(key) {
		return false, fmt.Errorf("clé d'environnement invalide : %q", key)
	}

	if strings.ContainsAny(value, "\n\r") {
		return false, fmt.Errorf("la valeur de %s ne peut pas contenir de saut de ligne", key)
	}

	entries, err := read(ctx)
	if err != nil {
		return false, err
	}

	if current, ok := entries[key]; ok && current == value {
		return false, nil
	}

	entries[key] = value
	ctx.Logf("env: set %s", key)

	return true, write(ctx, entries)
}

func Unset(ctx sys.Context, key string) (bool, error) {
	entries, err := read(ctx)
	if err != nil {
		return false, err
	}

	if _, ok := entries[key]; !ok {
		return false, nil
	}

	delete(entries, key)
	ctx.Logf("env: unset %s", key)

	return true, write(ctx, entries)
}

func read(ctx sys.Context) (map[string]string, error) {
	entries := map[string]string{}

	raw, err := ctx.Sys().ReadFile(Path)
	if errors.Is(err, fs.ErrNotExist) {
		return entries, nil
	}

	if err != nil {
		return nil, err
	}

	for _, line := range strings.Split(string(raw), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok && keyPattern.MatchString(key) {
			entries[key] = value
		}
	}

	return entries, nil
}

func write(ctx sys.Context, entries map[string]string) error {
	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var content strings.Builder
	for _, key := range keys {
		content.WriteString(key + "=" + entries[key] + "\n")
	}

	if err := ctx.Sys().MkdirAll(filepath.Dir(Path), 0o700); err != nil {
		return err
	}

	return ctx.Sys().WriteFile(Path, []byte(content.String()), 0o600)
}
