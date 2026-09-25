package platform

import (
	"errors"
	"io/fs"
	"path"
	"strings"

	"pupitre.studio/agent/internal/keys"
	"pupitre.studio/agent/internal/sys"
)

const (
	tokenMode = 0o600
	tokenDir  = 0o700

	// The address is not a secret, and its folder is already root's own.
	urlMode = 0o644
)

var (
	ErrNoToken         = errors.New("no server token: this server is not enrolled")
	ErrServerIDInvalid = errors.New("the platform named this server with an identifier outside the contract")
	ErrServerIDChanged = errors.New("the platform named this server otherwise than the identifier already kept")
)

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

func LoadBaseURL(machine sys.Sys, filePath string) string {
	if filePath == "" {
		filePath = DefaultBaseURLPath
	}

	raw, err := machine.ReadFile(filePath)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}

func SaveBaseURL(machine sys.Sys, filePath, baseURL string) error {
	if filePath == "" {
		filePath = DefaultBaseURLPath
	}

	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return nil
	}

	if err := machine.MkdirAll(path.Dir(filePath), tokenDir); err != nil {
		return err
	}

	return machine.WriteFile(filePath, []byte(baseURL+"\n"), urlMode)
}

func Located(machine sys.Sys, client Client, baseURLPath string) Client {
	if stored := LoadBaseURL(machine, baseURLPath); stored != "" {
		client.BaseURL = stored
	}

	return client
}

func Stored(machine sys.Sys, client Client, tokenPath, baseURLPath string) (Client, error) {
	token, err := LoadToken(machine, tokenPath)
	if err != nil {
		return Client{}, err
	}

	located := Located(machine, client, baseURLPath)
	located.Token = token

	return located, nil
}

func LoadServerID(machine sys.Sys, filePath string) string {
	if filePath == "" {
		filePath = DefaultServerIDPath
	}

	raw, err := machine.ReadFile(filePath)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(raw))
}

// Sticky because approvals are checked against it: only an enrolment, made on the machine, clears it.
func SaveServerID(machine sys.Sys, filePath, id string) (bool, error) {
	if filePath == "" {
		filePath = DefaultServerIDPath
	}

	id = strings.TrimSpace(id)
	if id == "" {
		return false, nil
	}

	if !keys.ValidServerID(id) {
		return false, ErrServerIDInvalid
	}

	stored := LoadServerID(machine, filePath)
	if stored == id {
		return false, nil
	}

	if keys.ValidServerID(stored) {
		return false, ErrServerIDChanged
	}

	if err := machine.MkdirAll(path.Dir(filePath), tokenDir); err != nil {
		return false, err
	}

	return true, machine.WriteFile(filePath, []byte(id+"\n"), urlMode)
}

func ForgetServerID(machine sys.Sys, filePath string) error {
	if filePath == "" {
		filePath = DefaultServerIDPath
	}

	if err := machine.Remove(filePath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	return nil
}

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
