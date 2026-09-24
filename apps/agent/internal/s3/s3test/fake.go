// Package s3test is a bucket in memory that checks every signature, for the tests of whatever speaks S3.
package s3test

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"pupitre.studio/agent/internal/s3"
)

const (
	AccessKey = "AKIAPUPITRETEST"
	Secret    = "secret-of-the-test-bucket"
	Region    = "auto"
)

type upload struct {
	key       string
	parts     map[int][]byte
	initiated time.Time
}

type refusal struct {
	status int
	code   string
}

type Fake struct {
	Bucket string
	Now    time.Time

	server   *httptest.Server
	mu       sync.Mutex
	objects  map[string][]byte
	modified map[string]time.Time
	uploads  map[string]*upload
	next     int
	calls    map[string]int
	refusals map[string][]refusal
}

func New(t *testing.T, bucket string) *Fake {
	t.Helper()

	fake := &Fake{
		Bucket:   bucket,
		Now:      time.Date(2026, time.September, 24, 3, 0, 0, 0, time.UTC),
		objects:  map[string][]byte{},
		modified: map[string]time.Time{},
		uploads:  map[string]*upload{},
		calls:    map[string]int{},
		refusals: map[string][]refusal{},
	}
	fake.server = httptest.NewTLSServer(http.HandlerFunc(fake.serve))
	t.Cleanup(fake.server.Close)

	return fake
}

// Client reaches the fake over HTTPS whatever host a request names, so a virtual-hosted bucket resolves too: the test certificate is checked under its own name.
func (f *Fake) Client(pathStyle bool) s3.Client {
	address := f.server.Listener.Addr().String()
	dialer := &net.Dialer{}

	trust := f.server.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	trust.ServerName = certificateName

	return s3.Client{
		Endpoint:        "https://s3.pupitre.test:" + port(address),
		Region:          Region,
		Bucket:          f.Bucket,
		AccessKeyID:     AccessKey,
		SecretAccessKey: Secret,
		PathStyle:       pathStyle,
		HTTP: &http.Client{Transport: &http.Transport{TLSClientConfig: trust, DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, address)
		}}},
		Now:     func() time.Time { return f.Now },
		Backoff: func(int) time.Duration { return 0 },
	}
}

// The name net/http/httptest's certificate is made out to.
const certificateName = "example.com"

func port(address string) string {
	_, value, _ := net.SplitHostPort(address)

	return value
}

// Refuse answers the next call of op with this refusal, once.
func (f *Fake) Refuse(op string, status int, code string) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.refusals[op] = append(f.refusals[op], refusal{status: status, code: code})
}

// Calls counts the requests of one operation.
func (f *Fake) Calls(op string) int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.calls[op]
}

func (f *Fake) Object(key string) ([]byte, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()

	content, found := f.objects[key]

	return content, found
}

func (f *Fake) PutObject(key string, content []byte, modified time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.objects[key] = content
	f.modified[key] = modified
}

func (f *Fake) Keys() []string {
	f.mu.Lock()
	defer f.mu.Unlock()

	keys := make([]string, 0, len(f.objects))
	for key := range f.objects {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	return keys
}

// Begin leaves an upload open, as an agent killed mid-part would.
func (f *Fake) Begin(key string, initiated time.Time) string {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.begin(key, initiated)
}

func (f *Fake) OpenUploads() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return len(f.uploads)
}

func (f *Fake) begin(key string, initiated time.Time) string {
	f.next++
	id := "upload-" + strconv.Itoa(f.next)
	f.uploads[id] = &upload{key: key, parts: map[int][]byte{}, initiated: initiated}

	return id
}

func (f *Fake) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()

	body, _ := io.ReadAll(r.Body)

	if err := s3.Verify(r, AccessKey, Secret, Region); err != nil {
		fail(w, http.StatusForbidden, "SignatureDoesNotMatch")

		return
	}

	if payload := r.Header.Get("X-Amz-Content-Sha256"); payload != s3.UnsignedPayload && payload != digest(body) {
		fail(w, http.StatusBadRequest, "XAmzContentSHA256Mismatch")

		return
	}

	key, ok := f.keyOf(r)
	if !ok {
		fail(w, http.StatusNotFound, "NoSuchBucket")

		return
	}

	op := operation(r, key)
	f.calls[op]++

	if pending := f.refusals[op]; len(pending) > 0 {
		f.refusals[op] = pending[1:]
		fail(w, pending[0].status, pending[0].code)

		return
	}

	f.answer(w, r, op, key, body)
}

func (f *Fake) answer(w http.ResponseWriter, r *http.Request, op, key string, body []byte) {
	query := r.URL.Query()

	switch op {
	case "HeadBucket":
		w.WriteHeader(http.StatusOK)
	case "DeleteObject":
		delete(f.objects, key)
		w.WriteHeader(http.StatusNoContent)
	case "PutObject":
		f.objects[key] = body
		f.modified[key] = f.Now
		w.Header().Set("ETag", quoted(body))
	case "GetObject":
		content, found := f.objects[key]
		if !found {
			fail(w, http.StatusNotFound, "NoSuchKey")

			return
		}
		_, _ = w.Write(content)
	case "CopyObject":
		content, found := f.source(r)
		if !found {
			fail(w, http.StatusNotFound, "NoSuchKey")

			return
		}
		f.objects[key] = content
		f.modified[key] = f.Now
		writeXML(w, "<CopyObjectResult><ETag>"+quoted(content)+"</ETag></CopyObjectResult>")
	case "CreateMultipartUpload":
		writeXML(w, "<InitiateMultipartUploadResult><UploadId>"+f.begin(key, f.Now)+"</UploadId></InitiateMultipartUploadResult>")
	case "UploadPart", "UploadPartCopy":
		f.putPart(w, r, op, body)
	case "CompleteMultipartUpload":
		f.complete(w, query.Get("uploadId"), key)
	case "AbortMultipartUpload":
		delete(f.uploads, query.Get("uploadId"))
		w.WriteHeader(http.StatusNoContent)
	case "ListObjectsV2":
		f.list(w, query)
	case "ListMultipartUploads":
		f.listUploads(w, query.Get("prefix"))
	}
}

func (f *Fake) putPart(w http.ResponseWriter, r *http.Request, op string, body []byte) {
	query := r.URL.Query()
	pending, found := f.uploads[query.Get("uploadId")]
	if !found {
		fail(w, http.StatusNotFound, "NoSuchUpload")

		return
	}

	number, _ := strconv.Atoi(query.Get("partNumber"))
	if op == "UploadPart" {
		pending.parts[number] = body
		w.Header().Set("ETag", quoted(body))

		return
	}

	content, found := f.source(r)
	if !found {
		fail(w, http.StatusNotFound, "NoSuchKey")

		return
	}

	var start, end int
	fmt.Sscanf(r.Header.Get("X-Amz-Copy-Source-Range"), "bytes=%d-%d", &start, &end)
	pending.parts[number] = content[start : end+1]
	writeXML(w, "<CopyPartResult><ETag>"+quoted(pending.parts[number])+"</ETag></CopyPartResult>")
}

// Every part but the last holds the same size, or the bucket refuses, as R2 does.
func (f *Fake) complete(w http.ResponseWriter, id, key string) {
	pending, found := f.uploads[id]
	if !found || pending.key != key {
		fail(w, http.StatusNotFound, "NoSuchUpload")

		return
	}

	var joined bytes.Buffer
	for number := 1; number <= len(pending.parts); number++ {
		part, present := pending.parts[number]
		if !present || (number < len(pending.parts) && len(part) != len(pending.parts[1])) {
			fail(w, http.StatusBadRequest, "InvalidPart")

			return
		}

		joined.Write(part)
	}

	f.objects[key] = joined.Bytes()
	f.modified[key] = f.Now
	delete(f.uploads, id)
	writeXML(w, "<CompleteMultipartUploadResult><Key>"+key+"</Key></CompleteMultipartUploadResult>")
}

type listing struct {
	XMLName  xml.Name `xml:"ListBucketResult"`
	Contents []struct {
		Key          string `xml:"Key"`
		Size         int    `xml:"Size"`
		LastModified string `xml:"LastModified"`
	} `xml:"Contents"`
	Common []struct {
		Prefix string `xml:"Prefix"`
	} `xml:"CommonPrefixes"`
	Truncated bool   `xml:"IsTruncated"`
	Next      string `xml:"NextContinuationToken,omitempty"`
}

// Two entries a page, so every listing walks its pages.
const pageSize = 2

func (f *Fake) list(w http.ResponseWriter, query url.Values) {
	prefix, delimiter := query.Get("prefix"), query.Get("delimiter")

	var entries []string
	seen := map[string]bool{}
	for _, key := range f.sorted() {
		if !strings.HasPrefix(key, prefix) {
			continue
		}

		entry := key
		if delimiter != "" {
			if rest, found := strings.CutPrefix(key, prefix); found {
				if at := strings.Index(rest, delimiter); at >= 0 {
					entry = prefix + rest[:at+len(delimiter)]
				}
			}
		}

		if !seen[entry] {
			seen[entry] = true
			entries = append(entries, entry)
		}
	}

	start, _ := strconv.Atoi(query.Get("continuation-token"))
	end := min(start+pageSize, len(entries))

	page := listing{Truncated: end < len(entries)}
	if page.Truncated {
		page.Next = strconv.Itoa(end)
	}

	for _, entry := range entries[start:end] {
		if content, object := f.objects[entry]; object {
			page.Contents = append(page.Contents, struct {
				Key          string `xml:"Key"`
				Size         int    `xml:"Size"`
				LastModified string `xml:"LastModified"`
			}{Key: entry, Size: len(content), LastModified: f.modified[entry].Format(time.RFC3339)})

			continue
		}

		page.Common = append(page.Common, struct {
			Prefix string `xml:"Prefix"`
		}{Prefix: entry})
	}

	encoded, _ := xml.Marshal(page)
	writeXML(w, string(encoded))
}

func (f *Fake) listUploads(w http.ResponseWriter, prefix string) {
	var lines strings.Builder
	lines.WriteString("<ListMultipartUploadsResult><IsTruncated>false</IsTruncated>")

	for id, pending := range f.uploads {
		if strings.HasPrefix(pending.key, prefix) {
			lines.WriteString("<Upload><Key>" + pending.key + "</Key><UploadId>" + id + "</UploadId><Initiated>" + pending.initiated.Format(time.RFC3339) + "</Initiated></Upload>")
		}
	}

	lines.WriteString("</ListMultipartUploadsResult>")
	writeXML(w, lines.String())
}

func (f *Fake) sorted() []string {
	keys := make([]string, 0, len(f.objects))
	for key := range f.objects {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	return keys
}

// keyOf reads the bucket from the host or from the first segment, and answers the key under it.
func (f *Fake) keyOf(r *http.Request) (string, bool) {
	host, _, _ := net.SplitHostPort(r.Host)
	path := strings.TrimPrefix(r.URL.Path, "/")

	if bucket, found := strings.CutSuffix(host, ".s3.pupitre.test"); found {
		return path, bucket == f.Bucket
	}

	bucket, key, _ := strings.Cut(path, "/")

	return key, bucket == f.Bucket
}

func (f *Fake) source(r *http.Request) ([]byte, bool) {
	raw, err := url.PathUnescape(r.Header.Get("X-Amz-Copy-Source"))
	if err != nil {
		return nil, false
	}

	bucket, key, _ := strings.Cut(strings.TrimPrefix(raw, "/"), "/")
	if bucket != f.Bucket {
		return nil, false
	}

	content, found := f.objects[key]

	return content, found
}

func operation(r *http.Request, key string) string {
	query := r.URL.Query()

	switch {
	case r.Method == http.MethodHead && key == "":
		return "HeadBucket"
	case r.Method == http.MethodGet && query.Has("uploads"):
		return "ListMultipartUploads"
	case r.Method == http.MethodGet && key == "":
		return "ListObjectsV2"
	case r.Method == http.MethodGet:
		return "GetObject"
	case r.Method == http.MethodPost && query.Has("uploads"):
		return "CreateMultipartUpload"
	case r.Method == http.MethodPost:
		return "CompleteMultipartUpload"
	case r.Method == http.MethodDelete && query.Has("uploadId"):
		return "AbortMultipartUpload"
	case r.Method == http.MethodDelete:
		return "DeleteObject"
	case query.Has("partNumber") && r.Header.Get("X-Amz-Copy-Source") != "":
		return "UploadPartCopy"
	case query.Has("partNumber"):
		return "UploadPart"
	case r.Header.Get("X-Amz-Copy-Source") != "":
		return "CopyObject"
	}

	return "PutObject"
}

func fail(w http.ResponseWriter, status int, code string) {
	w.WriteHeader(status)
	_, _ = w.Write([]byte("<Error><Code>" + code + "</Code><Message>refused by the fake bucket</Message></Error>"))
}

func writeXML(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/xml")
	_, _ = w.Write([]byte(body))
}

func quoted(body []byte) string {
	sum := md5.Sum(body)

	return `"` + hex.EncodeToString(sum[:]) + `"`
}

func digest(body []byte) string {
	sum := sha256.Sum256(body)

	return hex.EncodeToString(sum[:])
}
