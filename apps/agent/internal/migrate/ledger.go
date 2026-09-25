package migrate

import (
	"encoding/json"
	"errors"
	"io/fs"

	"pupitre.studio/agent/internal/sys"
)

// The ledger, as the machine remembers it.
//
// One line per migration, ever: it is the audit trail a diagnostic needs, and
// it stays small because shapes change far less often than versions do.
type Ledger struct {
	Revision int `json:"revision"`
	// The agent that last wrote the ledger, for a reader looking at a machine
	// nobody has touched in a year. Nothing is decided on it.
	AgentVersion string    `json:"agent_version,omitempty"`
	Applied      []Applied `json:"applied"`
}

type Applied struct {
	ID           int    `json:"id"`
	Slug         string `json:"slug"`
	At           string `json:"at"`
	AgentVersion string `json:"agent_version,omitempty"`
	Ms           int64  `json:"ms"`
}

// A missing ledger reads as revision zero, and revision zero runs every
// migration: a machine configured before the ledger existed owes them all, and
// they are idempotent. A ledger that is there and does not read is refused: it
// may belong to a newer agent, whose shapes a replay from zero would take for
// the oldest ones.
func readLedger(machine sys.Sys, path string) (Ledger, error) {
	raw, err := machine.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return Ledger{}, nil
	}
	if err != nil {
		return Ledger{}, unreadableLedger(path, err)
	}

	var ledger Ledger
	if err := json.Unmarshal(raw, &ledger); err != nil {
		return Ledger{}, unreadableLedger(path, err)
	}

	return ledger, nil
}

func writeLedger(ctx *Context, path string, ledger Ledger) error {
	if ledger.Applied == nil {
		ledger.Applied = []Applied{}
	}

	encoded, err := json.MarshalIndent(ledger, "", "  ")
	if err != nil {
		return err
	}

	return ctx.write(path, append(encoded, '\n'))
}
