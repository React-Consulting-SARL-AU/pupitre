package net

import (
	"io/fs"
	"os"
	"testing"

	"pupitre.studio/agent/internal/sys"
)

// A machine of two files. The shared fake lives under internal/modules, which reads this package: borrowing it here would be a cycle.
type machine struct {
	files map[string][]byte
}

func (m machine) Sys() sys.Sys                       { return m }
func (machine) Logf(string, ...any)                  {}
func (machine) Once(_ string, fn func() error) error { return fn() }

func (m machine) ReadFile(path string) ([]byte, error) {
	content, ok := m.files[path]
	if !ok {
		return nil, os.ErrNotExist
	}

	return content, nil
}

func (machine) Run(sys.Command) (sys.Output, error)         { return sys.Output{}, nil }
func (machine) ReadDir(string) ([]sys.Entry, error)         { return nil, os.ErrNotExist }
func (machine) WriteFile(string, []byte, fs.FileMode) error { return nil }
func (machine) Remove(string) error                         { return nil }
func (machine) Exists(string) (bool, error)                 { return false, nil }
func (machine) Chown(string, string, string) error          { return nil }
func (machine) MkdirAll(string, fs.FileMode) error          { return nil }

const table = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1538 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000 100 0 0 10 0
   1: 0100007F:1F90 0100007F:C350 01 00000000:00000000 00:00000000 00000000     0        0 12346 1 0000 100 0 0 10 0
`

const table6 = `  sl  local_address                         remote_address                        st
   0: 00000000000000000000000000000000:0016 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 1 1 0 100 0 0 10 0
`

func TestListeningReadsBothTables(t *testing.T) {
	ports := Listening(machine{files: map[string][]byte{
		"/proc/net/tcp":  []byte(table),
		"/proc/net/tcp6": []byte(table6),
	}})

	if !ports[5432] {
		t.Errorf("5432 is listening, ports = %v", ports)
	}

	if !ports[22] {
		t.Errorf("22 is listening on IPv6, ports = %v", ports)
	}

	// An established connection is not a socket anyone is waiting on.
	if ports[8080] {
		t.Errorf("8080 is connected, not listening: %v", ports)
	}
}

func TestAMachineWithoutTheTablesListensToNothing(t *testing.T) {
	if len(Listening(machine{})) != 0 {
		t.Fatal("an unreadable table is no port at all")
	}
}
