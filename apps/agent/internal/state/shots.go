package state

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"sort"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	ShotsProject = "shots"
	ShotsPort    = 8099
)

type ShotOptions struct {
	Dir  string
	Keep time.Duration
}

func (o ShotOptions) resolved(owner string) ShotOptions {
	if o.Dir == "" {
		o.Dir = user.Home(owner) + "/shots"
	}
	if o.Keep == 0 {
		o.Keep = 14 * 24 * time.Hour
	}

	return o
}

type shot struct {
	path string
	size int64
	when time.Time
}

func (r *Reader) Shots() []contract.Shot {
	dir := r.options.Shots.Dir

	shots := []contract.Shot{}
	for _, found := range r.gallery() {
		shots = append(shots, contract.Shot{
			Name:      base(found.path),
			Path:      strings.TrimPrefix(strings.TrimPrefix(found.path, dir), "/"),
			SizeBytes: found.size,
			CreatedAt: found.when.UTC().Format(time.RFC3339),
		})
	}

	return shots
}

// The gallery is served by the "shots" row of the registry: it carries the port and the subdomain, and nothing here has to guess them.
func (r *Reader) ShotsURL() string {
	if project, declared := r.registry().Get(ShotsProject); declared {
		return url(project)
	}

	if domain := r.domain(); domain != "" {
		return "https://" + ShotsProject + "." + domain
	}

	return "http://127.0.0.1:" + strconv.Itoa(ShotsPort)
}

func (r *Reader) CleanShots() int {
	deadline := r.options.Now().Add(-r.options.Shots.Keep)
	removed := 0

	for _, found := range r.gallery() {
		if !found.when.Before(deadline) {
			continue
		}

		if err := r.ctx().Sys().Remove(found.path); err == nil {
			removed++
		}
	}

	return removed
}

// One capture goes, and only one the listing names: the same door as reading it.
func (r *Reader) RemoveShot(relative string) error {
	listed, found := r.shot(relative)
	if !found {
		return protocol.NewError(contract.ErrorBadRequest, i18n.T("state.shot.unknown", relative)).
			WithFix(i18n.T("state.shot.unknown.fix"))
	}

	if err := r.ctx().Sys().Remove(r.options.Shots.Dir + "/" + listed.Path); err != nil {
		return protocol.NewError(contract.ErrorInternal, i18n.T("state.shot.removeFailed", relative, err.Error()))
	}

	return nil
}

// Newest first, the order shot --list prints and the order a gallery is read in.
func (r *Reader) gallery() []shot {
	found := r.walk(r.options.Shots.Dir)

	sort.Slice(found, func(i, j int) bool { return found[i].when.After(found[j].when) })

	return found
}

// A symlink is neither a folder to descend nor a file to describe: the gallery never reaches out of its own tree.
func (r *Reader) walk(dir string) []shot {
	entries, err := file.List(r.ctx(), dir)
	if err != nil {
		return nil
	}

	var found []shot
	for _, entry := range entries {
		path := dir + "/" + entry.Name
		if entry.Dir {
			found = append(found, r.walk(path)...)
			continue
		}

		size, when, err := r.ctx().Sys().Stat(path)
		if err != nil {
			continue
		}

		found = append(found, shot{path: path, size: size, when: when})
	}

	return found
}

const (
	ShotChunkBytes = 48 * 1024
	ShotMaxBytes   = 16 << 20
)

type ShotFile struct {
	Path      string
	MediaType string
	SizeBytes int64
	Digest    string
	Bytes     []byte
}

// A capture travels by the protocol channel, so nothing has to be exposed to reach it: the SSH session that already carries the commands carries the image too.
func (r *Reader) ReadShot(relative string) (ShotFile, error) {
	listed, found := r.shot(relative)
	if !found {
		return ShotFile{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.shot.unknown", relative)).
			WithFix(i18n.T("state.shot.unknown.fix"))
	}

	mediaType := shots.MediaType(listed.Name)
	if mediaType == "" {
		return ShotFile{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.shot.notImage", relative)).
			WithFix(i18n.T("state.shot.notImage.fix"))
	}

	if listed.SizeBytes > ShotMaxBytes {
		return ShotFile{}, protocol.NewError(contract.ErrorBadRequest,
			i18n.T("state.shot.tooLarge", listed.SizeBytes, ShotMaxBytes)).
			WithFix(i18n.T("state.shot.tooLarge.fix"))
	}

	content, err := file.Read(r.ctx(), r.options.Shots.Dir+"/"+listed.Path)
	if err != nil {
		return ShotFile{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("state.shot.unreadable", relative))
	}

	digest := sha256.Sum256(content)

	return ShotFile{
		Path:      listed.Path,
		MediaType: mediaType,
		SizeBytes: int64(len(content)),
		Digest:    hex.EncodeToString(digest[:]),
		Bytes:     content,
	}, nil
}

// Cut on a multiple of three so base64 pads only the last chunk: each line decodes alone, and their concatenation decodes too.
func ChunkShot(content []byte) []string {
	chunks := make([]string, 0, len(content)/ShotChunkBytes+1)

	for start := 0; start < len(content); start += ShotChunkBytes {
		end := min(start+ShotChunkBytes, len(content))
		chunks = append(chunks, base64.StdEncoding.EncodeToString(content[start:end]))
	}

	return chunks
}

// The listing is the only door: a capture is readable because shots.list names it, never because a path points at it.
func (r *Reader) shot(relative string) (contract.Shot, bool) {
	for _, listed := range r.Shots() {
		if listed.Path == relative {
			return listed, true
		}
	}

	return contract.Shot{}, false
}
