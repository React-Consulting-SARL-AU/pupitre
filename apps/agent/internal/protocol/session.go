package protocol

import (
	"encoding/json"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

type helloParams struct {
	AppVersion string `json:"app_version"`
	Protocol   int    `json:"protocol"`
	Locale     string `json:"locale"`
}

type helloResult struct {
	AgentVersion string               `json:"agent_version"`
	Protocol     int                  `json:"protocol"`
	ServerID     string               `json:"server_id,omitempty"`
	Entitlement  contract.Entitlement `json:"entitlement"`
	Capabilities []string             `json:"capabilities"`
	// An agent from before the ledger answers without this field, and the app
	// takes that server for one whose configuration is current — which it is,
	// since nothing had changed shape yet.
	Config *contract.ConfigRevision `json:"config,omitempty"`
}

type pingResult struct {
	Timestamp string `json:"ts"`
}

func (s *Server) hello(ctx *Context, raw json.RawMessage) (any, error) {
	var params helloParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, badRequest(i18n.T("protocol.params.invalid", err.Error()))
	}

	if params.Protocol != contract.ProtocolVersion {
		return nil, s.mismatch(params.AppVersion, params.Protocol)
	}

	// The locale holds for the whole session: everything the server answers afterward is written in it.
	if params.Locale != "" {
		i18n.Use(params.Locale)
	}

	// A direct Call carries no session: nothing to greet, the answer is the same.
	if ctx.session != nil {
		ctx.session.greeted = true
	}

	return helloResult{
		AgentVersion: s.options.AgentVersion,
		Protocol:     contract.ProtocolVersion,
		ServerID:     s.serverID(),
		Entitlement:  s.Entitlement().Entitlement,
		Capabilities: s.Capabilities(),
		Config:       s.config(),
	}, nil
}

func (s *Server) serverID() string {
	if s.options.ServerID == nil {
		return ""
	}

	return s.options.ServerID()
}

func (s *Server) config() *contract.ConfigRevision {
	if s.options.Config == nil {
		return nil
	}

	config := s.Config()

	return &config
}

// mismatch: the compatibility sheet says which side is behind; without it — a dev build on both sides — only the protocol number is left, which does not say what to update.
func (s *Server) mismatch(appVersion string, spoken int) error {
	agentVersion := s.options.AgentVersion

	switch contract.Compatibility(appVersion, agentVersion) {
	case contract.VerdictAppTooOld:
		floor := contract.AppFloor(agentVersion)

		return NewError(contract.ErrorProtocolMismatch,
			i18n.T("protocol.app.too_old", appVersion, agentVersion, floor)).
			WithFix(i18n.T("protocol.app.too_old.fix", floor))
	case contract.VerdictAgentTooOld:
		floor := contract.AgentFloor(appVersion)

		return NewError(contract.ErrorProtocolMismatch,
			i18n.T("protocol.agent.too_old", agentVersion, appVersion, floor)).
			WithFix(i18n.T("protocol.agent.too_old.fix", floor))
	default:
		return NewError(contract.ErrorProtocolMismatch,
			i18n.T("protocol.mismatch", spoken, contract.ProtocolVersion)).
			WithFix(i18n.T("protocol.mismatch.fix", contract.ProtocolVersion))
	}
}

func (s *Server) ping(_ *Context, _ json.RawMessage) (any, error) {
	return pingResult{Timestamp: s.options.Now().UTC().Format(time.RFC3339)}, nil
}
