// Package download stages what a module fetches from a vendor: as root, under a
// folder nobody else can enter, checked against the digest the vendor published
// when it publishes one, and removed once it has been installed.
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

var curl = []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2"}

// Text reads a small document — a version, an index, a checksum — and returns it trimmed.
func Text(ctx *modules.Context, url string) (string, error) {
	out, err := sys.Exec(ctx, sys.Command{Argv: append(append([]string{}, curl...), url)})

	return strings.TrimSpace(out.Stdout), err
}

// Fetch downloads url into the staging folder under name, and hands back the path with the function that removes it.
func Fetch(ctx *modules.Context, name, url string) (string, func(), error) {
	if err := ctx.Sys().MkdirAll(Dir, 0o700); err != nil {
		return "", nil, err
	}

	staged := Dir + "/" + name
	remove := func() { _, _ = file.Remove(ctx, staged) }

	if _, err := sys.Exec(ctx, sys.Command{Argv: append(append([]string{}, curl...), "-o", staged, url)}); err != nil {
		remove()

		return "", nil, err
	}

	return staged, remove, nil
}

// Verified is Fetch followed by a SHA-256 check: a file whose digest is not the published one is removed and refused.
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

// Published reads the digest a checksum document gives for name — "<digest>  ./name" as sha256sum writes it — or the first one when name is empty.
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

// Install copies a staged file to where it belongs, with its mode and owner: the staging folder is root's alone, so nothing leaves it by being moved.
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

// Extract unpacks a staged tarball into dir as root, dropping strip leading folders, then hands everything to owner.
func Extract(ctx *modules.Context, staged, dir string, strip int, owner string) error {
	argv := []string{"tar", "-x", "-z", "-f", staged, "-C", dir}
	if strip > 0 {
		argv = append(argv, "--strip-components="+strconv.Itoa(strip))
	}

	if _, err := sys.Exec(ctx, sys.Command{Argv: argv}); err != nil {
		return err
	}

	if owner == "" || owner == "root" {
		return nil
	}

	return file.ChownAll(ctx, dir, owner, owner)
}
