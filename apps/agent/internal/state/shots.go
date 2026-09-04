package state

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
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
		return url(project, r.domain())
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

// Newest first, the order shot --list prints and the order a gallery is read in.
func (r *Reader) gallery() []shot {
	out, err := r.ctx().Sys().Run(sys.Command{
		Argv: []string{"find", r.options.Shots.Dir, "-type", "f", "-printf", `%T@\t%s\t%p\n`},
	})
	if err != nil {
		return nil
	}

	var found []shot
	for _, line := range strings.Split(out.Stdout, "\n") {
		columns := strings.SplitN(strings.TrimRight(line, "\r"), "\t", 3)
		if len(columns) < 3 {
			continue
		}

		seconds, secondsErr := strconv.ParseFloat(columns[0], 64)
		size, sizeErr := strconv.ParseInt(columns[1], 10, 64)
		if secondsErr != nil || sizeErr != nil || columns[2] == "" {
			continue
		}

		found = append(found, shot{path: columns[2], size: size, when: time.Unix(int64(seconds), 0)})
	}

	sort.Slice(found, func(i, j int) bool { return found[i].when.After(found[j].when) })

	return found
}
