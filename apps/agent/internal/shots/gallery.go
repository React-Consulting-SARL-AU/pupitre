package shots

import (
	"fmt"
	"html"
	"net/http"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

const galleryStyle = `:root{color-scheme:light dark;--bg:#fafafa;--fg:#141414;--dim:#6b6b6b;--line:#e0e0e0;--card:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#0e0e0e;--fg:#ededed;--dim:#8f8f8f;--line:#262626;--card:#161616}}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
h1{font:500 13px/1.4 ui-monospace,monospace;margin:0 0 20px;color:var(--dim)}
h1 a{color:var(--fg);text-decoration:none}
.g{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.c{display:block;background:var(--card);border:1px solid var(--line);text-decoration:none;color:inherit}
.c:hover{border-color:var(--fg)}
.t{aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg)}
.t img{width:100%;height:100%;object-fit:contain}
.m{padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.m b{font-weight:500;font-size:13px;word-break:break-all}
.m span{color:var(--dim);font-size:11px;font-family:ui-monospace,monospace}
.e{color:var(--dim)}`

var imageExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".svg": true, ".avif": true,
}

// Read-only, on the loopback alone: the gallery is reached through the SSH session the app already holds, never from outside.
func Serve(dir string, port int) error {
	server := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", port),
		Handler:           Handler(dir),
		ReadHeaderTimeout: 5 * time.Second,
	}

	return server.ListenAndServe()
}

func Handler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			http.Error(writer, "lecture seule", http.StatusMethodNotAllowed)
			return
		}

		clean := path.Clean("/" + request.URL.Path)
		if info, err := os.Stat(path.Join(dir, clean)); err == nil && info.IsDir() {
			index(writer, dir, clean)
			return
		}

		files.ServeHTTP(writer, request)
	})
}

type entry struct {
	name  string
	dir   bool
	size  int64
	when  time.Time
	image bool
}

func index(writer http.ResponseWriter, root, relative string) {
	entries, err := listing(path.Join(root, relative))
	if err != nil {
		http.Error(writer, "dossier illisible", http.StatusNotFound)
		return
	}

	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(writer, "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>shots · %s</title><style>%s</style>", html.EscapeString(strings.TrimPrefix(relative, "/")), galleryStyle)
	fmt.Fprintf(writer, "<h1><a href=\"/\">shots</a>%s</h1><div class=g>", crumb(relative))

	if len(entries) == 0 {
		fmt.Fprint(writer, "<p class=e>Aucune capture pour l'instant.</p>")
	}

	for _, found := range entries {
		card(writer, relative, found)
	}

	fmt.Fprint(writer, "</div>")
}

func card(writer http.ResponseWriter, relative string, found entry) {
	href := html.EscapeString(path.Join(relative, found.name))
	label := html.EscapeString(found.name)

	fmt.Fprintf(writer, "<a class=c href=\"%s\"><div class=t>", href)
	if found.image {
		fmt.Fprintf(writer, "<img loading=lazy alt=\"%s\" src=\"%s\">", label, href)
	} else {
		fmt.Fprint(writer, "<span class=e>dossier</span>")
	}

	fmt.Fprintf(writer, "</div><div class=m><b>%s</b><span>%s · %s</span></div></a>", label, found.when.Format("2006-01-02 15:04"), size(found.size))
}

func listing(dir string) ([]entry, error) {
	found, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	entries := make([]entry, 0, len(found))
	for _, item := range found {
		info, err := item.Info()
		if err != nil || strings.HasPrefix(item.Name(), ".") {
			continue
		}

		entries = append(entries, entry{
			name: item.Name(), dir: item.IsDir(), size: info.Size(), when: info.ModTime(),
			image: imageExtensions[strings.ToLower(path.Ext(item.Name()))],
		})
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].when.After(entries[j].when) })

	return entries, nil
}

func crumb(relative string) string {
	trimmed := strings.Trim(relative, "/")
	if trimmed == "" {
		return ""
	}

	return " / " + html.EscapeString(trimmed)
}

func size(bytes int64) string {
	if bytes < 1024 {
		return strconv.FormatInt(bytes, 10) + " o"
	}

	return strconv.FormatInt(bytes/1024, 10) + " Ko"
}
