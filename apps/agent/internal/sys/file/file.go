package file

import (
	"bytes"
	"errors"
	"io/fs"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

func Read(ctx sys.Context, path string) ([]byte, error) {
	return ctx.Sys().ReadFile(path)
}

func Exists(ctx sys.Context, path string) bool {
	exists, err := ctx.Sys().Exists(path)

	return err == nil && exists
}

func List(ctx sys.Context, path string) ([]sys.Entry, error) {
	return ctx.Sys().ReadDir(path)
}

func Same(ctx sys.Context, path string, content []byte) bool {
	current, err := ctx.Sys().ReadFile(path)

	return err == nil && bytes.Equal(current, content)
}

func WriteAtomic(ctx sys.Context, path string, content []byte, mode fs.FileMode) error {
	ctx.Logf("write %s (%o)", path, mode)

	return ctx.Sys().WriteFile(path, content, mode)
}

func EnsureLine(ctx sys.Context, path, line string) (bool, error) {
	current, err := ctx.Sys().ReadFile(path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}

	for _, existing := range strings.Split(string(current), "\n") {
		if strings.TrimSpace(existing) == strings.TrimSpace(line) {
			return false, nil
		}
	}

	updated := string(current)
	if updated != "" && !strings.HasSuffix(updated, "\n") {
		updated += "\n"
	}
	updated += line + "\n"

	ctx.Logf("append to %s", path)

	return true, ctx.Sys().WriteFile(path, []byte(updated), 0o644)
}

func Chown(ctx sys.Context, path, owner, group string) error {
	ctx.Logf("chown %s:%s %s", owner, group, path)

	return ctx.Sys().Chown(path, owner, group)
}

func Remove(ctx sys.Context, path string) (bool, error) {
	if !Exists(ctx, path) {
		return false, nil
	}

	ctx.Logf("remove %s", path)

	return true, ctx.Sys().Remove(path)
}

func EnsureBlock(ctx sys.Context, path, name string, content []byte) (bool, error) {
	return EnsureBlockMode(ctx, path, name, content, 0o644)
}

func EnsureBlockMode(ctx sys.Context, path, name string, content []byte, mode fs.FileMode) (bool, error) {
	current, err := ctx.Sys().ReadFile(path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}

	updated := withBlock(string(current), blockStart(name), blockEnd(name), string(content))
	if updated == string(current) {
		return false, nil
	}

	ctx.Logf("write block %s in %s", name, path)

	return true, ctx.Sys().WriteFile(path, []byte(updated), mode)
}

func ReadBlock(ctx sys.Context, path, name string) ([]byte, bool) {
	current, err := ctx.Sys().ReadFile(path)
	if err != nil {
		return nil, false
	}

	start, end := blockStart(name)+"\n", blockEnd(name)+"\n"
	from := strings.Index(string(current), start)
	to := strings.Index(string(current), end)
	if from < 0 || to < from {
		return nil, false
	}

	return current[from+len(start) : to], true
}

func HasBlock(ctx sys.Context, path, name string) bool {
	current, err := ctx.Sys().ReadFile(path)

	return err == nil && strings.Contains(string(current), blockStart(name)+"\n") && strings.Contains(string(current), blockEnd(name)+"\n")
}

func RemoveBlock(ctx sys.Context, path, name string) (bool, error) {
	current, err := ctx.Sys().ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}

		return false, err
	}

	start, end := blockStart(name)+"\n", blockEnd(name)+"\n"
	from := strings.Index(string(current), start)
	to := strings.Index(string(current), end)
	if from < 0 || to < from {
		return false, nil
	}

	ctx.Logf("remove block %s from %s", name, path)
	updated := string(current[:from]) + string(current[to+len(end):])

	return true, ctx.Sys().WriteFile(path, []byte(updated), 0o644)
}

func blockStart(name string) string {
	return "# >>> pupitre " + name + " >>>"
}

func blockEnd(name string) string {
	return "# <<< pupitre " + name + " <<<"
}

func withBlock(current, start, end, content string) string {
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	block := start + "\n" + content + end + "\n"

	from := strings.Index(current, start+"\n")
	to := strings.Index(current, end+"\n")
	if from >= 0 && to > from {
		return current[:from] + block + current[to+len(end)+1:]
	}

	if current != "" && !strings.HasSuffix(current, "\n") {
		current += "\n"
	}

	return current + block
}
