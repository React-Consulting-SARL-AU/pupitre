package state

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	FileChunkBytes    = 48 * 1024
	FileListLimit     = 2000
	FileTextMaxBytes  = 1 << 20
	FileImageMaxBytes = 16 << 20
	FileWriteMaxBytes = 1 << 20

	MediaTypeText = "text/plain"
)

// What the reader creates belongs to the projects user, never to root, which pupitred runs as.
func (r *Reader) work() (root, owner string) {
	return user.Home(r.options.Tmux.User), r.options.Tmux.User
}

func (r *Reader) ListFiles(wanted string) (contract.FileList, error) {
	relative, err := workPath(wanted)
	if err != nil {
		return contract.FileList{}, err
	}

	folder, err := r.node(relative)
	if err != nil {
		return contract.FileList{}, err
	}

	if folder.Kind != sys.NodeDir {
		return contract.FileList{}, bad(i18n.T("files.notFolder", relative), i18n.T("files.notFolder.fix"))
	}

	root, _ := r.work()

	listed, err := r.ctx().Sys().ListIn(root, relative)
	if err != nil {
		return contract.FileList{}, refuse(relative, err)
	}

	sort.Slice(listed, func(a, b int) bool { return listed[a].Name < listed[b].Name })

	kept := min(len(listed), FileListLimit)

	entries := make([]contract.FileEntry, 0, kept)

	for _, node := range listed[:kept] {
		entries = append(entries, contract.FileEntry{
			Name:       node.Name,
			Kind:       node.Kind,
			SizeBytes:  node.SizeBytes,
			ModifiedAt: node.ModifiedAt.UTC().Format(time.RFC3339),
			Mode:       octal(node.Mode),
		})
	}

	return contract.FileList{Path: relative, Entries: entries, Truncated: len(listed) > kept}, nil
}

func (r *Reader) StatFile(wanted string, hash bool) (contract.FileStat, error) {
	relative, err := workPath(wanted)
	if err != nil {
		return contract.FileStat{}, err
	}

	node, err := r.node(relative)
	if err != nil {
		return contract.FileStat{}, err
	}

	stat := contract.FileStat{
		Path:       relative,
		Kind:       node.Kind,
		SizeBytes:  node.SizeBytes,
		ModifiedAt: node.ModifiedAt.UTC().Format(time.RFC3339),
		Mode:       octal(node.Mode),
	}

	if node.Kind == sys.NodeDir {
		return stat, nil
	}

	if !hash {
		stat.MediaType = r.sniff(relative, node)

		return stat, nil
	}

	if node.SizeBytes > FileImageMaxBytes {
		return contract.FileStat{}, tooLarge(node.SizeBytes, FileImageMaxBytes)
	}

	content, err := r.contents(relative)
	if err != nil {
		return contract.FileStat{}, err
	}

	stat.MediaType = mediaTypeOf(relative, content)
	stat.SHA256 = digestOf(content)

	return stat, nil
}

type FileContent struct {
	Path      string
	MediaType string
	SizeBytes int64
	Digest    string
	Bytes     []byte
}

func (r *Reader) ReadFile(wanted string) (FileContent, error) {
	relative, err := workPath(wanted)
	if err != nil {
		return FileContent{}, err
	}

	node, err := r.node(relative)
	if err != nil {
		return FileContent{}, err
	}

	if node.Kind == sys.NodeDir {
		return FileContent{}, bad(i18n.T("files.notFile", relative), i18n.T("files.notFile.fix"))
	}

	// Weighed on the stat before reading, so what would monopolise the channel never reaches memory.
	if limit := readLimit(relative); node.SizeBytes > limit {
		return FileContent{}, tooLarge(node.SizeBytes, limit)
	}

	content, err := r.contents(relative)
	if err != nil {
		return FileContent{}, err
	}

	mediaType := mediaTypeOf(relative, content)
	if mediaType == "" {
		return FileContent{}, bad(i18n.T("files.unsupported", relative), i18n.T("files.unsupported.fix"))
	}

	return FileContent{
		Path:      relative,
		MediaType: mediaType,
		SizeBytes: int64(len(content)),
		Digest:    digestOf(content),
		Bytes:     content,
	}, nil
}

func (r *Reader) WriteFile(wanted, encoded, digest string) (contract.FileWritten, error) {
	relative, err := workPath(wanted)
	if err != nil {
		return contract.FileWritten{}, err
	}

	content, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return contract.FileWritten{}, bad(i18n.T("files.write.content"), i18n.T("files.write.content.fix"))
	}

	if len(content) > FileWriteMaxBytes {
		return contract.FileWritten{}, bad(
			i18n.T("files.write.tooLarge", len(content), FileWriteMaxBytes),
			i18n.T("files.write.tooLarge.fix"))
	}

	if err := r.writable(relative, digest); err != nil {
		return contract.FileWritten{}, err
	}

	root, owner := r.work()

	if err := r.ctx().Sys().WriteFileIn(root, relative, owner, content); err != nil {
		return contract.FileWritten{}, bad(i18n.T("files.write.failed", err.Error()), "")
	}

	return contract.FileWritten{
		Path:      relative,
		SizeBytes: int64(len(content)),
		SHA256:    digestOf(content),
	}, nil
}

// The file must still be the version the write started from, or an agent's edit in between would be lost.
func (r *Reader) writable(relative, digest string) error {
	node, found, err := r.lookup(relative)
	if err != nil {
		return err
	}

	if !found {
		if digest == "" {
			return nil
		}

		return bad(i18n.T("files.missing", relative), i18n.T("files.missing.fix"))
	}

	if node.Kind == sys.NodeDir {
		return bad(i18n.T("files.notFile", relative), i18n.T("files.notFile.fix"))
	}

	if digest == "" {
		return bad(i18n.T("files.write.exists", relative), i18n.T("files.write.exists.fix"))
	}

	if node.SizeBytes > FileImageMaxBytes {
		return tooLarge(node.SizeBytes, FileImageMaxBytes)
	}

	content, err := r.contents(relative)
	if err != nil {
		return err
	}

	if digestOf(content) != digest {
		return bad(i18n.T("files.write.changed", relative), i18n.T("files.write.changed.fix"))
	}

	return nil
}

func (r *Reader) MakeFolder(wanted string) (contract.FilePath, error) {
	relative, err := workPath(wanted)
	if err != nil {
		return contract.FilePath{}, err
	}

	node, found, err := r.lookup(relative)
	if err != nil {
		return contract.FilePath{}, err
	}

	if found {
		if node.Kind != sys.NodeDir {
			return contract.FilePath{}, bad(i18n.T("files.mkdir.taken", relative), i18n.T("files.mkdir.taken.fix"))
		}

		return contract.FilePath{Path: relative}, nil
	}

	root, owner := r.work()

	if err := r.ctx().Sys().MkdirIn(root, relative, owner); err != nil {
		return contract.FilePath{}, bad(i18n.T("files.mkdir.failed", err.Error()), "")
	}

	return contract.FilePath{Path: relative}, nil
}

func (r *Reader) MoveFile(wanted, wantedTo string) (contract.FilePath, error) {
	from, err := workPath(wanted)
	if err != nil {
		return contract.FilePath{}, err
	}

	to, err := workPath(wantedTo)
	if err != nil {
		return contract.FilePath{}, err
	}

	if _, err := r.node(from); err != nil {
		return contract.FilePath{}, err
	}

	if _, taken, err := r.lookup(to); err != nil {
		return contract.FilePath{}, err
	} else if taken {
		return contract.FilePath{}, bad(i18n.T("files.rename.taken", to), i18n.T("files.rename.taken.fix"))
	}

	root, _ := r.work()

	if err := r.ctx().Sys().RenameIn(root, from, to); err != nil {
		return contract.FilePath{}, bad(i18n.T("files.rename.failed", err.Error()), "")
	}

	return contract.FilePath{Path: to}, nil
}

func (r *Reader) RemoveFile(wanted string, recursive bool) (contract.FileRemoved, error) {
	relative, err := workPath(wanted)
	if err != nil {
		return contract.FileRemoved{}, err
	}

	node, err := r.node(relative)
	if err != nil {
		return contract.FileRemoved{}, err
	}

	held := 0
	if node.Kind == sys.NodeDir {
		held = r.held(relative)
	}

	if held > 0 && !recursive {
		return contract.FileRemoved{}, bad(
			i18n.T("files.remove.notEmpty", relative, held),
			i18n.T("files.remove.notEmpty.fix"))
	}

	root, _ := r.work()

	if err := r.ctx().Sys().RemoveIn(root, relative, recursive); err != nil {
		return contract.FileRemoved{}, bad(i18n.T("files.remove.failed", err.Error()), "")
	}

	return contract.FileRemoved{Path: relative, Removed: held + 1}, nil
}

func (r *Reader) held(relative string) int {
	root, _ := r.work()

	listed, err := r.ctx().Sys().ListIn(root, relative)
	if err != nil {
		return 0
	}

	held := len(listed)

	for _, node := range listed {
		if node.Kind == sys.NodeDir {
			held += r.held(path.Join(relative, node.Name))
		}
	}

	return held
}

// FileChunkBytes is a multiple of three, so base64 pads only the last chunk and the concatenation decodes too.
func ChunkFile(content []byte) []string {
	chunks := make([]string, 0, len(content)/FileChunkBytes+1)

	for start := 0; start < len(content); start += FileChunkBytes {
		end := min(start+FileChunkBytes, len(content))
		chunks = append(chunks, base64.StdEncoding.EncodeToString(content[start:end]))
	}

	return chunks
}

func (r *Reader) node(relative string) (sys.Node, error) {
	node, found, err := r.lookup(relative)
	if err != nil {
		return sys.Node{}, err
	}

	if !found {
		return sys.Node{}, bad(i18n.T("files.missing", relative), i18n.T("files.missing.fix"))
	}

	return node, nil
}

func (r *Reader) lookup(relative string) (sys.Node, bool, error) {
	root, _ := r.work()

	node, err := r.ctx().Sys().StatIn(root, relative)
	if errors.Is(err, fs.ErrNotExist) {
		return sys.Node{}, false, nil
	}

	if err != nil {
		return sys.Node{}, false, refuse(relative, err)
	}

	return node, true, nil
}

func (r *Reader) contents(relative string) ([]byte, error) {
	root, _ := r.work()

	content, err := r.ctx().Sys().ReadFileIn(root, relative)
	if err != nil {
		return nil, refuse(relative, err)
	}

	return content, nil
}

func (r *Reader) sniff(relative string, node sys.Node) string {
	if image := shots.MediaType(relative); image != "" {
		return image
	}

	if node.SizeBytes > FileTextMaxBytes {
		return ""
	}

	content, err := r.contents(relative)
	if err != nil {
		return ""
	}

	return mediaTypeOf(relative, content)
}

func mediaTypeOf(relative string, content []byte) string {
	if image := shots.MediaType(relative); image != "" {
		return image
	}

	if !bytes.ContainsRune(content, 0) && utf8.Valid(content) {
		return MediaTypeText
	}

	return ""
}

func readLimit(relative string) int64 {
	if shots.MediaType(relative) != "" {
		return FileImageMaxBytes
	}

	return FileTextMaxBytes
}

func digestOf(content []byte) string {
	digest := sha256.Sum256(content)

	return hex.EncodeToString(digest[:])
}

func octal(mode fs.FileMode) string {
	return fmt.Sprintf("%04o", mode.Perm())
}

func tooLarge(size, limit int64) error {
	return bad(i18n.T("files.tooLarge", size, limit), i18n.T("files.tooLarge.fix"))
}

func workPath(wanted string) (string, error) {
	if strings.ContainsAny(wanted, "\x00\n\r") {
		return "", bad(i18n.T("files.path.unreadable"), i18n.T("files.path.unreadable.fix"))
	}

	if strings.HasPrefix(wanted, "/") {
		return "", bad(i18n.T("files.path.absolute", wanted), i18n.T("files.path.absolute.fix"))
	}

	for _, segment := range strings.Split(wanted, "/") {
		if segment == ".." {
			return "", bad(i18n.T("files.path.outside", wanted), i18n.T("files.path.outside.fix"))
		}
	}

	return strings.TrimPrefix(path.Clean("/"+wanted), "/"), nil
}

// A refusal is the request being wrong; any unrecognised one means the root does not contain the path.
func refuse(relative string, err error) error {
	if errors.Is(err, fs.ErrNotExist) {
		return bad(i18n.T("files.missing", relative), i18n.T("files.missing.fix"))
	}

	if errors.Is(err, fs.ErrPermission) {
		return bad(i18n.T("files.unreadable", relative), "")
	}

	if errors.Is(err, sys.ErrNotRegular) {
		return bad(i18n.T("files.special", relative), "")
	}

	return bad(i18n.T("files.path.outside", relative), i18n.T("files.path.outside.fix"))
}
