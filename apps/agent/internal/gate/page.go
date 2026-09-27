package gate

import (
	"html/template"
	"io"
	"net/http"
	"strings"

	"pupitre.studio/agent/internal/i18n"
)

type pageData struct {
	Lang      string
	Title     string
	Lead      string
	Label     string
	Action    string
	Hint      string
	Problem   string
	Next      string
	LoginPath string
	Throttled bool
}

var loginPage = template.Must(template.New("login").Parse(`<!doctype html>
<html lang="{{.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{.Title}}</title>
<style>
:root{--bg:#fafafa;--fg:#0a0a0a;--muted:#737373;--line:#e5e5e5;--field:#fff;--danger:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#fafafa;--muted:#a3a3a3;--line:#262626;--field:#171717;--danger:#f87171}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:380px}
.mark{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 20px}
h1{font-size:22px;font-weight:600;margin:0 0 6px}
p{margin:0;color:var(--muted)}
form{margin-top:24px;display:flex;flex-direction:column;gap:12px}
label{font-size:13px;font-weight:500}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--fg);font:14px ui-monospace,SFMono-Regular,Menlo,monospace}
input:focus{outline:2px solid var(--fg);outline-offset:1px}
button{padding:10px 12px;border:0;border-radius:8px;background:var(--fg);color:var(--bg);font:inherit;font-weight:500;cursor:pointer}
.problem{margin-top:16px;color:var(--danger);font-size:14px}
.hint{margin-top:24px;font-size:13px}
</style>
</head>
<body>
<main>
<p class="mark">Pupitre</p>
<h1>{{.Title}}</h1>
<p>{{.Lead}}</p>
{{if .Problem}}<p class="problem" role="alert">{{.Problem}}</p>{{end}}
{{if not .Throttled}}<form method="post" action="{{.LoginPath}}">
<input type="hidden" name="next" value="{{.Next}}">
<label for="key">{{.Label}}</label>
<input id="key" name="key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ppk_…" required autofocus>
<button type="submit">{{.Action}}</button>
</form>{{end}}
<p class="hint">{{.Hint}}</p>
</main>
</body>
</html>
`))

func renderPage(w io.Writer, locale i18n.Locale, next string, problem string, throttled bool) error {
	data := pageData{
		Lang:      string(locale),
		Title:     text(locale, "gate.page.title"),
		Lead:      text(locale, "gate.page.lead"),
		Label:     text(locale, "gate.page.label"),
		Action:    text(locale, "gate.page.action"),
		Hint:      text(locale, "gate.page.hint"),
		Next:      safeNext(next),
		LoginPath: LoginPath,
		Throttled: throttled,
	}

	if problem != "" {
		data.Problem = text(locale, problem)
	}

	if throttled {
		data.Problem = text(locale, "gate.page.throttled")
	}

	return loginPage.Execute(w, data)
}

func text(locale i18n.Locale, key string, args ...any) string {
	return i18n.In(locale, key, args...)
}

// The visitor's language, not the server's: the page is read by whoever holds the link.
func localeOf(r *http.Request) i18n.Locale {
	first, _, _ := strings.Cut(r.Header.Get("Accept-Language"), ",")
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(first)), "fr") {
		return i18n.FR
	}

	return i18n.EN
}
