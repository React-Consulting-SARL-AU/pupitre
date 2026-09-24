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

	// The address is not a secret; the folder it sits in is already root's own.
	urlMode = 0o644
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

// LoadBaseURL is the platform this server was enrolled with, or nothing when it
// was enrolled by a build that named none.
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

// Located is the client aimed at the platform this server was enrolled with, when the enrolment wrote one down.
func Located(machine sys.Sys, client Client, baseURLPath string) Client {
	if stored := LoadBaseURL(machine, baseURLPath); stored != "" {
		client.BaseURL = stored
	}

	return client
}

// Stored is the client this server speaks to the platform with on its own: the platform it was enrolled with, and its token.
func Stored(machine sys.Sys, client Client, tokenPath, baseURLPath string) (Client, error) {
	token, err := LoadToken(machine, tokenPath)
	if err != nil {
		return Client{}, err
	}

	located := Located(machine, client, baseURLPath)
	located.Token = token

	return located, nil
}

// LoadServerID is this server's identifier on the platform, once a read of /agent/state has named it.
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

// SaveServerID writes the identifier down when it changed, and says whether it did.
func SaveServerID(machine sys.Sys, filePath, id string) (bool, error) {
	if filePath == "" {
		filePath = DefaultServerIDPath
	}

	id = strings.TrimSpace(id)
	if id == "" || LoadServerID(machine, filePath) == id {
		return false, nil
	}

	if err := machine.MkdirAll(path.Dir(filePath), tokenDir); err != nil {
		return false, err
	}

	return true, machine.WriteFile(filePath, []byte(id+"\n"), urlMode)
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
