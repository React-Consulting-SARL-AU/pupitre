package file

import (
	"bytes"
	"errors"
	"io/fs"
	"path/filepath"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

func Read(ctx sys.Context, path string) ([]byte, error) {
	return ctx.Sys().ReadFile(path)
}

// Tail is the last max bytes of the file: read as a range where the machine can, cut from the whole of it otherwise.
func Tail(ctx sys.Context, path string, max int64) ([]byte, error) {
	if ranged, can := ctx.Sys().(sys.Ranged); can {
		return ranged.ReadTail(path, max)
	}

	raw, err := ctx.Sys().ReadFile(path)
	if err != nil {
		return nil, err
	}

	if int64(len(raw)) > max {
		raw = raw[int64(len(raw))-max:]
	}

	return raw, nil
}

// From is what the file holds past offset, the whole of it when it shrank under the reader.
func From(ctx sys.Context, path string, offset int64) ([]byte, error) {
	if ranged, can := ctx.Sys().(sys.Ranged); can {
		return ranged.ReadFrom(path, offset)
	}

	raw, err := ctx.Sys().ReadFile(path)
	if err != nil {
		return nil, err
	}

	if offset > int64(len(raw)) {
		offset = 0
	}

	return raw[offset:], nil
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

func Append(ctx sys.Context, path string, content []byte, owner string) error {
	ctx.Logf("append to %s", path)

	return ctx.Sys().AppendFile(path, content, owner)
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

	return true, ctx.Sys().WriteFile(path, []byte(updated), sys.KeepMode)
}

func Chown(ctx sys.Context, path, owner, group string) error {
	ctx.Logf("chown %s:%s %s", owner, group, path)

	return ctx.Sys().Chown(path, owner, group)
}

func Owner(ctx sys.Context, path string) (string, error) {
	return ctx.Sys().Owner(path)
}

// MkdirOwned creates the folder and hands the owner every folder it had to
// create on the way: a folder made by root inside a user's home locks that
// user out of everything under it.
func MkdirOwned(ctx sys.Context, path, owner, group string, mode fs.FileMode) error {
	var created []string
	for dir := path; dir != "/" && dir != "." && !Exists(ctx, dir); dir = filepath.Dir(dir) {
		created = append(created, dir)
	}

	if len(created) == 0 {
		return nil
	}

	ctx.Logf("mkdir %s (%o)", path, mode)

	if err := ctx.Sys().MkdirAll(path, mode); err != nil {
		return err
	}

	for _, dir := range created {
		if err := Chown(ctx, dir, owner, group); err != nil {
			return err
		}
	}

	return nil
}

// EnsureOwned creates the folder for its owner, or gives it back to them,
// everything inside included, when a previous run left it to root. It says
// whether it changed anything, so the step around it can be skipped on a replay.
func EnsureOwned(ctx sys.Context, path, owner, group string, mode fs.FileMode) (bool, error) {
	if !Exists(ctx, path) {
		return true, MkdirOwned(ctx, path, owner, group, mode)
	}

	current, err := Owner(ctx, path)
	if err != nil {
		return false, err
	}

	if current == owner {
		return false, nil
	}

	return true, ChownAll(ctx, path, owner, group)
}

// ChownAll never follows a symlink: the link itself changes hands, what it points at does not.
func ChownAll(ctx sys.Context, path, owner, group string) error {
	if err := Chown(ctx, path, owner, group); err != nil {
		return err
	}

	entries, err := ctx.Sys().ReadDir(path)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		child := filepath.Join(path, entry.Name)
		if entry.Dir {
			if err := ChownAll(ctx, child, owner, group); err != nil {
				return err
			}

			continue
		}

		if err := Chown(ctx, child, owner, group); err != nil {
			return err
		}
	}

	return nil
}

func Remove(ctx sys.Context, path string) (bool, error) {
	if !Exists(ctx, path) {
		return false, nil
	}

	ctx.Logf("remove %s", path)

	return true, ctx.Sys().Remove(path)
}

// A block edits a file that is someone else's: it keeps its mode, and a link at its name is followed only within its folder.
func EnsureBlock(ctx sys.Context, path, name string, content []byte) (bool, error) {
	current, err := ownedBySomeoneElse(ctx, path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}

	updated := WithBlock(current, name, content)
	if bytes.Equal(updated, current) {
		return false, nil
	}

	ctx.Logf("write block %s in %s", name, path)

	return true, ctx.Sys().WriteFile(path, updated, sys.KeepMode)
}

func ownedBySomeoneElse(ctx sys.Context, path string) ([]byte, error) {
	return ctx.Sys().ReadFileIn(filepath.Dir(path), filepath.Base(path))
}

func ReadBlock(ctx sys.Context, path, name string) ([]byte, bool) {
	current, err := ownedBySomeoneElse(ctx, path)
	if err != nil {
		return nil, false
	}

	return BlockOf(current, name)
}

// BlockOf is what lies between the markers of a block, when the file carries them.
func BlockOf(current []byte, name string) ([]byte, bool) {
	start, end := blockStart(name)+"\n", blockEnd(name)+"\n"
	from := strings.Index(string(current), start)
	to := strings.Index(string(current), end)
	if from < 0 || to < from {
		return nil, false
	}

	return current[from+len(start) : to], true
}

// WithBlock is the file with its block replaced, or appended when it had none; every line outside the markers stays as it was.
func WithBlock(current []byte, name string, content []byte) []byte {
	return []byte(withBlock(string(current), blockStart(name), blockEnd(name), string(content)))
}

func HasBlock(ctx sys.Context, path, name string) bool {
	current, err := ownedBySomeoneElse(ctx, path)

	return err == nil && strings.Contains(string(current), blockStart(name)+"\n") && strings.Contains(string(current), blockEnd(name)+"\n")
}

func RemoveBlock(ctx sys.Context, path, name string) (bool, error) {
	current, err := ownedBySomeoneElse(ctx, path)
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

	return true, ctx.Sys().WriteFile(path, []byte(updated), sys.KeepMode)
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
