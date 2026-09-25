package archive

import (
	"archive/tar"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"time"
)

// With an Area, a Root or entry that is a link is followed as long as it ends inside the Area; without one, no link is.
type Source struct {
	Root    string
	Entries []string
	Skip    func(rel string, dir bool) bool
	Area    string
}

type OutsideError struct {
	Path   string
	Target string
}

func (e *OutsideError) Error() string {
	return e.Path + " leads to " + e.Target + ", outside the folders a backup reads"
}

func Resolve(full, area string) (string, error) {
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil {
		return "", err
	}

	bound, err := filepath.EvalSymlinks(area)
	if err != nil {
		return "", err
	}

	if !within(bound, resolved) {
		return "", &OutsideError{Path: full, Target: resolved}
	}

	return resolved, nil
}

const Whole = "."

func ExcludingDirs(names []string) func(string, bool) bool {
	return func(rel string, dir bool) bool {
		return dir && slices.Contains(names, path.Base(rel))
	}
}

func ExcludingPaths(paths []string) func(string, bool) bool {
	return func(rel string, _ bool) bool {
		return slices.Contains(paths, rel)
	}
}

type visit func(rel, full string, info fs.FileInfo, target string) error

// The same walk, in lexical order, feeds the archive and its fingerprint.
func (s Source) walk(each visit) error {
	root, err := s.root()
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	if err != nil {
		return err
	}

	for _, entry := range s.Entries {
		if err := s.walkEntry(root, entry, each); err != nil {
			return err
		}
	}

	return nil
}

func (s Source) root() (string, error) {
	if s.Area == "" {
		return s.Root, nil
	}

	return Resolve(s.Root, s.Area)
}

// A link entry is walked where it leads but named as the entry, so a restore puts it back under that name.
func (s Source) walkEntry(root, entry string, each visit) error {
	start := filepath.Join(root, filepath.FromSlash(entry))

	info, err := os.Lstat(start)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	base, prefix := root, ""

	if err == nil && info.Mode()&fs.ModeSymlink != 0 && s.Area != "" {
		resolved, err := Resolve(start, s.Area)
		if err != nil {
			return err
		}

		base, prefix, start = resolved, entry, resolved
	}

	return filepath.WalkDir(start, func(full string, entry fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}

			return err
		}

		rel, err := filepath.Rel(base, full)
		if err != nil {
			return err
		}

		rel = named(prefix, filepath.ToSlash(rel))

		if rel != Whole && s.Skip != nil && s.Skip(rel, entry.IsDir()) {
			if entry.IsDir() {
				return filepath.SkipDir
			}

			return nil
		}

		info, err := entry.Info()
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}

		if err != nil {
			return err
		}

		return s.visit(rel, full, info, each)
	})
}

func named(prefix, rel string) string {
	switch {
	case prefix == "" || prefix == Whole:
		return rel
	case rel == Whole:
		return prefix
	}

	return prefix + "/" + rel
}

// A link is kept only when it points under the root; sockets, pipes and devices never are.
func (s Source) visit(rel, full string, info fs.FileInfo, each visit) error {
	switch {
	case info.Mode()&fs.ModeSymlink != 0:
		target, err := os.Readlink(full)
		if err != nil || !Inside(s.Root, rel, target) {
			return nil
		}

		return each(rel, full, info, target)
	case info.IsDir(), info.Mode().IsRegular():
		return each(rel, full, info, "")
	}

	return nil
}

func Inside(root, rel, target string) bool {
	resolved := target

	if !filepath.IsAbs(target) {
		resolved = filepath.Join(root, filepath.Dir(filepath.FromSlash(rel)), target)
	}

	cleanRoot := filepath.Clean(root)
	resolved = filepath.Clean(resolved)

	return resolved == cleanRoot || strings.HasPrefix(resolved, cleanRoot+string(filepath.Separator))
}

// A file that grows or shrinks while read is cut or padded to the size its header announced.
func Write(w io.Writer, source Source) error {
	archive := tar.NewWriter(w)

	err := source.walk(func(rel, full string, info fs.FileInfo, target string) error {
		if info.Mode().IsRegular() {
			return writeFile(archive, rel, full, info)
		}

		header, err := tar.FileInfoHeader(info, target)
		if err != nil {
			return err
		}

		header.Name = entryName(rel, info.IsDir())
		anonymous(header)

		return archive.WriteHeader(header)
	})
	if err != nil {
		return err
	}

	return archive.Close()
}

// Opened as the walk saw it or not at all: a file swapped since for a link, a pipe or another file is left out.
func writeFile(archive *tar.Writer, rel, full string, walked fs.FileInfo) error {
	file, err := os.OpenFile(full, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if errors.Is(err, fs.ErrNotExist) || errors.Is(err, syscall.ELOOP) {
		return nil
	}

	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}

	if !info.Mode().IsRegular() || !os.SameFile(info, walked) {
		return nil
	}

	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}

	header.Name = rel
	anonymous(header)

	if err := archive.WriteHeader(header); err != nil {
		return err
	}

	copied, err := io.CopyN(archive, file, header.Size)
	if errors.Is(err, io.EOF) {
		_, err = io.CopyN(archive, zeros{}, header.Size-copied)
	}

	return err
}

type zeros struct{}

func (zeros) Read(out []byte) (int, error) {
	clear(out)

	return len(out), nil
}

// Owners are the restore's to decide: everything goes back to the dev account.
func anonymous(header *tar.Header) {
	header.Uid, header.Gid = 0, 0
	header.Uname, header.Gname = "", ""
}

func entryName(rel string, dir bool) string {
	if dir && rel != Whole {
		return rel + "/"
	}

	return rel
}

// Digests every path, kind, size, mode, date and link without reading a byte of content.
func Fingerprint(source Source, flavor string) (string, error) {
	digest := sha256.New()
	fmt.Fprintf(digest, "%s\n", flavor)

	err := source.walk(func(rel, _ string, info fs.FileInfo, target string) error {
		size := info.Size()
		if info.IsDir() {
			size = 0
		}

		fmt.Fprintf(digest, "%s\x00%s\x00%d\x00%o\x00%d\x00%s\n", rel, info.Mode().Type(), size, info.Mode().Perm(), info.ModTime().UnixNano(), target)

		return nil
	})
	if err != nil {
		return "", err
	}

	return hex.EncodeToString(digest.Sum(nil)), nil
}

type File struct {
	Name    string
	Content []byte
	Mode    fs.FileMode
	ModTime time.Time
}

func WriteFiles(w io.Writer, files []File) error {
	archive := tar.NewWriter(w)

	for _, file := range files {
		header := &tar.Header{Name: file.Name, Mode: int64(file.Mode.Perm()), Size: int64(len(file.Content)), ModTime: file.ModTime, Typeflag: tar.TypeReg}
		if err := archive.WriteHeader(header); err != nil {
			return err
		}

		if _, err := archive.Write(file.Content); err != nil {
			return err
		}
	}

	return archive.Close()
}

func ReadFiles(r io.Reader, limit int64) (map[string][]byte, error) {
	archive := tar.NewReader(r)
	files := map[string][]byte{}

	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			return files, nil
		}

		if err != nil {
			return nil, err
		}

		name, ok := Clean(header.Name)
		if !ok {
			return nil, &UnsafeError{Name: header.Name}
		}

		if header.Typeflag != tar.TypeReg {
			continue
		}

		if header.Size > limit {
			return nil, fmt.Errorf("%s: %d bytes, over %d", name, header.Size, limit)
		}

		content, err := io.ReadAll(archive)
		if err != nil {
			return nil, err
		}

		files[name] = content
	}
}

type UnsafeError struct {
	Name string
}

func (e *UnsafeError) Error() string {
	return "unsafe entry in the archive: " + e.Name
}

func Clean(name string) (string, bool) {
	if name == "" || strings.HasPrefix(name, "/") {
		return "", false
	}

	cleaned := path.Clean(strings.TrimSuffix(name, "/"))
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", false
	}

	return cleaned, true
}
