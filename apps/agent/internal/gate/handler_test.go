package gate

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

const (
	shopKey  = "ppk_shopkey00001_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	otherKey = "ppk_otherkey0001_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	allKey   = "ppk_allprojects1_cccccccccccccccccccccccccccccccc"
	secret   = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
)

type seen struct {
	Host      string `json:"host"`
	URI       string `json:"uri"`
	Key       string `json:"key"`
	Cookie    string `json:"cookie"`
	Identity  string `json:"identity"`
	Forwarded string `json:"forwarded"`
}

func upstream(t *testing.T) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(seen{
			Host:      r.Host,
			URI:       r.URL.RequestURI(),
			Key:       r.Header.Get(Header),
			Cookie:    r.Header.Get("Cookie"),
			Identity:  r.Header.Get(IdentityHeader),
			Forwarded: r.Header.Get("X-Forwarded-Host"),
		})
	}))
	t.Cleanup(server.Close)

	return server
}

func gateFor(t *testing.T) *Gate {
	t.Helper()

	origin := strings.TrimPrefix(upstream(t).URL, "http://")

	g := New()
	g.Load(Access{
		Secret: secret,
		Keys: []Key{
			{ID: "shopkey00001", Name: "Simulateur iOS", Hash: Hash(shopKey), Projects: []string{"shop"}},
			{ID: "otherkey0001", Name: "Other", Hash: Hash(otherKey), Projects: []string{"blog"}},
			{ID: "allprojects1", Name: "Ce Mac", Hash: Hash(allKey)},
		},
	}, []Route{
		{Hostname: "shop.example.dev", Upstream: origin, Project: "shop", Protected: true},
		{Hostname: "hooks.example.dev", Upstream: origin, Project: "shop", Protected: false},
	})

	return g
}

func request(method, target string, headers map[string]string) *http.Request {
	r := httptest.NewRequest(method, target, nil)
	for name, value := range headers {
		r.Header.Set(name, value)
	}

	return r
}

func serve(g *Gate, r *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	g.ServeHTTP(w, r)

	return w
}

func decoded(t *testing.T, w *httptest.ResponseRecorder) seen {
	t.Helper()

	if w.Code != http.StatusOK {
		t.Fatalf("status %d, want the site's answer: %s", w.Code, w.Body.String())
	}

	var got seen
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("not the site's answer: %s", w.Body.String())
	}

	return got
}

func TestAHeaderKeyReachesTheSiteWithoutTheKey(t *testing.T) {
	g := gateFor(t)

	got := decoded(t, serve(g, request("GET", "https://shop.example.dev/api/cart?id=3", map[string]string{Header: shopKey, "Authorization": "Bearer site"})))

	if got.Key != "" {
		t.Fatalf("the site must never see the key: %+v", got)
	}

	if got.URI != "/api/cart?id=3" || got.Identity != "Simulateur%20iOS" || got.Forwarded != "shop.example.dev" {
		t.Fatalf("got %+v", got)
	}

	if strings.Contains(got.Host, "example.dev") {
		t.Fatalf("the site must see its own origin as Host, as the exposure sent it: %+v", got)
	}
}

func TestTheSitesOwnAuthorizationIsLeftAlone(t *testing.T) {
	g := gateFor(t)

	r := request("GET", "https://shop.example.dev/", map[string]string{Header: shopKey})
	r.Header.Set("Authorization", "Bearer site-token")

	upstreamSeen := ""
	origin := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		upstreamSeen = r.Header.Get("Authorization")
	}))
	defer origin.Close()

	g.Load(g.access, []Route{{Hostname: "shop.example.dev", Upstream: strings.TrimPrefix(origin.URL, "http://"), Project: "shop", Protected: true}})

	serve(g, r)

	if upstreamSeen != "Bearer site-token" {
		t.Fatalf("Authorization = %q, want the site's own", upstreamSeen)
	}
}

func TestAKeyForAnotherProjectIsRefused(t *testing.T) {
	g := gateFor(t)

	w := serve(g, request("GET", "https://shop.example.dev/api", map[string]string{Header: otherKey, "Accept": "application/json"}))

	if w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), `"code":"access_required"`) {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
}

func TestAServerWideKeyOpensEveryProject(t *testing.T) {
	g := gateFor(t)

	decoded(t, serve(g, request("GET", "https://shop.example.dev/", map[string]string{Header: allKey})))
}

func TestAPublicProcessAnswersWithoutAKey(t *testing.T) {
	g := gateFor(t)

	got := decoded(t, serve(g, request("POST", "https://hooks.example.dev/stripe?x=1", map[string]string{IdentityHeader: "forged"})))

	if got.URI != "/stripe?x=1" || got.Identity != "" {
		t.Fatalf("got %+v, want the request untouched and no forged identity", got)
	}
}

func TestAForgedIdentityNeverReachesTheSite(t *testing.T) {
	g := gateFor(t)

	got := decoded(t, serve(g, request("GET", "https://shop.example.dev/", map[string]string{Header: shopKey, IdentityHeader: "admin"})))

	if got.Identity != "Simulateur%20iOS" {
		t.Fatalf("identity %q, want the key's name", got.Identity)
	}
}

func TestABrowserWithoutAKeyGetsTheLoginPageAtTheAddressItAskedFor(t *testing.T) {
	g := gateFor(t)

	w := serve(g, request("GET", "https://shop.example.dev/shop/cart?ref=x&tab=2", map[string]string{"Sec-Fetch-Mode": "navigate", "Accept-Language": "fr-FR,fr;q=0.9"}))

	if w.Code != http.StatusUnauthorized || !strings.Contains(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("status %d, type %s", w.Code, w.Header().Get("Content-Type"))
	}

	body := w.Body.String()
	if !strings.Contains(body, `name="next" value="/shop/cart?ref=x&amp;tab=2"`) || !strings.Contains(body, "Accès protégé") {
		t.Fatalf("the page must carry the path and query to come back to, in the visitor's language:\n%s", body)
	}
}

func TestAKeyInTheAddressBecomesACookieAndTheAddressKeepsEverythingElse(t *testing.T) {
	cases := map[string]string{
		"/shop/cart?ref=x&pupitre_key=" + shopKey + "&tab=2":       "/shop/cart?ref=x&tab=2",
		"/shop/cart?pupitre_key=" + shopKey + "&a=1&a=2":           "/shop/cart?a=1&a=2",
		"/shop/cart?q=caf%C3%A9+cr%C3%A8me&pupitre_key=" + shopKey: "/shop/cart?q=caf%C3%A9+cr%C3%A8me",
		"/deep/path%2Fencoded?pupitre_key=" + shopKey:              "/deep/path%2Fencoded",
		"/?pupitre_key=" + shopKey:                                 "/",
	}

	for target, want := range cases {
		g := gateFor(t)

		w := serve(g, request("GET", "https://shop.example.dev"+target, map[string]string{"Sec-Fetch-Mode": "navigate"}))

		if w.Code != http.StatusSeeOther || w.Header().Get("Location") != want {
			t.Fatalf("%s: status %d location %q, want %q", target, w.Code, w.Header().Get("Location"), want)
		}

		cookie := w.Result().Cookies()
		if len(cookie) != 1 || cookie[0].Name != Cookie || !cookie[0].Secure || !cookie[0].HttpOnly || cookie[0].MaxAge != cookieMaxAge {
			t.Fatalf("%s: cookie %+v", target, cookie)
		}
	}
}

func TestTheCookieOpensTheSiteAndNeverReachesIt(t *testing.T) {
	g := gateFor(t)

	first := serve(g, request("GET", "https://shop.example.dev/?pupitre_key="+shopKey, map[string]string{"Sec-Fetch-Mode": "navigate"}))
	cookie := first.Result().Cookies()[0]

	r := request("GET", "https://shop.example.dev/account", map[string]string{"Sec-Fetch-Mode": "navigate"})
	r.Header.Set("Cookie", "session=abc; "+Cookie+"="+cookie.Value+`; prefs={"a":1}`)

	w := serve(g, r)
	got := decoded(t, w)

	if got.Cookie != `session=abc; prefs={"a":1}` {
		t.Fatalf("cookie seen by the site %q, want its own cookies untouched", got.Cookie)
	}

	if len(w.Result().Cookies()) != 1 {
		t.Fatal("a navigation must renew the cookie")
	}
}

func TestARevokedKeysCookieAsksAgain(t *testing.T) {
	g := gateFor(t)

	first := serve(g, request("GET", "https://shop.example.dev/?pupitre_key="+shopKey, map[string]string{"Sec-Fetch-Mode": "navigate"}))
	cookie := first.Result().Cookies()[0]

	g.Load(Access{Secret: secret}, []Route{g.routes["shop.example.dev"]})

	r := request("GET", "https://shop.example.dev/", map[string]string{"Accept": "text/html"})
	r.AddCookie(cookie)

	if w := serve(g, r); w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d, want the login page once the key is revoked", w.Code)
	}
}

func TestAForgedCookieIsRefused(t *testing.T) {
	g := gateFor(t)

	r := request("GET", "https://shop.example.dev/", map[string]string{"Accept": "application/json"})
	r.AddCookie(&http.Cookie{Name: Cookie, Value: "allprojects1.AAAA"})

	if w := serve(g, r); w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d, want a refusal", w.Code)
	}
}

func TestAProgramWithAKeyInTheQueryIsServedInPlace(t *testing.T) {
	g := gateFor(t)

	got := decoded(t, serve(g, request("GET", "https://shop.example.dev/events?pupitre_key="+shopKey+"&since=4", map[string]string{"Accept": "text/event-stream"})))

	if got.URI != "/events?since=4" {
		t.Fatalf("uri %q, want the key cut and the rest kept", got.URI)
	}
}

func TestAWebSocketIsNeverRedirected(t *testing.T) {
	g := gateFor(t)

	r := request("GET", "https://shop.example.dev/ws?pupitre_key="+shopKey, map[string]string{"Upgrade": "websocket", "Connection": "Upgrade", "Sec-Fetch-Mode": "websocket"})

	if w := serve(g, r); w.Code == http.StatusSeeOther {
		t.Fatal("a WebSocket cannot follow a redirect")
	}
}

func TestAPreflightPassesWithoutAKey(t *testing.T) {
	g := gateFor(t)

	decoded(t, serve(g, request("OPTIONS", "https://shop.example.dev/api", map[string]string{"Access-Control-Request-Method": "POST", "Origin": "http://localhost:8081"})))
}

func TestTheLoginFormComesBackToTheAddressAskedFor(t *testing.T) {
	g := gateFor(t)

	form := url.Values{"key": {shopKey}, "next": {"/shop/cart?ref=x&tab=2"}}
	r := httptest.NewRequest("POST", "https://shop.example.dev"+LoginPath, strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	w := serve(g, r)

	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/shop/cart?ref=x&tab=2" {
		t.Fatalf("status %d location %q", w.Code, w.Header().Get("Location"))
	}
}

func TestTheLoginFormNeverSendsAnywhereElse(t *testing.T) {
	for _, next := range []string{"https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", ""} {
		g := gateFor(t)

		form := url.Values{"key": {shopKey}, "next": {next}}
		r := httptest.NewRequest("POST", "https://shop.example.dev"+LoginPath, strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		if w := serve(g, r); w.Header().Get("Location") != "/" {
			t.Fatalf("%q: location %q, want the site's root", next, w.Header().Get("Location"))
		}
	}
}

func TestAWrongKeyInTheFormShowsTheRefusal(t *testing.T) {
	g := gateFor(t)

	form := url.Values{"key": {otherKey}, "next": {"/a?b=c"}}
	r := httptest.NewRequest("POST", "https://shop.example.dev"+LoginPath, strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	w := serve(g, r)
	body := w.Body.String()

	if w.Code != http.StatusUnauthorized || !strings.Contains(body, "does not open this site") || !strings.Contains(body, `value="/a?b=c"`) {
		t.Fatalf("status %d:\n%s", w.Code, body)
	}
}

func TestRefusedKeysAreThrottled(t *testing.T) {
	g := gateFor(t)

	var last *httptest.ResponseRecorder
	for range failureCeiling + 1 {
		last = serve(g, request("GET", "https://shop.example.dev/", map[string]string{Header: otherKey, "CF-Connecting-IP": "203.0.113.9"}))
	}

	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d, want the caller throttled", last.Code)
	}

	decoded(t, serve(g, request("GET", "https://shop.example.dev/", map[string]string{Header: shopKey, "CF-Connecting-IP": "198.51.100.4"})))
}

func TestTheThrottleForgetsAfterItsWindow(t *testing.T) {
	now := time.Now()
	l := newLimiter(func() time.Time { return now })

	for range failureCeiling + 1 {
		l.failed("x")
	}

	if !l.blocked("x") {
		t.Fatal("want blocked")
	}

	now = now.Add(failureWindow + time.Second)

	if l.blocked("x") {
		t.Fatal("want forgotten after the window")
	}
}

func TestAnUnknownNameIsNotServed(t *testing.T) {
	g := gateFor(t)

	if w := serve(g, request("GET", "https://other.example.dev/", nil)); w.Code != http.StatusNotFound {
		t.Fatalf("status %d", w.Code)
	}
}

func TestTheHostIsMatchedWithoutCaseOrPort(t *testing.T) {
	g := gateFor(t)

	r := request("GET", "https://shop.example.dev/", map[string]string{Header: shopKey})
	r.Host = "Shop.Example.Dev:443"

	decoded(t, serve(g, r))
}

func TestKeyIDReadsOnlyWellFormedKeys(t *testing.T) {
	if id, ok := KeyID(shopKey); !ok || id != "shopkey00001" {
		t.Fatalf("got %q %v", id, ok)
	}

	for _, bad := range []string{"", "ppk_short_x", strings.ToUpper(shopKey), shopKey + "x"} {
		if _, ok := KeyID(bad); ok {
			t.Fatalf("%q must not read as a key", bad)
		}
	}
}

func TestAnUnreachableProcessSaysSo(t *testing.T) {
	g := New()
	g.Load(Access{Secret: secret}, []Route{{Hostname: "down.example.dev", Upstream: "127.0.0.1:1", Project: "x"}})

	w := serve(g, request("GET", "https://down.example.dev/", nil))
	body, _ := io.ReadAll(w.Body)

	if w.Code != http.StatusBadGateway || len(body) == 0 {
		t.Fatalf("status %d", w.Code)
	}
}
