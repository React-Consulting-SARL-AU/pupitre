package platform

import (
	"bytes"
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

	// Where the platform this server answers to is kept. The enrolment names
	// it, and everything the server does alone afterwards — the heartbeat, the
	// entitlement it renews, the keys it reads — has no one to ask otherwise.
	DefaultBaseURLPath = "/etc/pupitre/platform.url"
	DefaultMaxBytes    = 128 << 20
	DefaultTimeout     = 5 * time.Minute
	// Two exchanges fit under the timeout the app grants a command: the agent must answer before the app gives up.
	DefaultControlTimeout = 20 * time.Second
	maxRedirects          = 5
	maxDetailBytes        = 8 << 10
)

type Client struct {
	BaseURL        string
	Token          string
	HTTP           *http.Client
	MaxBytes       int64
	ControlTimeout time.Duration
}

type Error struct {
	Path    string
	Status  int
	Code    string
	Message string
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s : %s", e.Path, e.Cause)
	}

	if e.Message != "" {
		return fmt.Sprintf("%s : %s (%d)", e.Path, e.Message, e.Status)
	}

	return fmt.Sprintf("%s : the platform answered %d", e.Path, e.Status)
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

// What the platform knows of this server: the entitlement, the keys that open it, the version it should run.
type State struct {
	Entitlement    string    `json:"entitlement"`
	ValidUntil     time.Time `json:"valid_until"`
	AuthorizedKeys []string  `json:"authorized_keys"`
	TargetVersion  string    `json:"target_version"`
	MinimumVersion string    `json:"minimum_version"`
	Hostname       string    `json:"hostname"`
}

type Enrollment struct {
	Token         string `json:"enrollment_token"`
	HostPublicKey string `json:"host_public_key"`
	AgentVersion  string `json:"agent_version"`
	Arch          string `json:"arch"`
}

type Heartbeat struct {
	Disk         float64  `json:"disk"`
	RAM          float64  `json:"ram"`
	Load         float64  `json:"load"`
	Sessions     []string `json:"sessions"`
	StackVersion string   `json:"stack_version"`
	Modules      []string `json:"modules"`
	AgentVersion string   `json:"agent_version,omitempty"`
}

// What the publication chain deposited for a version: the platform's own word on what the binary must hash to, and the signature that binds it.
type ReleaseInfo struct {
	Version   string `json:"version"`
	Arch      string `json:"arch"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature"`
	Channel   string `json:"channel"`
}

// The binary of a version, for the architecture the platform knows this server by.
func (c Client) Release(version string) ([]byte, error) {
	return c.do(http.MethodGet, "/agent/release/"+url.PathEscape(version), nil, true, DefaultTimeout)
}

func (c Client) ReleaseMetadata(version string) (ReleaseInfo, error) {
	path := "/agent/release/" + url.PathEscape(version) + "/metadata"

	raw, err := c.get(path)
	if err != nil {
		return ReleaseInfo{}, err
	}

	var info ReleaseInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return ReleaseInfo{}, &Error{Path: path, Cause: errors.New("unreadable answer")}
	}

	if info.SHA256 == "" || info.Signature == "" {
		return ReleaseInfo{}, &Error{Path: path, Cause: errors.New("answer without hash or signature")}
	}

	return info, nil
}

func (c Client) State() (State, error) {
	raw, err := c.get("/agent/state")
	if err != nil {
		return State{}, err
	}

	var state State
	if err := json.Unmarshal(raw, &state); err != nil {
		return State{}, &Error{Path: "/agent/state", Cause: errors.New("unreadable answer")}
	}

	return state, nil
}

// The only call made without a server token: it is the one that hands one out.
func (c Client) Exchange(enrollment Enrollment) (string, error) {
	body, err := json.Marshal(enrollment)
	if err != nil {
		return "", &Error{Path: "/agent/exchange", Cause: err}
	}

	raw, err := c.do(http.MethodPost, "/agent/exchange", body, false, c.control())
	if err != nil {
		return "", err
	}

	var answer struct {
		ServerToken string `json:"server_token"`
	}
	if err := json.Unmarshal(raw, &answer); err != nil || answer.ServerToken == "" {
		return "", &Error{Path: "/agent/exchange", Cause: errors.New("answer without a server token")}
	}

	return answer.ServerToken, nil
}

func (c Client) Beat(beat Heartbeat) error {
	if beat.Sessions == nil {
		beat.Sessions = []string{}
	}
	if beat.Modules == nil {
		beat.Modules = []string{}
	}

	body, err := json.Marshal(beat)
	if err != nil {
		return &Error{Path: "/agent/heartbeat", Cause: err}
	}

	_, err = c.do(http.MethodPost, "/agent/heartbeat", body, true, c.control())

	return err
}

func (c Client) get(path string) ([]byte, error) {
	return c.do(http.MethodGet, path, nil, true, c.control())
}

func (c Client) do(method, path string, body []byte, authenticated bool, timeout time.Duration) ([]byte, error) {
	base, err := c.base()
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}

	if authenticated && c.Token == "" {
		return nil, &Error{Path: path, Cause: errors.New("no server token")}
	}

	var payload io.Reader
	if body != nil {
		payload = bytes.NewReader(body)
	}

	request, err := http.NewRequest(method, base+path, payload)
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}

	if authenticated {
		request.Header.Set("Authorization", "Bearer "+c.Token)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	request.Header.Set("Accept", "*/*")

	response, err := c.client(timeout).Do(request)
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode > 299 {
		return nil, refusal(path, response)
	}

	limit := c.maxBytes()
	answer, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}

	if int64(len(answer)) > limit {
		return nil, &Error{Path: path, Cause: fmt.Errorf("answer beyond %d bytes", limit)}
	}

	return answer, nil
}

// A refusal comes as { error: { code, message, fix? } }; keeping the code is what tells a revoked token apart from a network that flinched.
func refusal(path string, response *http.Response) *Error {
	failure := &Error{Path: path, Status: response.StatusCode}

	raw, err := io.ReadAll(io.LimitReader(response.Body, maxDetailBytes))
	if err != nil {
		return failure
	}

	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &body); err == nil {
		failure.Code = body.Error.Code
		failure.Message = body.Error.Message
	}

	return failure
}

func (c Client) client(timeout time.Duration) *http.Client {
	client := &http.Client{Timeout: timeout}
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
		return errors.New("too many redirects")
	}

	request.Header.Del("Authorization")

	return nil
}

func (c Client) control() time.Duration {
	if c.ControlTimeout > 0 {
		return c.ControlTimeout
	}

	return DefaultControlTimeout
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
		return "", fmt.Errorf("unreadable platform address: %s", raw)
	}

	if parsed.Scheme != "https" && !loopback(parsed.Hostname()) {
		return "", fmt.Errorf("plaintext platform address: %s", raw)
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
