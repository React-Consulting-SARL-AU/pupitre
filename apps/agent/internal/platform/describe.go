package platform

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"syscall"

	"pupitre.studio/agent/internal/i18n"
)

var (
	ErrUnreadableAnswer = errors.New("unreadable answer")
	ErrIncompleteAnswer = errors.New("incomplete answer")
	ErrOversizedAnswer  = errors.New("answer beyond the cap")
	ErrTooManyRedirects = errors.New("too many redirects")
)

// Leaves the path out: the reader needs to know what failed, not which endpoint was hit.
func Describe(err error) string {
	var failure *Error
	if !errors.As(err, &failure) {
		return err.Error()
	}

	if failure.Cause != nil {
		return describeCause(failure.Cause)
	}

	if failure.Message != "" {
		return fmt.Sprintf("%s (%d)", failure.Message, failure.Status)
	}

	if failure.Down() {
		return i18n.T("platform.down", failure.Status)
	}

	return i18n.T("platform.answered", failure.Status)
}

// A 5xx: the edge answering without the platform behind it, as during a deploy.
func (e *Error) Down() bool {
	return e.Cause == nil && e.Status >= http.StatusInternalServerError
}

func Down(err error) bool {
	var failure *Error

	return errors.As(err, &failure) && failure.Down()
}

func describeCause(cause error) string {
	var dns *net.DNSError
	if errors.As(cause, &dns) {
		return i18n.T("platform.unresolved", dns.Name)
	}

	var timeout interface{ Timeout() bool }
	if errors.Is(cause, context.DeadlineExceeded) || (errors.As(cause, &timeout) && timeout.Timeout()) {
		return i18n.T("platform.timeout")
	}

	if errors.Is(cause, syscall.ECONNREFUSED) {
		return i18n.T("platform.connection.refused")
	}

	var certificate *tls.CertificateVerificationError
	if errors.As(cause, &certificate) {
		return i18n.T("platform.certificate", certificate.Err)
	}

	switch {
	case errors.Is(cause, ErrNoToken):
		return i18n.T("platform.token.none")
	case errors.Is(cause, ErrUnreadableAnswer), errors.Is(cause, ErrOversizedAnswer):
		return i18n.T("platform.answer.unreadable")
	case errors.Is(cause, ErrIncompleteAnswer):
		return i18n.T("platform.answer.incomplete")
	case errors.Is(cause, ErrTooManyRedirects):
		return i18n.T("platform.redirects")
	}

	return i18n.T("platform.unreachable", cause)
}
