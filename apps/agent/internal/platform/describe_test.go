package platform_test

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/platform"
)

func TestDescribeTellsAnEdgeWithoutThePlatformBehindIt(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(530)
	}))
	defer server.Close()

	i18n.Use("fr")
	defer i18n.Use("en")

	_, err := platform.Client{BaseURL: server.URL}.Exchange(context.Background(), platform.Enrollment{Token: "x"})

	if !platform.Down(err) {
		t.Fatalf("a 530 is the platform's edge answering alone, got %v", err)
	}

	described := platform.Describe(err)
	if described != "la plateforme ne répond pas derrière son adresse (HTTP 530)" {
		t.Fatalf("described = %q", described)
	}

	if strings.Contains(described, "/agent/exchange") || strings.Contains(described, "answered") {
		t.Fatalf("the path and the English do not belong to the reader: %q", described)
	}
}

func TestDescribeKeepsThePlatformsOwnRefusal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		w.Write([]byte(`{"error":{"code":"enrollment_used","message":"jeton déjà échangé"}}`))
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL}.Exchange(context.Background(), platform.Enrollment{Token: "x"})

	if platform.Down(err) {
		t.Fatal("a refusal with a body is the platform speaking, not its edge")
	}

	if described := platform.Describe(err); described != "jeton déjà échangé (409)" {
		t.Fatalf("described = %q", described)
	}
}

func TestDescribeNamesTheHostTheDNSDoesNotKnow(t *testing.T) {
	_, err := platform.Client{BaseURL: "https://nowhere.invalid"}.Exchange(context.Background(), platform.Enrollment{Token: "x"})

	var dns *net.DNSError
	if !errors.As(err, &dns) {
		t.Skipf("the resolver of this machine answered otherwise: %v", err)
	}

	if described := platform.Describe(err); described != "nowhere.invalid has no address known to this server's DNS" {
		t.Fatalf("described = %q", described)
	}
}

func TestDescribeTellsATimeoutFromTheRest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		time.Sleep(200 * time.Millisecond)
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL, ControlTimeout: 20 * time.Millisecond}.Exchange(context.Background(), platform.Enrollment{Token: "x"})

	if described := platform.Describe(err); described != "the platform did not answer in time" {
		t.Fatalf("described = %q", described)
	}
}

func TestDescribeTellsAnAnswerNobodyCanRead(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("not json"))
	}))
	defer server.Close()

	_, err := platform.Client{BaseURL: server.URL}.Exchange(context.Background(), platform.Enrollment{Token: "x"})

	if described := platform.Describe(err); described != "the platform's answer is incomplete" {
		t.Fatalf("described = %q", described)
	}

	if !errors.Is(err, platform.ErrIncompleteAnswer) {
		t.Fatalf("the cause must stay reachable for the code: %v", err)
	}
}

func TestDescribeLeavesAForeignErrorAlone(t *testing.T) {
	if described := platform.Describe(errors.New("disk full")); described != "disk full" {
		t.Fatalf("described = %q", described)
	}
}
