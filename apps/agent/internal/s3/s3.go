package s3

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	// R2 wants every part but the last equal; ten thousand parts of this size carry 80 GB.
	DefaultPartBytes = 8 << 20
	maxParts         = 10_000

	// S3 copies up to 5 GiB in one call; beyond that, in 1 GiB ranges.
	singleCopyLimit = 5 << 30
	copyPartBytes   = 1 << 30

	attempts        = 3
	requestTimeout  = 10 * time.Minute
	headerTimeout   = 2 * time.Minute
	maxAnswerBytes  = 16 << 20
	maxDetailBytes  = 64 << 10
	firstRetryDelay = time.Second
)

var ErrTooLarge = errors.New("the object is larger than ten thousand parts")

type Client struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	PathStyle       bool

	HTTP      *http.Client
	Now       func() time.Time
	PartBytes int
	// nil doubles from one second.
	Backoff func(retry int) time.Duration
}

var transport = newTransport()

func newTransport() *http.Transport {
	cloned := http.DefaultTransport.(*http.Transport).Clone()
	cloned.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	cloned.ResponseHeaderTimeout = headerTimeout

	return cloned
}

type Object struct {
	Key          string
	Size         int64
	LastModified time.Time
}

type Upload struct {
	Key       string
	UploadID  string
	Initiated time.Time
}

type Uploaded struct {
	Bytes  int64
	SHA256 string
}

type call struct {
	op      string
	method  string
	key     string
	bucket  bool
	query   url.Values
	header  http.Header
	body    []byte
	payload string
}

func (c Client) HeadBucket(ctx context.Context) error {
	_, err := c.exchange(ctx, call{op: "HeadBucket", method: http.MethodHead, bucket: true})

	return err
}

func (c Client) Put(ctx context.Context, key string, body []byte, contentType string) error {
	header := http.Header{}

	if contentType != "" {
		header.Set("Content-Type", contentType)
	}

	_, err := c.exchange(ctx, call{op: "PutObject", method: http.MethodPut, key: key, header: header, body: body, payload: hashHex(body)})

	return err
}

func (c Client) Delete(ctx context.Context, key string) error {
	_, err := c.exchange(ctx, call{op: "DeleteObject", method: http.MethodDelete, key: key})

	return err
}

// A missing key refuses with KindNoKey.
func (c Client) Size(ctx context.Context, key string) (int64, error) {
	response, err := c.open(ctx, call{op: "HeadObject", method: http.MethodHead, key: key})
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()

	return response.ContentLength, nil
}

func (c Client) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	response, err := c.open(ctx, call{op: "GetObject", method: http.MethodGet, key: key})
	if err != nil {
		return nil, err
	}

	return response.Body, nil
}

func (c Client) List(ctx context.Context, prefix, delimiter string) ([]Object, []string, error) {
	var objects []Object
	var prefixes []string
	token := ""

	for {
		query := url.Values{"list-type": {"2"}, "prefix": {prefix}}

		if delimiter != "" {
			query.Set("delimiter", delimiter)
		}

		if token != "" {
			query.Set("continuation-token", token)
		}

		var page struct {
			Contents []struct {
				Key          string    `xml:"Key"`
				Size         int64     `xml:"Size"`
				LastModified time.Time `xml:"LastModified"`
			} `xml:"Contents"`
			CommonPrefixes []struct {
				Prefix string `xml:"Prefix"`
			} `xml:"CommonPrefixes"`
			IsTruncated bool   `xml:"IsTruncated"`
			Next        string `xml:"NextContinuationToken"`
		}

		if err := c.decode(ctx, call{op: "ListObjectsV2", method: http.MethodGet, bucket: true, query: query}, &page); err != nil {
			return nil, nil, err
		}

		for _, entry := range page.Contents {
			objects = append(objects, Object{Key: entry.Key, Size: entry.Size, LastModified: entry.LastModified})
		}

		for _, common := range page.CommonPrefixes {
			prefixes = append(prefixes, common.Prefix)
		}

		if !page.IsTruncated || page.Next == "" {
			return objects, prefixes, nil
		}

		token = page.Next
	}
}

func (c Client) Uploads(ctx context.Context, prefix string) ([]Upload, error) {
	var uploads []Upload
	keyMarker, idMarker := "", ""

	for {
		query := url.Values{"uploads": {""}, "prefix": {prefix}}

		if keyMarker != "" {
			query.Set("key-marker", keyMarker)
			query.Set("upload-id-marker", idMarker)
		}

		var page struct {
			Uploads []struct {
				Key       string    `xml:"Key"`
				UploadID  string    `xml:"UploadId"`
				Initiated time.Time `xml:"Initiated"`
			} `xml:"Upload"`
			IsTruncated bool   `xml:"IsTruncated"`
			NextKey     string `xml:"NextKeyMarker"`
			NextID      string `xml:"NextUploadIdMarker"`
		}

		if err := c.decode(ctx, call{op: "ListMultipartUploads", method: http.MethodGet, bucket: true, query: query}, &page); err != nil {
			return nil, err
		}

		for _, entry := range page.Uploads {
			uploads = append(uploads, Upload{Key: entry.Key, UploadID: entry.UploadID, Initiated: entry.Initiated})
		}

		if !page.IsTruncated || page.NextKey == "" {
			return uploads, nil
		}

		keyMarker, idMarker = page.NextKey, page.NextID
	}
}

func (c Client) Abort(ctx context.Context, key, uploadID string) error {
	_, err := c.exchange(ctx, call{op: "AbortMultipartUpload", method: http.MethodDelete, key: key, query: url.Values{"uploadId": {uploadID}}})

	return err
}

// S3 may answer an error inside a 200 body.
func (c Client) decode(ctx context.Context, request call, into any) error {
	answer, err := c.exchange(ctx, request)
	if err != nil {
		return err
	}

	if failure := embeddedError(request.op, answer.body); failure != nil {
		return failure
	}

	if err := xml.Unmarshal(answer.body, into); err != nil {
		return &Error{Op: request.op, Status: http.StatusOK, Cause: err}
	}

	return nil
}

type answer struct {
	body   []byte
	header http.Header
}

func (c Client) exchange(ctx context.Context, request call) (answer, error) {
	var last error

	for attempt := range attempts {
		if attempt > 0 {
			if err := c.wait(ctx, attempt); err != nil {
				return answer{}, last
			}
		}

		received, err := c.once(ctx, request)
		if err == nil {
			return received, nil
		}

		last = err
		if !transient(err) {
			return answer{}, err
		}
	}

	return answer{}, last
}

func (c Client) once(ctx context.Context, request call) (answer, error) {
	bounded, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()

	response, err := c.send(bounded, request)
	if err != nil {
		return answer{}, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, maxAnswerBytes))
	if err != nil {
		return answer{}, &Error{Op: request.op, Cause: err}
	}

	return answer{body: body, header: response.Header}, nil
}

// The answer is streamed, so only the request is retried, never a body half read.
func (c Client) open(ctx context.Context, request call) (*http.Response, error) {
	var last error

	for attempt := range attempts {
		if attempt > 0 {
			if err := c.wait(ctx, attempt); err != nil {
				return nil, last
			}
		}

		response, err := c.send(ctx, request)
		if err == nil {
			return response, nil
		}

		last = err
		if !transient(err) {
			return nil, err
		}
	}

	return nil, last
}

func (c Client) send(ctx context.Context, request call) (*http.Response, error) {
	target, host, err := c.address(request.key, request.bucket)
	if err != nil {
		return nil, &Error{Op: request.op, Cause: err}
	}

	target.RawQuery = canonicalQuery(request.query)

	var body io.Reader
	if request.body != nil {
		body = bytes.NewReader(request.body)
	}

	message, err := http.NewRequestWithContext(ctx, request.method, target.String(), body)
	if err != nil {
		return nil, &Error{Op: request.op, Cause: err}
	}

	message.URL = target
	message.Host = host
	message.ContentLength = int64(len(request.body))

	for name, values := range request.header {
		message.Header[name] = values
	}

	payload := request.payload
	if payload == "" {
		payload = EmptyPayload
	}

	credentials{accessKey: c.AccessKeyID, secret: c.SecretAccessKey, region: c.region()}.sign(message, payload, c.now())
	message.Header.Set("User-Agent", "pupitred")

	response, err := c.client().Do(message)
	if err != nil {
		return nil, &Error{Op: request.op, Cause: err}
	}

	if response.StatusCode < 200 || response.StatusCode > 299 {
		defer response.Body.Close()

		return nil, refusal(request, response)
	}

	return response, nil
}

func (c Client) address(key string, bucketOnly bool) (*url.URL, string, error) {
	endpoint, err := url.Parse(strings.TrimSuffix(c.Endpoint, "/"))
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "https" && endpoint.Scheme != "http") {
		return nil, "", fmt.Errorf("unreadable endpoint: %s", c.Endpoint)
	}

	host := endpoint.Host
	segments := []string{strings.TrimSuffix(endpoint.Path, "/")}

	if c.PathStyle {
		segments = append(segments, c.Bucket)
	} else {
		host = c.Bucket + "." + host
	}

	if !bucketOnly {
		segments = append(segments, key)
	}

	path := strings.Join(segments, "/")
	if !c.PathStyle && bucketOnly {
		path += "/"
	}

	return &url.URL{Scheme: endpoint.Scheme, Host: host, Path: path, RawPath: escape(path, false)}, host, nil
}

func (c Client) wait(ctx context.Context, retry int) error {
	delay := firstRetryDelay << (retry - 1)
	if c.Backoff != nil {
		delay = c.Backoff(retry)
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (c Client) region() string {
	if c.Region == "" {
		return "auto"
	}

	return c.Region
}

func (c Client) now() time.Time {
	if c.Now == nil {
		return time.Now()
	}

	return c.Now()
}

// Never follow a redirect: the signature names one host, and a bucket in another region says so in its refusal.
func (c Client) client() *http.Client {
	client := &http.Client{Transport: transport}

	if c.HTTP != nil {
		copied := *c.HTTP
		client = &copied
	}

	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	return client
}

func (c Client) partBytes() int {
	if c.PartBytes > 0 {
		return c.PartBytes
	}

	return DefaultPartBytes
}
