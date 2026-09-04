package platform

import (
	"errors"
	"strings"

	"pupitre.studio/agent/internal/sys"
)

var ErrNoToken = errors.New("aucun jeton de serveur : ce serveur n'est pas enrôlé")

func LoadToken(machine sys.Sys, path string) (string, error) {
	if path == "" {
		path = DefaultTokenPath
	}

	raw, err := machine.ReadFile(path)
	if err != nil {
		return "", ErrNoToken
	}

	token := strings.TrimSpace(string(raw))
	if token == "" {
		return "", ErrNoToken
	}

	return token, nil
}
