package download

import (
	"errors"
	"io/fs"
	"path"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const Dir = "/var/lib/pupitre/downloads"

func Text(ctx *modules.Context, url string) (string, error) {
	out, err := modules.Quiet(ctx, sys.Command{Argv: sys.CurlText(url)})

	return strings.TrimSpace(out.Stdout), err
}

func Fetch(ctx *modules.Context, name, url string) (string, func(), error) {
	if err := ctx.Sys().MkdirAll(Dir, 0o700); err != nil {
		return "", nil, err
	}

	staged := Dir + "/" + name
	remove := func() { _, _ = file.Remove(ctx, staged) }

	if _, err := sys.Exec(ctx, sys.Command{Argv: sys.CurlFile(staged, url)}); err != nil {
		remove()

		return "", nil, err
	}

	return staged, remove, nil
}

func Verified(ctx *modules.Context, name, url, expected string) (string, func(), error) {
	staged, remove, err := Fetch(ctx, name, url)
	if err != nil {
		return "", nil, err
	}

	actual, err := Checksum(ctx, staged)
	if err != nil {
		remove()

		return "", nil, err
	}

	if actual != strings.ToLower(strings.TrimSpace(expected)) {
		remove()

		return "", nil, errors.New(i18n.T("modules.download.checksum_mismatch", name, actual))
	}

	return staged, remove, nil
}

func Checksum(ctx *modules.Context, staged string) (string, error) {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"sha256sum", staged}})
	if err != nil {
		return "", err
	}

	fields := strings.Fields(out.Stdout)
	if len(fields) == 0 {
		return "", errors.New(i18n.T("modules.download.checksum_missing", staged))
	}

	return strings.ToLower(fields[0]), nil
}

// Lines as sha256sum writes them ("<digest>  ./name"); an empty name takes the first digest.
func Published(document, name string) (string, bool) {
	for _, line := range strings.Split(document, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}

		if name == "" || (len(fields) > 1 && path.Base(strings.TrimPrefix(fields[1], "*")) == name) {
			return strings.ToLower(fields[0]), true
		}
	}

	return "", false
}

// Copied rather than moved, since the staging folder is root's alone.
func Install(ctx *modules.Context, staged, destination string, mode fs.FileMode, owner string) error {
	content, err := file.Read(ctx, staged)
	if err != nil {
		return err
	}

	if err := file.WriteAtomic(ctx, destination, content, mode); err != nil {
		return err
	}

	if owner == "" || owner == "root" {
		return nil
	}

	return file.Chown(ctx, destination, owner, owner)
}

// A user's folder is unpacked by that user from stdin, so a link they planted never carries a root write.
func Extract(ctx *modules.Context, staged, dir string, strip int, owner string) error {
	command := sys.Command{Argv: []string{"tar", "-x", "-z", "-f", staged, "-C", dir}}

	if owner != "" && owner != "root" {
		if _, err := file.EnsureOwned(ctx, dir, owner, owner, 0o755); err != nil {
			return err
		}

		command = sys.Command{User: owner, Argv: []string{"tar", "-x", "-z", "-f", "-", "-C", dir}, StdinPath: staged}
	}

	if strip > 0 {
		command.Argv = append(command.Argv, "--strip-components="+strconv.Itoa(strip))
	}

	_, err := sys.Exec(ctx, command)

	return err
}

const versionsDir = "/var/lib/pupitre/versions"

// For a binary slow to report its own version, since a snapshot asks every few seconds.
func Record(ctx *modules.Context, id, version string) error {
	if err := ctx.Sys().MkdirAll(versionsDir, 0o700); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, versionsDir+"/"+id, []byte(version+"\n"), 0o600)
}

func Recorded(ctx *modules.Context, id string) string {
	raw, err := file.Read(ctx, versionsDir+"/"+id)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}

func Forget(ctx *modules.Context, id string) (bool, error) {
	return file.Remove(ctx, versionsDir+"/"+id)
}

// GitHub answers a "latest" link with a redirect whose path names the tag.
func LatestVersion(ctx *modules.Context, latestURL string) (string, error) {
	out, err := sys.Exec(ctx, sys.Command{Argv: sys.CurlRedirect(latestURL)})
	if err != nil {
		return "", err
	}

	for _, segment := range strings.Split(strings.TrimSpace(out.Stdout), "/") {
		if strings.HasPrefix(segment, "v") && strings.Contains(segment, ".") {
			return strings.TrimPrefix(segment, "v"), nil
		}
	}

	return "", errors.New(i18n.T("modules.download.version_unreadable", latestURL, strings.TrimSpace(out.Stdout)))
}
