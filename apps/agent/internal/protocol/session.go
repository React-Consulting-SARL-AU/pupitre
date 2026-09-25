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
	// Absent from pre-ledger agents, which the app rightly reads as a current configuration.
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

	// The same protocol is not enough: an app below this agent's floor cannot open the session its gestures need.
	if contract.Compatibility(params.AppVersion, s.options.AgentVersion) == contract.VerdictAppTooOld && contract.AppFloor(s.options.AgentVersion) != "" {
		return nil, s.appTooOld(params.AppVersion)
	}

	if params.Locale != "" {
		i18n.Use(params.Locale)
	}

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

// Without a compatibility sheet entry (dev builds) only the protocol number is left, which cannot say which side is behind.
func (s *Server) mismatch(appVersion string, spoken int) error {
	agentVersion := s.options.AgentVersion

	switch contract.Compatibility(appVersion, agentVersion) {
	case contract.VerdictAppTooOld:
		return s.appTooOld(appVersion)
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

func (s *Server) appTooOld(appVersion string) error {
	agentVersion := s.options.AgentVersion
	floor := contract.AppFloor(agentVersion)

	return NewError(contract.ErrorProtocolMismatch,
		i18n.T("protocol.app.too_old", appVersion, agentVersion, floor)).
		WithFix(i18n.T("protocol.app.too_old.fix", floor))
}

func (s *Server) ping(_ *Context, _ json.RawMessage) (any, error) {
	return pingResult{Timestamp: s.options.Now().UTC().Format(time.RFC3339)}, nil
}
