package selfupdate

import (
	"errors"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/platform"
	"pupitre.studio/agent/internal/protocol"
)

func badSignature(version string) *protocol.Error {
	return protocol.NewError(contract.ErrorBadSignature,
		i18n.T("selfupdate.signature.bad", version)).
		WithFix(i18n.T("selfupdate.signature.bad.fix"))
}

func unverifiable(cause error) *protocol.Error {
	return protocol.NewError(contract.ErrorBadSignature, i18n.T("selfupdate.signature.unverifiable", cause.Error())).
		WithFix(i18n.T("selfupdate.signature.unverifiable.fix"))
}

func corrupted(version, announced, computed string) *protocol.Error {
	return protocol.NewError(contract.ErrorBadSignature,
		i18n.T("selfupdate.corrupted", version, computed, announced)).
		WithFix(i18n.T("selfupdate.corrupted.fix"))
}

func refusedDowngrade(version, floor string) *protocol.Error {
	return protocol.NewError(contract.ErrorDowngradeRefused,
		i18n.T("selfupdate.downgrade.refused", version, floor)).
		WithFix(i18n.T("selfupdate.downgrade.refused.fix", floor))
}

func metadataFailed(version string, cause error) *protocol.Error {
	var failure *platform.Error
	if errors.As(cause, &failure) && (failure.NotFound() || failure.Unauthorized()) {
		return downloadFailed(version, cause)
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("selfupdate.metadata.unreadable", version, platform.Describe(cause))).
		WithFix(unreachableFix(cause))
}

func downloadFailed(version string, cause error) *protocol.Error {
	var failure *platform.Error
	if errors.As(cause, &failure) && failure.NotFound() {
		return protocol.NewError(contract.ErrorBadRequest, i18n.T("selfupdate.version.unpublished", version)).
			WithFix(i18n.T("selfupdate.version.unpublished.fix"))
	}

	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("selfupdate.token.refused", platform.Describe(cause))).
			WithFix(i18n.T("selfupdate.token.refused.fix"))
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("selfupdate.download.failed", platform.Describe(cause))).
		WithFix(unreachableFix(cause))
}

func stateFailed(cause error) *protocol.Error {
	var failure *platform.Error
	if errors.As(cause, &failure) && failure.Unauthorized() {
		return protocol.NewError(contract.ErrorEntitlementRequired, i18n.T("selfupdate.token.refused", platform.Describe(cause))).
			WithFix(i18n.T("selfupdate.token.refused.fix"))
	}

	return protocol.NewError(contract.ErrorInternal, i18n.T("selfupdate.state.unreadable", platform.Describe(cause))).
		WithFix(i18n.T("selfupdate.state.unreadable.fix"))
}

func unreachableFix(cause error) string {
	if platform.Down(cause) {
		return i18n.T("platform.down.fix")
	}

	return i18n.T("selfupdate.platform.unreachable.fix")
}

func restartFailed(version string, cause error) *protocol.Error {
	return protocol.NewError(contract.ErrorInternal,
		i18n.T("selfupdate.restart.failed", version, cause)).
		WithFix(i18n.T("selfupdate.restart.failed.fix"))
}

func silent(version, restored string, cause error) *protocol.Error {
	return protocol.NewError(contract.ErrorInternal,
		i18n.T("selfupdate.silent", version, cause, restored)).
		WithFix(i18n.T("selfupdate.silent.fix"))
}
