package platform

import (
	"errors"
	"path"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

const (
	tokenMode = 0o600
	tokenDir  = 0o700
)

var ErrNoToken = errors.New("no server token: this server is not enrolled")

func LoadToken(machine sys.Sys, filePath string) (string, error) {
	if filePath == "" {
		filePath = DefaultTokenPath
	}

	raw, err := machine.ReadFile(filePath)
	if err != nil {
		return "", ErrNoToken
	}

	token := strings.TrimSpace(string(raw))
	if token == "" {
		return "", ErrNoToken
	}

	return token, nil
}

func Enrolled(machine sys.Sys, filePath string) bool {
	_, err := LoadToken(machine, filePath)

	return err == nil
}

// Root only, and nothing else on the disk says it: the token is the whole of what ties this binary to a server.
func SaveToken(machine sys.Sys, filePath, token string) error {
	if filePath == "" {
		filePath = DefaultTokenPath
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return errors.New("empty server token")
	}

	if err := machine.MkdirAll(path.Dir(filePath), tokenDir); err != nil {
		return err
	}

	return machine.WriteFile(filePath, []byte(token+"\n"), tokenMode)
}
