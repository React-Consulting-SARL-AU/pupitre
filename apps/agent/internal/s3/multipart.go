package s3

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// A failed upload is aborted on its own context: the one it failed on may be the reason.
const abortTimeout = time.Minute

type completedPart struct {
	Number int    `xml:"PartNumber"`
	ETag   string `xml:"ETag"`
}

type multipart struct {
	client Client
	key    string
	id     string
	parts  []completedPart
}

func (c Client) Upload(ctx context.Context, key string, r io.Reader) (Uploaded, error) {
	digest := sha256.New()
	buffer := make([]byte, c.partBytes())

	read, err := io.ReadFull(r, buffer)
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		digest.Write(buffer[:read])

		if err := c.Put(ctx, key, buffer[:read], ""); err != nil {
			return Uploaded{}, err
		}

		return Uploaded{Bytes: int64(read), SHA256: hex.EncodeToString(digest.Sum(nil))}, nil
	}

	if err != nil {
		return Uploaded{}, err
	}

	upload, err := c.begin(ctx, key)
	if err != nil {
		return Uploaded{}, err
	}

	total, err := upload.send(ctx, r, buffer, read, digest)
	if err != nil {
		upload.abort()

		return Uploaded{}, err
	}

	if err := upload.complete(ctx, total); err != nil {
		upload.abort()

		return Uploaded{}, err
	}

	return Uploaded{Bytes: total, SHA256: hex.EncodeToString(digest.Sum(nil))}, nil
}

func (c Client) begin(ctx context.Context, key string) (*multipart, error) {
	var created struct {
		UploadID string `xml:"UploadId"`
	}

	if err := c.decode(ctx, call{op: "CreateMultipartUpload", method: http.MethodPost, key: key, query: url.Values{"uploads": {""}}}, &created); err != nil {
		return nil, err
	}

	if created.UploadID == "" {
		return nil, &Error{Op: "CreateMultipartUpload", Status: http.StatusOK, Code: "NoUploadId"}
	}

	return &multipart{client: c, key: key, id: created.UploadID}, nil
}

func (m *multipart) send(ctx context.Context, r io.Reader, buffer []byte, read int, digest io.Writer) (int64, error) {
	var total int64

	for number := 1; ; number++ {
		if number > maxParts {
			return 0, ErrTooLarge
		}

		digest.Write(buffer[:read])
		total += int64(read)

		if err := m.part(ctx, number, buffer[:read]); err != nil {
			return 0, err
		}

		next, err := io.ReadFull(r, buffer)
		switch {
		case errors.Is(err, io.EOF):
			return total, nil
		case errors.Is(err, io.ErrUnexpectedEOF), err == nil:
			read = next
		default:
			return 0, err
		}
	}
}

func (m *multipart) part(ctx context.Context, number int, body []byte) error {
	query := url.Values{"partNumber": {strconv.Itoa(number)}, "uploadId": {m.id}}

	answer, err := m.client.exchange(ctx, call{op: "UploadPart", method: http.MethodPut, key: m.key, query: query, body: body, payload: UnsignedPayload})
	if err != nil {
		return err
	}

	m.parts = append(m.parts, completedPart{Number: number, ETag: answer.header.Get("ETag")})

	return nil
}

func (m *multipart) complete(ctx context.Context, total int64) error {
	body, err := xml.Marshal(struct {
		XMLName xml.Name        `xml:"CompleteMultipartUpload"`
		Parts   []completedPart `xml:"Part"`
	}{Parts: m.parts})
	if err != nil {
		return err
	}

	header := http.Header{"Content-Type": {"application/xml"}}

	answer, err := m.client.exchange(ctx, call{
		op:      "CompleteMultipartUpload",
		method:  http.MethodPost,
		key:     m.key,
		query:   url.Values{"uploadId": {m.id}},
		header:  header,
		body:    body,
		payload: hashHex(body),
	})
	if m.landed(ctx, err, total) {
		return nil
	}

	if err != nil {
		return err
	}

	if failure := embeddedError("CompleteMultipartUpload", answer.body); failure != nil {
		return failure
	}

	return nil
}

// A retried completion whose first answer was lost finds NoSuchUpload, yet the whole object is under its key.
func (m *multipart) landed(ctx context.Context, err error, total int64) bool {
	var failure *Error
	if !errors.As(err, &failure) || failure.Code != "NoSuchUpload" {
		return false
	}

	size, headErr := m.client.Size(ctx, m.key)

	return headErr == nil && size == total
}

func (m *multipart) abort() {
	ctx, cancel := context.WithTimeout(context.Background(), abortTimeout)
	defer cancel()

	_ = m.client.Abort(ctx, m.key, m.id)
}

func (c Client) Copy(ctx context.Context, source, destination string, size int64) error {
	header := http.Header{"X-Amz-Copy-Source": {c.copySource(source)}}

	if size <= singleCopyLimit {
		answer, err := c.exchange(ctx, call{op: "CopyObject", method: http.MethodPut, key: destination, header: header})
		if err != nil {
			return err
		}

		if failure := embeddedError("CopyObject", answer.body); failure != nil {
			return failure
		}

		return nil
	}

	upload, err := c.begin(ctx, destination)
	if err != nil {
		return err
	}

	if err := upload.copyRanges(ctx, header, size); err != nil {
		upload.abort()

		return err
	}

	if err := upload.complete(ctx, size); err != nil {
		upload.abort()

		return err
	}

	return nil
}

func (m *multipart) copyRanges(ctx context.Context, header http.Header, size int64) error {
	for number, start := 1, int64(0); start < size; number, start = number+1, start+copyPartBytes {
		end := min(start+copyPartBytes, size) - 1

		ranged := header.Clone()
		ranged.Set("X-Amz-Copy-Source-Range", "bytes="+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10))

		query := url.Values{"partNumber": {strconv.Itoa(number)}, "uploadId": {m.id}}

		answer, err := m.client.exchange(ctx, call{op: "UploadPartCopy", method: http.MethodPut, key: m.key, query: query, header: ranged})
		if err != nil {
			return err
		}

		var copied struct {
			ETag string `xml:"ETag"`
		}

		if failure := embeddedError("UploadPartCopy", answer.body); failure != nil {
			return failure
		}

		if err := xml.Unmarshal(answer.body, &copied); err != nil {
			return &Error{Op: "UploadPartCopy", Status: http.StatusOK, Cause: err}
		}

		m.parts = append(m.parts, completedPart{Number: number, ETag: copied.ETag})
	}

	return nil
}

func (c Client) copySource(key string) string {
	return "/" + escape(c.Bucket, true) + "/" + strings.TrimPrefix(escape(key, false), "/")
}
