package protocol

import (
	"encoding/json"
	"fmt"
	"time"

	"pupitre.sh/agent/internal/contract"
)

type helloParams struct {
	AppVersion string `json:"app_version"`
	Protocol   int    `json:"protocol"`
}

type helloResult struct {
	AgentVersion string               `json:"agent_version"`
	Protocol     int                  `json:"protocol"`
	ServerID     string               `json:"server_id,omitempty"`
	Entitlement  contract.Entitlement `json:"entitlement"`
	Capabilities []string             `json:"capabilities"`
}

type pingResult struct {
	Timestamp string `json:"ts"`
}

func (s *Server) hello(ctx *Context, raw json.RawMessage) (any, error) {
	var params helloParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, badRequest("paramètres invalides : " + err.Error())
	}

	if params.Protocol != contract.ProtocolVersion {
		return nil, NewError(contract.ErrorProtocolMismatch,
			fmt.Sprintf("protocole %d non pris en charge : cet agent parle le protocole %d", params.Protocol, contract.ProtocolVersion)).
			WithFix(fmt.Sprintf("Mets à jour l'agent avec agent.upgrade, ou l'app, jusqu'au protocole %d.", contract.ProtocolVersion))
	}

	ctx.session.greeted = true

	return helloResult{
		AgentVersion: s.options.AgentVersion,
		Protocol:     contract.ProtocolVersion,
		Entitlement:  s.options.Entitlement,
		Capabilities: s.Capabilities(),
	}, nil
}

func (s *Server) ping(_ *Context, _ json.RawMessage) (any, error) {
	return pingResult{Timestamp: s.options.Now().UTC().Format(time.RFC3339)}, nil
}
