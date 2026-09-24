package s3

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// Kind is what a refusal means for the client, whatever the provider called it.
type Kind int

const (
	KindOther Kind = iota
	KindUnreachable
	KindNoBucket
	KindNoKey
	KindDenied
	KindBadKey
	KindBadSecret
	KindSkewed
	KindWrongRegion
)

type Error struct {
	Op      string
	Status  int
	Code    string
	Message string
	Region  string
	Cause   error
}

func (e *Error) Error() string {
	switch {
	case e.Cause != nil:
		return fmt.Sprintf("%s: %v", e.Op, e.Cause)
	case e.Message != "":
		return fmt.Sprintf("%s: %s (%d): %s", e.Op, e.Code, e.Status, e.Message)
	}

	return fmt.Sprintf("%s: %s (%d)", e.Op, e.Code, e.Status)
}

func (e *Error) Unwrap() error {
	return e.Cause
}

func (e *Error) Kind() Kind {
	if e.Cause != nil && e.Status == 0 {
		return KindUnreachable
	}

	switch e.Code {
	case "NoSuchBucket":
		return KindNoBucket
	case "NoSuchKey", "NoSuchUpload":
		return KindNoKey
	case "InvalidAccessKeyId":
		return KindBadKey
	case "SignatureDoesNotMatch":
		return KindBadSecret
	case "RequestTimeTooSkewed":
		return KindSkewed
	case "PermanentRedirect", "AuthorizationHeaderMalformed", "IllegalLocationConstraintException":
		return KindWrongRegion
	case "AccessDenied", "AllAccessDisabled", "Forbidden":
		return KindDenied
	}

	return KindOther
}

// KindOf reads what an error means, KindOther for anything that did not come from a bucket.
func KindOf(err error) Kind {
	var failure *Error
	if errors.As(err, &failure) {
		return failure.Kind()
	}

	return KindOther
}

type document struct {
	XMLName xml.Name
	Code    string `xml:"Code"`
	Message string `xml:"Message"`
	Region  string `xml:"Region"`
}

// A HEAD has no body to say why: the status is all there is, and the bucket's region rides on a header.
func refusal(request call, response *http.Response) *Error {
	failure := &Error{Op: request.op, Status: response.StatusCode, Region: response.Header.Get("X-Amz-Bucket-Region")}

	raw, _ := io.ReadAll(io.LimitReader(response.Body, maxDetailBytes))

	var parsed document
	if len(bytes.TrimSpace(raw)) > 0 && xml.Unmarshal(raw, &parsed) == nil {
		failure.Code = parsed.Code
		failure.Message = parsed.Message
		if parsed.Region != "" {
			failure.Region = parsed.Region
		}
	}

	if failure.Code == "" {
		failure.Code = codeOf(request, response.StatusCode)
	}

	return failure
}

func codeOf(request call, status int) string {
	switch status {
	case http.StatusNotFound:
		if request.bucket {
			return "NoSuchBucket"
		}

		return "NoSuchKey"
	case http.StatusForbidden:
		return "AccessDenied"
	case http.StatusMovedPermanently:
		return "PermanentRedirect"
	}

	return http.StatusText(status)
}

// Some answers carry their error under a 200: a completion or a copy that failed once the headers had left.
func embeddedError(op string, body []byte) *Error {
	var parsed document
	if xml.Unmarshal(body, &parsed) != nil || parsed.XMLName.Local != "Error" {
		return nil
	}

	return &Error{Op: op, Status: http.StatusOK, Code: parsed.Code, Message: parsed.Message}
}

// What deserves another try: the network, a bucket asking to slow down, a server that stumbled.
func transient(err error) bool {
	var failure *Error
	if !errors.As(err, &failure) {
		return false
	}

	if failure.Status == 0 {
		return true
	}

	switch failure.Code {
	case "SlowDown", "RequestTimeout", "InternalError", "ServiceUnavailable":
		return true
	}

	return failure.Status >= 500 || failure.Status == http.StatusTooManyRequests
}
