package shots

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

// Read by systemd as the gallery's EnvironmentFile, as root, before it drops to dev.
const (
	ExposurePath = "/etc/pupitre/shots.env"
	RouteLabel   = "shots"

	TokenKey = "PUPITRE_SHOTS_TOKEN"

	hostnameKey = "PUPITRE_SHOTS_HOSTNAME"
	tokenBytes  = 16
)

// The token is the first segment of every public address: the gallery has no login.
type Exposure struct {
	Hostname string
	Token    string
}

func (e Exposure) Published() bool {
	return e.Hostname != "" && e.Token != ""
}

func (e Exposure) Base() string {
	return "https://" + e.Hostname + "/" + e.Token
}

func (e Exposure) Content() []byte {
	return fmt.Appendf(nil, "%s=%s\n%s=%s\n", hostnameKey, e.Hostname, TokenKey, e.Token)
}

// Absent or unreadable reads as unpublished: dev cannot read it, and asks the agent instead.
func ReadExposure(ctx sys.Context) Exposure {
	raw, err := file.Read(ctx, ExposurePath)
	if err != nil {
		return Exposure{}
	}

	var exposure Exposure

	for _, line := range strings.Split(string(raw), "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), "=")
		if !found {
			continue
		}

		switch key {
		case hostnameKey:
			exposure.Hostname = value
		case TokenKey:
			exposure.Token = value
		}
	}

	return exposure
}

func WriteExposure(ctx sys.Context, exposure Exposure) error {
	return file.WriteAtomic(ctx, ExposurePath, exposure.Content(), 0o600)
}

func NewToken() (string, error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return hex.EncodeToString(raw), nil
}
