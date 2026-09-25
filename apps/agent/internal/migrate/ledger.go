package migrate

import (
	"encoding/json"
	"errors"
	"io/fs"

	"pupitre.studio/agent/internal/sys"
)

type Ledger struct {
	Revision     int       `json:"revision"`
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

// Missing reads as revision 0 (migrations are idempotent); unreadable is refused, as it may be a newer agent's.
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
