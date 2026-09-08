package release

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	DefaultAPIBaseURL = "https://app.pupitre.studio/api/v1"
	publishTimeout    = 30 * time.Second
	maxDetailBytes    = 8 << 10
)

type API struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

type APIError struct {
	Path    string
	Status  int
	Code    string
	Message string
	Fix     string
}

func (e *APIError) Error() string {
	if e.Message == "" {
		return fmt.Sprintf("%s: the platform answered %d", e.Path, e.Status)
	}

	return fmt.Sprintf("%s : %s %s (%d)", e.Path, e.Code, e.Message, e.Status)
}

// The platform answers 201 on the first publication and 200 when the CI replays the same one, so a rerun of the workflow is not an error.
func (a API) Publish(publication Publication) (Publication, bool, error) {
	body, status, err := a.post("/admin/releases", publication)
	if err != nil {
		return Publication{}, false, err
	}

	var answer struct {
		Data Publication `json:"data"`
	}

	if err := json.Unmarshal(body, &answer); err != nil {
		return Publication{}, false, fmt.Errorf("/admin/releases: unreadable answer: %w", err)
	}

	return answer.Data, status == http.StatusCreated, nil
}

func (a API) Promote(version, channel string) ([]Publication, error) {
	path := "/admin/releases/" + version + "/promote"

	body, _, err := a.post(path, map[string]string{"channel": channel})
	if err != nil {
		return nil, err
	}

	var answer struct {
		Data []Publication `json:"data"`
	}

	if err := json.Unmarshal(body, &answer); err != nil {
		return nil, fmt.Errorf("%s: unreadable answer: %w", path, err)
	}

	return answer.Data, nil
}

func (a API) post(path string, payload any) ([]byte, int, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}

	request, err := http.NewRequest(http.MethodPost, a.baseURL()+path, bytes.NewReader(encoded))
	if err != nil {
		return nil, 0, err
	}

	request.Header.Set("content-type", "application/json")
	request.Header.Set("authorization", "Bearer "+a.Token)

	response, err := a.client().Do(request)
	if err != nil {
		return nil, 0, fmt.Errorf("%s : %w", path, err)
	}

	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxDetailBytes))
	if err != nil {
		return nil, 0, fmt.Errorf("%s : %w", path, err)
	}

	if response.StatusCode >= http.StatusBadRequest {
		return nil, response.StatusCode, failure(path, response.StatusCode, body)
	}

	return body, response.StatusCode, nil
}

func failure(path string, status int, body []byte) error {
	var answer struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
			Fix     string `json:"fix"`
		} `json:"error"`
	}

	_ = json.Unmarshal(body, &answer)

	return &APIError{
		Path:    path,
		Status:  status,
		Code:    answer.Error.Code,
		Message: answer.Error.Message,
		Fix:     answer.Error.Fix,
	}
}

func (a API) baseURL() string {
	if a.BaseURL == "" {
		return DefaultAPIBaseURL
	}

	return strings.TrimSuffix(a.BaseURL, "/")
}

func (a API) client() *http.Client {
	if a.HTTP != nil {
		return a.HTTP
	}

	return &http.Client{Timeout: publishTimeout}
}
