package access

import (
	"encoding/json"
	"errors"
	"io/fs"
	"slices"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/gate"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/lock"
	"pupitre.studio/agent/internal/sys/systemd"
)

const DefaultLockPath = "/var/lib/pupitre/access.lock"

// Writers release it within milliseconds.
const lockWait = 5 * time.Second

// What the protocol shows of a key: never its hash.
type Listed struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Projects  []string `json:"projects"`
	CreatedAt string   `json:"created_at"`
}

type Options struct {
	Ctx  sys.Context
	Lock string
	Now  func() time.Time
}

type Store struct {
	options Options
}

func New(options Options) *Store {
	if options.Lock == "" {
		options.Lock = DefaultLockPath
	}
	if options.Now == nil {
		options.Now = time.Now
	}

	return &Store{options: options}
}

// Absent reads as no key and no secret; unreadable is an error, never an empty list that a write would then keep.
func Read(ctx sys.Context) (gate.Access, error) {
	raw, err := file.Read(ctx, gate.AccessPath)
	if errors.Is(err, fs.ErrNotExist) {
		return gate.Access{Keys: []gate.Key{}}, nil
	}

	if err != nil {
		return gate.Access{}, err
	}

	var access gate.Access
	if err := json.Unmarshal(raw, &access); err != nil {
		return gate.Access{}, protocol.NewError(contract.ErrorInternal, i18n.T("access.unreadable", gate.AccessPath, err.Error()))
	}

	if access.Keys == nil {
		access.Keys = []gate.Key{}
	}

	return access, nil
}

func Write(ctx sys.Context, access gate.Access) error {
	if err := ctx.Sys().MkdirAll(gate.Dir, 0o700); err != nil {
		return err
	}

	content, err := json.MarshalIndent(access, "", "  ")
	if err != nil {
		return err
	}

	return file.WriteAtomic(ctx, gate.AccessPath, append(content, '\n'), 0o600)
}

// Draws the cookie secret once; the gate refuses to start without one.
func Ensure(ctx sys.Context) (bool, error) {
	access, err := Read(ctx)
	if err != nil {
		return false, err
	}

	if access.Secret != "" && file.SameAt(ctx, gate.AccessPath, mustEncode(access), 0o600) {
		return false, nil
	}

	if access.Secret == "" {
		secret, err := gate.NewSecret()
		if err != nil {
			return false, err
		}

		access.Secret = secret
	}

	return true, Write(ctx, access)
}

func mustEncode(access gate.Access) []byte {
	content, _ := json.MarshalIndent(access, "", "  ")

	return append(content, '\n')
}

// A gate that is not running reads both files when it starts.
func Reload(ctx sys.Context) error {
	if !systemd.Active(ctx, gate.Unit) {
		return nil
	}

	return systemd.Reload(ctx, gate.Unit)
}

func (s *Store) List() ([]Listed, error) {
	access, err := Read(s.options.Ctx)
	if err != nil {
		return nil, err
	}

	return listed(access.Keys), nil
}

func (s *Store) Create(id, name, hash string, projects []string) (Listed, error) {
	var created gate.Key

	err := s.change(func(access *gate.Access) error {
		if _, taken := access.Find(id); taken {
			return protocol.NewError(contract.ErrorBadRequest, i18n.T("access.key.taken", id)).
				WithFix(i18n.T("access.key.taken.fix"))
		}

		created = gate.Key{ID: id, Name: name, Hash: hash, Projects: projects, CreatedAt: s.options.Now().UTC().Format(time.RFC3339)}
		access.Keys = append(access.Keys, created)

		return nil
	})
	if err != nil {
		return Listed{}, err
	}

	return listedOne(created), nil
}

// Scope nil keeps the scope; a scope of null in the request is passed as a pointer to nil.
func (s *Store) Update(id string, name *string, projects *[]string) (Listed, error) {
	var updated gate.Key

	err := s.change(func(access *gate.Access) error {
		at := slices.IndexFunc(access.Keys, func(key gate.Key) bool { return key.ID == id })
		if at < 0 {
			return unknown(id)
		}

		if name != nil {
			access.Keys[at].Name = *name
		}
		if projects != nil {
			access.Keys[at].Projects = *projects
		}

		updated = access.Keys[at]

		return nil
	})
	if err != nil {
		return Listed{}, err
	}

	return listedOne(updated), nil
}

// Revoking a key already gone answers as done: a second click must not read as a failure.
func (s *Store) Revoke(id string) error {
	return s.change(func(access *gate.Access) error {
		access.Keys = slices.DeleteFunc(access.Keys, func(key gate.Key) bool { return key.ID == id })

		return nil
	})
}

func (s *Store) change(apply func(*gate.Access) error) error {
	release, err := lock.Hold(s.options.Lock, lockWait)
	if errors.Is(err, lock.ErrHeld) {
		return protocol.NewError(contract.ErrorBusy, i18n.T("access.busy")).WithFix(i18n.T("access.busy.fix"))
	}

	if err != nil {
		return err
	}
	defer release()

	ctx := s.options.Ctx

	access, err := Read(ctx)
	if err != nil {
		return err
	}

	if access.Secret == "" {
		secret, err := gate.NewSecret()
		if err != nil {
			return err
		}

		access.Secret = secret
	}

	if err := apply(&access); err != nil {
		return err
	}

	if err := Write(ctx, access); err != nil {
		return err
	}

	return Reload(ctx)
}

func unknown(id string) error {
	return protocol.NewError(contract.ErrorBadRequest, i18n.T("access.key.unknown", id)).
		WithFix(i18n.T("access.key.unknown.fix"))
}

func listed(keys []gate.Key) []Listed {
	list := make([]Listed, 0, len(keys))
	for _, key := range keys {
		list = append(list, listedOne(key))
	}

	slices.SortStableFunc(list, func(a, b Listed) int { return strings.Compare(a.CreatedAt, b.CreatedAt) })

	return list
}

func listedOne(key gate.Key) Listed {
	return Listed{ID: key.ID, Name: key.Name, Projects: key.Projects, CreatedAt: key.CreatedAt}
}
