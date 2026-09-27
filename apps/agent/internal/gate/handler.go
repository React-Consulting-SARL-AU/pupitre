package gate

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Chrome caps a cookie at 400 days; every visit renews it, so a key never expires in the browser.
const cookieMaxAge = 400 * 24 * 60 * 60

type Gate struct {
	mu     sync.RWMutex
	access Access
	routes map[string]Route

	limiter *limiter
	proxy   *httputil.ReverseProxy
}

func New() *Gate {
	g := &Gate{routes: map[string]Route{}, limiter: newLimiter(time.Now)}

	g.proxy = &httputil.ReverseProxy{
		Rewrite:       rewrite,
		FlushInterval: -1,
		ErrorHandler:  unreachable,
	}

	return g
}

func NewSecret() (string, error) {
	raw := make([]byte, secretBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return hex.EncodeToString(raw), nil
}

func (g *Gate) Load(access Access, routes []Route) {
	byHost := make(map[string]Route, len(routes))
	for _, route := range routes {
		byHost[strings.ToLower(route.Hostname)] = route
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	g.access = access
	g.routes = byHost
}

func (g *Gate) snapshot(host string) (Route, Access, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	route, known := g.routes[host]

	return route, g.access, known
}

type proof int

const (
	proofNone proof = iota
	proofHeader
	proofQuery
	proofCookie
)

type visit struct {
	route  Route
	access Access
	key    Key
	proof  proof
	shown  bool
}

func (g *Gate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	route, access, known := g.snapshot(hostOf(r))
	if !known {
		http.Error(w, "unknown host", http.StatusNotFound)
		return
	}

	r.Header.Del(IdentityHeader)

	if !route.Protected {
		g.forward(w, r, route)
		return
	}

	if r.URL.Path == LoginPath {
		g.login(w, r, route, access)
		return
	}

	if preflight(r) {
		strip(r)
		g.forward(w, r, route)
		return
	}

	v := g.identify(r, route, access)

	if v.proof == proofNone {
		status := http.StatusUnauthorized
		if v.shown && g.limiter.failed(clientIP(r)) {
			status = http.StatusTooManyRequests
		}

		refuse(w, r, status, withoutKey(r.URL), refusedWhen(v.shown))
		return
	}

	if v.proof == proofQuery && page(r) {
		setCookie(w, access.Secret, v.key)
		redirect(w, withoutKey(r.URL))
		return
	}

	if v.proof == proofCookie && page(r) {
		setCookie(w, access.Secret, v.key)
	}

	strip(r)
	r.Header.Set(IdentityHeader, url.PathEscape(v.key.Name))
	g.forward(w, r, route)
}

// A key shown and refused counts against the caller; a cookie from a revoked key only asks again.
func (g *Gate) identify(r *http.Request, route Route, access Access) visit {
	v := visit{route: route, access: access}

	if shown := r.Header.Get(Header); shown != "" {
		v.shown = true
		return v.check(shown, proofHeader)
	}

	if shown := r.URL.Query().Get(Query); shown != "" {
		v.shown = true
		return v.check(shown, proofQuery)
	}

	cookie, err := r.Cookie(Cookie)
	if err != nil {
		return v
	}

	id, signature, found := strings.Cut(cookie.Value, ".")
	if !found {
		return v
	}

	key, known := access.Find(id)
	if !known || !key.Opens(route.Project) || !validCookie(access.Secret, key, signature) {
		return v
	}

	v.key = key
	v.proof = proofCookie

	return v
}

func refusedWhen(shown bool) string {
	if shown {
		return "gate.page.refused"
	}

	return ""
}

func (v visit) check(shown string, via proof) visit {
	key, ok := v.access.open(shown, v.route.Project)
	if !ok {
		return v
	}

	v.key = key
	v.proof = via

	return v
}

func (a Access) open(shown string, project string) (Key, bool) {
	id, ok := KeyID(shown)
	if !ok {
		return Key{}, false
	}

	key, known := a.Find(id)
	if !known || !sameHash(shown, key.Hash) || !key.Opens(project) {
		return Key{}, false
	}

	return key, true
}

func (g *Gate) login(w http.ResponseWriter, r *http.Request, route Route, access Access) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}

	next := safeNext(r.PostFormValue("next"))

	if g.limiter.blocked(clientIP(r)) {
		refuse(w, r, http.StatusTooManyRequests, next, "")
		return
	}

	key, ok := access.open(strings.TrimSpace(r.PostFormValue("key")), route.Project)
	if !ok {
		g.limiter.failed(clientIP(r))
		refuse(w, r, http.StatusUnauthorized, next, "gate.page.refused")
		return
	}

	setCookie(w, access.Secret, key)
	redirect(w, next)
}

func (g *Gate) forward(w http.ResponseWriter, r *http.Request, route Route) {
	r.URL.Scheme = "http"
	r.URL.Host = route.Upstream

	g.proxy.ServeHTTP(w, r)
}

// The site sees its own origin as Host, as the exposure used to send it, and the public name in X-Forwarded-Host.
func rewrite(pr *httputil.ProxyRequest) {
	target := &url.URL{Scheme: "http", Host: pr.In.URL.Host}
	pr.SetURL(target)
	pr.Out.Host = target.Host

	for _, name := range []string{"X-Forwarded-For", "X-Forwarded-Proto", "X-Forwarded-Host"} {
		if values := pr.In.Header.Values(name); len(values) > 0 {
			pr.Out.Header[name] = values
		}
	}

	if pr.Out.Header.Get("X-Forwarded-Host") == "" {
		pr.Out.Header.Set("X-Forwarded-Host", pr.In.Host)
	}
}

func unreachable(w http.ResponseWriter, _ *http.Request, _ error) {
	http.Error(w, "the process behind this name is not answering", http.StatusBadGateway)
}

func preflight(r *http.Request) bool {
	return r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != ""
}

// A browser navigating to a page; anything else is a program, answered in JSON and never redirected.
func page(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}

	if websocket(r) {
		return false
	}

	if mode := r.Header.Get("Sec-Fetch-Mode"); mode != "" {
		return mode == "navigate"
	}

	return strings.Contains(r.Header.Get("Accept"), "text/html")
}

func websocket(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

func strip(r *http.Request) {
	r.Header.Del(Header)

	if query, changed := dropKey(r.URL.RawQuery); changed {
		r.URL.RawQuery = query
	}

	removeCookie(r)
}

// Cut as text: reparsing would drop the site's own cookies that Go's parser deems invalid.
func removeCookie(r *http.Request) {
	lines := r.Header.Values("Cookie")
	r.Header.Del("Cookie")

	var kept []string
	for _, line := range lines {
		for _, pair := range strings.Split(line, ";") {
			name, _, _ := strings.Cut(strings.TrimSpace(pair), "=")
			if name != Cookie && strings.TrimSpace(pair) != "" {
				kept = append(kept, strings.TrimSpace(pair))
			}
		}
	}

	if len(kept) > 0 {
		r.Header.Set("Cookie", strings.Join(kept, "; "))
	}
}

// Every other parameter keeps its place and its exact encoding.
func dropKey(raw string) (string, bool) {
	if raw == "" {
		return raw, false
	}

	parts := strings.Split(raw, "&")
	kept := parts[:0]
	changed := false

	for _, part := range parts {
		name, _, _ := strings.Cut(part, "=")
		if decoded, err := url.QueryUnescape(name); err == nil && decoded == Query {
			changed = true
			continue
		}

		kept = append(kept, part)
	}

	return strings.Join(kept, "&"), changed
}

func withoutKey(u *url.URL) string {
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}

	query, _ := dropKey(u.RawQuery)
	if query == "" {
		return path
	}

	return path + "?" + query
}

// Only a path of this very site: an open redirect would lend the owner's name to anyone's link.
func safeNext(next string) string {
	if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") || strings.HasPrefix(next, "/\\") {
		return "/"
	}

	parsed, err := url.Parse(next)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" {
		return "/"
	}

	return next
}

func setCookie(w http.ResponseWriter, secret string, key Key) {
	http.SetCookie(w, &http.Cookie{
		Name:     Cookie,
		Value:    cookieValue(secret, key),
		Path:     "/",
		MaxAge:   cookieMaxAge,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func redirect(w http.ResponseWriter, location string) {
	w.Header().Set("Location", location)
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusSeeOther)
}

type refusal struct {
	Error refusalBody `json:"error"`
}

type refusalBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Fix     string `json:"fix"`
}

func refuse(w http.ResponseWriter, r *http.Request, status int, next string, problem string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.Header().Set("Referrer-Policy", "no-referrer")

	locale := localeOf(r)

	if page(r) || r.URL.Path == LoginPath {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(status)

		if r.Method != http.MethodHead {
			_ = renderPage(w, locale, next, problem, status == http.StatusTooManyRequests)
		}

		return
	}

	body := refusalBody{
		Code:    "access_required",
		Message: text(locale, "gate.api.required"),
		Fix:     text(locale, "gate.api.required.fix", Header, Query),
	}

	if status == http.StatusTooManyRequests {
		body = refusalBody{
			Code:    "access_throttled",
			Message: text(locale, "gate.api.throttled"),
			Fix:     text(locale, "gate.api.throttled.fix"),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(refusal{Error: body})
}

func hostOf(r *http.Request) string {
	host := r.Host
	if name, _, err := net.SplitHostPort(host); err == nil {
		host = name
	}

	return strings.ToLower(strings.TrimSuffix(host, "."))
}

// Behind the tunnel the edge names the caller; behind Caddy the first forwarded address does.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}

	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		first, _, _ := strings.Cut(forwarded, ",")
		return strings.TrimSpace(first)
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}

	return host
}
