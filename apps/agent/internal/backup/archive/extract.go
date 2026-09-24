package archive

import (
	"archive/tar"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"os/user"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// A chain of links longer than the kernel's own limit is a loop.
const maxLinkHops = 40

// Owner is the account a restored tree goes to; -1 leaves the ids alone.
type Owner struct {
	UID int
	GID int
}

var Unchanged = Owner{UID: -1, GID: -1}

func Lookup(name string) (Owner, error) {
	account, err := user.Lookup(name)
	if err != nil {
		return Owner{}, err
	}

	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return Owner{}, err
	}

	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return Owner{}, err
	}

	return Owner{UID: uid, GID: gid}, nil
}

type folder struct {
	name    string
	mode    fs.FileMode
	modTime time.Time
}

// Everything goes through os.Root: neither a climbing name nor a link planted in the tree can put a byte outside root.
func Extract(r io.Reader, root string, owner Owner) error {
	scoped, err := os.OpenRoot(root)
	if err != nil {
		return err
	}
	defer scoped.Close()

	archive := tar.NewReader(r)
	var folders []folder
	var links []string

	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}

		name, ok := Clean(header.Name)
		if !ok {
			return &UnsafeError{Name: header.Name}
		}

		mode := fs.FileMode(header.Mode).Perm()

		switch header.Typeflag {
		case tar.TypeDir:
			if err := ensureDir(scoped, name, owner); err != nil {
				return err
			}

			folders = append(folders, folder{name: name, mode: mode, modTime: header.ModTime})
		case tar.TypeReg:
			if err := writeEntry(scoped, name, mode, header.ModTime, archive, owner); err != nil {
				return err
			}
		case tar.TypeSymlink:
			if !Inside(root, name, header.Linkname) {
				return &UnsafeError{Name: header.Name}
			}

			if err := linkEntry(scoped, name, header.Linkname, owner); err != nil {
				return err
			}

			links = append(links, name)
		}
	}

	if err := keepInside(scoped, root, links); err != nil {
		return err
	}

	// A folder takes its mode and date once its content is in: a read-only folder would refuse its own files, and every file written bumps the date.
	for i := len(folders) - 1; i >= 0; i-- {
		if err := scoped.Chmod(folders[i].name, folders[i].mode); err != nil {
			return err
		}

		if err := scoped.Chtimes(folders[i].name, folders[i].modTime, folders[i].modTime); err != nil {
			return err
		}
	}

	return nil
}

// Inside only reads a link on its own: a chain of links that each look inside can still lead out. Every restored link is followed to its end on the disk, and one that ends outside is removed.
func keepInside(scoped *os.Root, root string, links []string) error {
	realRoot, err := resolve(root)
	if err != nil {
		return err
	}

	var escaping []string
	for _, name := range links {
		end, err := resolve(filepath.Join(root, filepath.FromSlash(name)))
		if err != nil || !within(realRoot, end) {
			escaping = append(escaping, name)
		}
	}

	for _, name := range escaping {
		if err := scoped.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}

	if len(escaping) > 0 {
		return &UnsafeError{Name: escaping[0]}
	}

	return nil
}

// resolve follows every link of an absolute path, one component at a time as the kernel does; what does not exist yet is taken as written.
func resolve(full string) (string, error) {
	current := string(filepath.Separator)
	pending := strings.Split(filepath.Clean(full), string(filepath.Separator))
	hops := 0

	for len(pending) > 0 {
		part := pending[0]
		pending = pending[1:]

		switch part {
		case "", ".":
			continue
		case "..":
			current = filepath.Dir(current)

			continue
		}

		next := filepath.Join(current, part)

		info, err := os.Lstat(next)
		if err != nil || info.Mode()&fs.ModeSymlink == 0 {
			current = next

			continue
		}

		if hops++; hops > maxLinkHops {
			return "", &UnsafeError{Name: full}
		}

		target, err := os.Readlink(next)
		if err != nil {
			return "", err
		}

		if filepath.IsAbs(target) {
			current = string(filepath.Separator)
		}

		pending = append(strings.Split(target, string(filepath.Separator)), pending...)
	}

	return current, nil
}

func within(root, candidate string) bool {
	return candidate == root || strings.HasPrefix(candidate, root+string(filepath.Separator))
}

func writeEntry(scoped *os.Root, name string, mode fs.FileMode, modTime time.Time, content io.Reader, owner Owner) error {
	if err := ensureDir(scoped, path.Dir(name), owner); err != nil {
		return err
	}

	if err := clearWay(scoped, name); err != nil {
		return err
	}

	file, err := scoped.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}

	if _, err := io.Copy(file, content); err != nil {
		file.Close()

		return err
	}

	if err := file.Close(); err != nil {
		return err
	}

	if err := scoped.Chmod(name, mode); err != nil {
		return err
	}

	if err := chown(scoped, name, owner); err != nil {
		return err
	}

	return scoped.Chtimes(name, modTime, modTime)
}

func linkEntry(scoped *os.Root, name, target string, owner Owner) error {
	if err := ensureDir(scoped, path.Dir(name), owner); err != nil {
		return err
	}

	if err := clearWay(scoped, name); err != nil {
		return err
	}

	if err := scoped.Symlink(target, name); err != nil {
		return err
	}

	return chown(scoped, name, owner)
}

// What stands where an entry goes and is not a file of its own goes first: a link is never written through, a folder never overwritten by a file.
func clearWay(scoped *os.Root, name string) error {
	info, err := scoped.Lstat(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	if info.Mode().IsRegular() {
		return nil
	}

	return scoped.RemoveAll(name)
}

// ensureDir makes a folder and whatever it needed on the way, each given to owner; a folder already there is left as it is.
func ensureDir(scoped *os.Root, name string, owner Owner) error {
	var missing []string
	for dir := name; dir != "." && dir != "/"; dir = path.Dir(dir) {
		info, err := scoped.Lstat(dir)
		if err == nil {
			if !info.IsDir() {
				if err := scoped.Remove(dir); err != nil {
					return err
				}

				missing = append(missing, dir)
			}

			break
		}

		missing = append(missing, dir)
	}

	for i := len(missing) - 1; i >= 0; i-- {
		if err := scoped.Mkdir(missing[i], 0o755); err != nil && !errors.Is(err, fs.ErrExist) {
			return err
		}

		if err := chown(scoped, missing[i], owner); err != nil {
			return err
		}
	}

	return nil
}

func chown(scoped *os.Root, name string, owner Owner) error {
	if owner == Unchanged {
		return nil
	}

	return scoped.Lchown(name, owner.UID, owner.GID)
}

// MakeDirs makes dir, an absolute folder under base, and every folder it needed on the way, each given to owner.
func MakeDirs(base, dir string, owner Owner) error {
	rel, err := filepath.Rel(base, dir)
	if err != nil {
		return err
	}

	name, ok := Clean(filepath.ToSlash(rel))
	if !ok {
		return &UnsafeError{Name: dir}
	}

	scoped, err := os.OpenRoot(base)
	if err != nil {
		return err
	}
	defer scoped.Close()

	return ensureDir(scoped, name, owner)
}

// Staging is a fresh folder in parent, on the file system of whatever it will replace there, where an archive is laid out first.
func Staging(parent, label string, owner Owner) (string, error) {
	suffix := make([]byte, 4)
	if _, err := rand.Read(suffix); err != nil {
		return "", err
	}

	staged := filepath.Join(parent, ".pupitre-restore-"+label+"-"+hex.EncodeToString(suffix))
	if err := os.Mkdir(staged, 0o700); err != nil {
		return "", err
	}

	if owner != Unchanged {
		if err := os.Lchown(staged, owner.UID, owner.GID); err != nil {
			os.RemoveAll(staged)

			return "", err
		}
	}

	return staged, nil
}

// A folder moved to another parent takes a new date on some file systems: Swap gives it back the archive's, or the next backup would send it again.
func Swap(staged, target string) error {
	info, err := os.Lstat(staged)
	if err != nil {
		return err
	}

	aside := ""

	if _, err := os.Lstat(target); err == nil {
		aside = target + ".pupitre-replaced"
		if err := os.RemoveAll(aside); err != nil {
			return err
		}

		if err := os.Rename(target, aside); err != nil {
			return err
		}
	}

	if err := os.Rename(staged, target); err != nil {
		if aside != "" {
			os.Rename(aside, target)
		}

		return err
	}

	if aside != "" {
		if err := os.RemoveAll(aside); err != nil {
			return err
		}
	}

	if info.Mode()&fs.ModeSymlink != 0 {
		return nil
	}

	return os.Chtimes(target, info.ModTime(), info.ModTime())
}
