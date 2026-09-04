//go:build !dev

package entitlement

import "pupitre.sh/agent/internal/contract"

// Without an enrolment there is no entitlement to check yet, so a release build starts restricted.
const buildEntitlement = contract.EntitlementRestricted
