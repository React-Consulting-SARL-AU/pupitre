package contract

// KeyApprovalRulesConstants is what packages/shared fixes for an approval: the
// hashes, the age window, the key types and the patterns the agent holds a key
// and a server to.
type KeyApprovalRulesConstants struct {
	Hashes             []string `json:"hashes"`
	MaxAgeSeconds      int      `json:"max_age_seconds"`
	FutureSkewSeconds  int      `json:"future_skew_seconds"`
	KeyTypes           []string `json:"key_types"`
	KeyPattern         string   `json:"key_pattern"`
	FingerprintPattern string   `json:"fingerprint_pattern"`
	ServerIDPattern    string   `json:"server_id_pattern"`
}

var KeyApprovalRules = constOf[KeyApprovalRulesConstants]("KeyApprovalRules")

// KeyApproval is an SSHSIG made by a device the server already trusts, admitting one key on one server.
type KeyApproval struct {
	ServerID  string `json:"server_id"`
	PublicKey string `json:"public_key"`
	UserID    string `json:"user_id"`
	IssuedAt  string `json:"issued_at"`
	Signer    string `json:"signer"`
	Signature string `json:"signature"`
}

// AgentStateKey is one key the platform wants on this server, with every approval it holds for it.
type AgentStateKey struct {
	PublicKey string        `json:"public_key"`
	UserID    string        `json:"user_id"`
	DeviceID  string        `json:"device_id"`
	Approvals []KeyApproval `json:"approvals"`
}

// KeysBeat is what the heartbeat says of the keys: fingerprints only.
type KeysBeat struct {
	Signers []string `json:"signers"`
	Pending []string `json:"pending"`
}
