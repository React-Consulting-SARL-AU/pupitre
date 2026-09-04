package cloudflare

import (
	"encoding/json"
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
)

const endpoint = "https://api.cloudflare.com/client/v4"

type api struct {
	ctx     *modules.Context
	token   string
	account string
	zone    string
}

type answer struct {
	Success bool            `json:"success"`
	Errors  []apiError      `json:"errors"`
	Result  json.RawMessage `json:"result"`
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type record struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

// The body travels on the standard input rather than in argv: a tunnel secret has no business in a process listing or in the journal.
func (a api) call(method, url string, body any) (json.RawMessage, error) {
	argv := []string{"curl", "-fsS", "--proto", "=https", "--tlsv1.2", "-X", method, url, "-H", "Authorization: Bearer " + a.token}

	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}

		payload = encoded
		argv = append(argv, "-H", "Content-Type: application/json", "--data-binary", "@-")
	}

	out, err := sys.Exec(a.ctx, sys.Command{Argv: argv, Stdin: payload})
	if err != nil {
		return nil, fmt.Errorf("%s %s : %w", method, path(url), err)
	}

	var parsed answer
	if err := json.Unmarshal([]byte(out.Stdout), &parsed); err != nil {
		return nil, fmt.Errorf("%s %s : réponse illisible de l'API Cloudflare", method, path(url))
	}

	if !parsed.Success {
		return nil, fmt.Errorf("%s %s : %s", method, path(url), reason(parsed.Errors))
	}

	return parsed.Result, nil
}

func (a api) createTunnel(name, secret string) (string, error) {
	raw, err := a.call("POST", endpoint+"/accounts/"+a.account+"/cfd_tunnel",
		map[string]string{"name": name, "tunnel_secret": secret, "config_src": "local"})
	if err != nil {
		return "", err
	}

	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &created); err != nil || created.ID == "" {
		return "", fmt.Errorf("tunnel créé sans identifiant lisible")
	}

	return created.ID, nil
}

func (a api) findTunnel(name string) string {
	raw, err := a.call("GET", endpoint+"/accounts/"+a.account+"/cfd_tunnel?name="+name+"&is_deleted=false", nil)
	if err != nil {
		return ""
	}

	var found []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &found); err != nil || len(found) == 0 {
		return ""
	}

	return found[0].ID
}

func (a api) deleteTunnel(id string) error {
	_, err := a.call("DELETE", endpoint+"/accounts/"+a.account+"/cfd_tunnel/"+id, nil)

	return err
}

func (a api) findRecord(fqdn string) (record, error) {
	raw, err := a.call("GET", endpoint+"/zones/"+a.zone+"/dns_records?name="+fqdn, nil)
	if err != nil {
		return record{}, err
	}

	var found []record
	if err := json.Unmarshal(raw, &found); err != nil || len(found) == 0 {
		return record{}, nil
	}

	return found[0], nil
}

func (a api) createRecord(fqdn, content string) error {
	_, err := a.call("POST", endpoint+"/zones/"+a.zone+"/dns_records",
		map[string]any{"type": "CNAME", "name": fqdn, "content": content, "proxied": true, "comment": comment})

	return err
}

// A record still pointing at a tunnel that no longer exists is error 1033 in the browser: DNS answers, nothing is behind it.
func (a api) updateRecord(id, content string) error {
	_, err := a.call("PATCH", endpoint+"/zones/"+a.zone+"/dns_records/"+id,
		map[string]any{"content": content, "proxied": true, "comment": comment})

	return err
}

func reason(errors []apiError) string {
	if len(errors) == 0 {
		return "réponse en échec sans message"
	}

	messages := make([]string, 0, len(errors))
	for _, failure := range errors {
		messages = append(messages, fmt.Sprintf("%d %s", failure.Code, failure.Message))
	}

	return strings.Join(messages, " · ")
}

func path(url string) string {
	trimmed := strings.TrimPrefix(url, endpoint)
	if query := strings.IndexByte(trimmed, '?'); query >= 0 {
		return trimmed[:query]
	}

	return trimmed
}
