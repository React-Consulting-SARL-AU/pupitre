package platform

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
)

const (
	DefaultBaseURL   = "https://app.pupitre.studio/api/v1"
	DefaultTokenPath = "/etc/pupitre/server.token"

	// Where the platform this server answers to is kept. The enrolment names
	// it, and everything the server does alone afterwards — the heartbeat, the
	// entitlement it renews, the keys it reads — has no one to ask otherwise.
	DefaultBaseURLPath = "/etc/pupitre/platform.url"

	// DefaultServerIDPath keeps what /agent/state names this server: the prefix of its backups in the client's bucket.
	DefaultServerIDPath = "/etc/pupitre/server.id"

	DefaultMaxBytes = 128 << 20
	DefaultTimeout  = 5 * time.Minute
	// Two exchanges fit under the timeout the app grants a command: the agent must answer before the app gives up.
	DefaultControlTimeout = 20 * time.Second
	maxRedirects          = 5
	maxDetailBytes        = 8 << 10
)

type Client struct {
	BaseURL        string
	Token          string
	Version        string
	HTTP           *http.Client
	MaxBytes       int64
	ControlTimeout time.Duration
}

var transport = newTransport()

func newTransport() *http.Transport {
	cloned := http.DefaultTransport.(*http.Transport).Clone()
	cloned.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}

	return cloned
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

// CodeInvalidServerToken is what the platform answers for a token it does not know: a revoked or purged server.
const CodeInvalidServerToken = "invalid_server_token"

// Revoked is the one refusal that says the server itself is gone from the platform, not merely refused today.
func (e *Error) Revoked() bool {
	return e.Status == http.StatusUnauthorized && e.Code == CodeInvalidServerToken
}

// What the platform knows of this server: the entitlement, the keys it asks for, the version it should run.
type State struct {
	Entitlement string    `json:"entitlement"`
	ValidUntil  time.Time `json:"valid_until"`
	// Keys is nil when the platform predates approvals: nothing it says then moves the keys.
	Keys           *[]contract.AgentStateKey `json:"keys"`
	TargetVersion  string                    `json:"target_version"`
	MinimumVersion string                    `json:"minimum_version"`
	Hostname       string                    `json:"hostname"`
	// ServerID names this server on the platform, and its prefix in the backup bucket.
	ServerID string `json:"server_id"`
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
	// The account whose authorized_keys carry the platform's block: the one an app must open the machine with.
	SSHUser string `json:"ssh_user,omitempty"`

	// What the machine measured, beside the percentages computed from it: a
	// console can say "1.8 GB of 556 GB" only if it is told both numbers. Left
	// out when the sonde read nothing, so the platform keeps null rather than
	// recording a machine with no disk at all.
	DiskTotalGB float64 `json:"disk_total_gb,omitempty"`
	DiskFreeGB  float64 `json:"disk_free_gb,omitempty"`
	RAMTotalMB  float64 `json:"ram_total_mb,omitempty"`
	RAMUsedMB   float64 `json:"ram_used_mb,omitempty"`

	// Backup is sent only by a server whose backup module is installed: silence leaves what the platform knew.
	Backup *contract.BackupBeat `json:"backup,omitempty"`

	// Keys is sent once a read of the state has said which keys wait for an approval.
	Keys *contract.KeysBeat `json:"keys,omitempty"`
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
func (c Client) Release(ctx context.Context, version string) ([]byte, error) {
	return c.do(ctx, http.MethodGet, "/agent/release/"+url.PathEscape(version), nil, true, DefaultTimeout)
}

func (c Client) ReleaseMetadata(ctx context.Context, version string) (ReleaseInfo, error) {
	path := "/agent/release/" + url.PathEscape(version) + "/metadata"

	raw, err := c.get(ctx, path)
	if err != nil {
		return ReleaseInfo{}, err
	}

	var info ReleaseInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return ReleaseInfo{}, &Error{Path: path, Cause: ErrUnreadableAnswer}
	}

	if info.SHA256 == "" || info.Signature == "" {
		return ReleaseInfo{}, &Error{Path: path, Cause: fmt.Errorf("%w: without hash or signature", ErrIncompleteAnswer)}
	}

	return info, nil
}

func (c Client) State(ctx context.Context) (State, error) {
	raw, err := c.get(ctx, "/agent/state")
	if err != nil {
		return State{}, err
	}

	var state State
	if err := json.Unmarshal(raw, &state); err != nil {
		return State{}, &Error{Path: "/agent/state", Cause: ErrUnreadableAnswer}
	}

	return state, nil
}

// The only call made without a server token: it is the one that hands one out.
func (c Client) Exchange(ctx context.Context, enrollment Enrollment) (string, error) {
	body, err := json.Marshal(enrollment)
	if err != nil {
		return "", &Error{Path: "/agent/exchange", Cause: err}
	}

	raw, err := c.do(ctx, http.MethodPost, "/agent/exchange", body, false, c.control())
	if err != nil {
		return "", err
	}

	var answer struct {
		ServerToken string `json:"server_token"`
	}
	if err := json.Unmarshal(raw, &answer); err != nil || answer.ServerToken == "" {
		return "", &Error{Path: "/agent/exchange", Cause: fmt.Errorf("%w: without a server token", ErrIncompleteAnswer)}
	}

	return answer.ServerToken, nil
}

func (c Client) Beat(ctx context.Context, beat Heartbeat) error {
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

	_, err = c.do(ctx, http.MethodPost, "/agent/heartbeat", body, true, c.control())

	return err
}

// DeclareBackup tells the platform a backup exists and where; declaring the same one twice is not an error.
func (c Client) DeclareBackup(ctx context.Context, declaration contract.BackupDeclaration) error {
	body, err := json.Marshal(declaration)
	if err != nil {
		return &Error{Path: "/agent/backups", Cause: err}
	}

	_, err = c.do(ctx, http.MethodPost, "/agent/backups", body, true, c.control())

	return err
}

// ForgetBackup withdraws the reference of a backup whose objects left the bucket; one the platform never knew is already gone.
func (c Client) ForgetBackup(ctx context.Context, id string) error {
	path := "/agent/backups/" + url.PathEscape(id)

	_, err := c.do(ctx, http.MethodDelete, path, nil, true, c.control())

	var failure *Error
	if errors.As(err, &failure) && failure.NotFound() {
		return nil
	}

	return err
}

func (c Client) get(ctx context.Context, path string) ([]byte, error) {
	return c.do(ctx, http.MethodGet, path, nil, true, c.control())
}

func (c Client) do(ctx context.Context, method, path string, body []byte, authenticated bool, timeout time.Duration) ([]byte, error) {
	base, err := c.base()
	if err != nil {
		return nil, &Error{Path: path, Cause: err}
	}

	if authenticated && c.Token == "" {
		return nil, &Error{Path: path, Cause: ErrNoToken}
	}

	var payload io.Reader
	if body != nil {
		payload = bytes.NewReader(body)
	}

	request, err := http.NewRequestWithContext(ctx, method, base+path, payload)
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
	request.Header.Set("User-Agent", c.userAgent())

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
		return nil, &Error{Path: path, Cause: fmt.Errorf("%w of %d bytes", ErrOversizedAnswer, limit)}
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

func (c Client) userAgent() string {
	if c.Version == "" {
		return "pupitred"
	}

	return "pupitred/" + c.Version
}

func (c Client) client(timeout time.Duration) *http.Client {
	client := &http.Client{Timeout: timeout, Transport: transport}
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
		return ErrTooManyRedirects
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
