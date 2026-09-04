package modules

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type journal struct {
	file    *os.File
	now     func() time.Time
	secrets []string
	memory  []string
}

func openJournal(path string, now func() time.Time) *journal {
	j := &journal{now: now}
	if path == "" {
		return j
	}

	os.MkdirAll(filepath.Dir(path), 0o755)

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err == nil {
		j.file = file
	}

	return j
}

func (j *journal) hide(secret string) {
	j.secrets = append(j.secrets, secret)
}

func (j *journal) redact(text string) string {
	for _, secret := range j.secrets {
		text = strings.ReplaceAll(text, secret, "[secret]")
	}

	return text
}

func (j *journal) logf(module, format string, args ...any) {
	text := j.redact(fmt.Sprintf(format, args...))
	line := fmt.Sprintf("%s [%s] %s", j.now().UTC().Format(time.RFC3339), module, text)

	j.memory = append(j.memory, line)

	if j.file != nil {
		fmt.Fprintln(j.file, line)
	}
}

func (j *journal) lines() []string {
	return append([]string(nil), j.memory...)
}

func (j *journal) close() {
	if j.file != nil {
		j.file.Close()
		j.file = nil
	}
}
