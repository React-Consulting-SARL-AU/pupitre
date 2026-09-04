package platform

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	DefaultBaseURL   = "https://app.pupitre.studio/api/v1"
	DefaultTokenPath = "/etc/pupitre/server.token"
	DefaultMaxBytes  = 128 << 20
	DefaultTimeout   = 5 * time.Minute
	maxRedirects     = 5
)

type Client struct {
	BaseURL  string
	Token    string
	HTTP     *http.Client
	MaxBytes int64
}

type Error struct {
	Path   string
	Status int
	Cause  error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s : %s", e.Path, e.Cause)
	}

	return fmt.Sprintf("%s : la plateforme a répondu %d", e.Path, e.Status)
}

func (e *Error) Unwrap() error {
	return e.Cause
}

func (e *Error) NotFound() bool {
	return e.Status == http.StatusNotFound
}

func (e *Error) Unauthorized() bool {
	return e.Status == http.StatusUnauthorized || e.Status == http.StatusForbidden
}

// The binary of a version, for the architecture the platform knows this server by.
func (c Client) Release(version string) ([]byte, error) {
	return c.get("/agent/release/" + url.PathEscape(version))
}

func (c Client) TargetVersion() (string, error) {
	raw, err := c.get("/agent/state")
	if err != nil {
		return "", err
	}

	var state struct {
		TargetVersion string `json:"target_version"`
	}
	if err := json.Unmarshal(raw, &state); err != nil {
		return "", &Error{Path: "/agent/state", Cause: errors.New("réponse illisible")}
	}

	return state.TargetVersion, nil
}

func (c Client) get(path string) ([]byte, error) {
	base, err := c.base()
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}

	if c.Token == "" {
		return nil, &Error{Path: path, Cause: errors.New("aucun jeton de serveur")}
	}

	request, err := http.NewRequest(http.MethodGet, base+path, nil)
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}
	request.Header.Set("Authorization", "Bearer "+c.Token)
	request.Header.Set("Accept", "*/*")

	response, err := c.client().Do(request)
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, &Error{Path: path, Status: response.StatusCode}
	}

	limit := c.maxBytes()
	body, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}

	if int64(len(body)) > limit {
		return nil, &Error{Path: path, Cause: fmt.Errorf("réponse au-delà de %d octets", limit)}
	}

	return body, nil
}

func (c Client) client() *http.Client {
	client := &http.Client{Timeout: DefaultTimeout}
	if c.HTTP != nil {
		copied := *c.HTTP
		client = &copied
	}
	client.CheckRedirect = dropToken

	return client
}

// The server token stops at the platform: what the redirect points at is a storage URL already signed for this download.
func dropToken(request *http.Request, via []*http.Request) error {
	if len(via) >= maxRedirects {
		return errors.New("trop de redirections")
	}

	request.Header.Del("Authorization")

	return nil
}

func (c Client) maxBytes() int64 {
	if c.MaxBytes > 0 {
		return c.MaxBytes
	}

	return DefaultMaxBytes
}

// Outgoing HTTPS and nothing else: a plaintext address is only tolerated on the loopback, where the tests put their fake platform.
func (c Client) base() (string, error) {
	raw := strings.TrimSuffix(c.BaseURL, "/")
	if raw == "" {
		raw = DefaultBaseURL
	}

	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("adresse de plateforme illisible : %s", raw)
	}

	if parsed.Scheme != "https" && !loopback(parsed.Hostname()) {
		return "", fmt.Errorf("adresse de plateforme non chiffrée : %s", raw)
	}

	return raw, nil
}

func loopback(host string) bool {
	if host == "localhost" {
		return true
	}

	address := net.ParseIP(host)

	return address != nil && address.IsLoopback()
}
