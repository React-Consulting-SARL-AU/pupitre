package selfupdate

import (
	"strconv"
	"strings"
)

type parsedVersion struct {
	core       [3]int
	prerelease []string
}

// Semver, the same ordering as the platform's: build metadata is ignored, a prerelease sorts below the release it precedes, and two versions that are not semver fall back on a plain string order.
func CompareVersions(left, right string) int {
	parsedLeft, leftOK := parseVersion(left)
	parsedRight, rightOK := parseVersion(right)

	if !(leftOK && rightOK) {
		return strings.Compare(left, right)
	}

	for index, part := range parsedLeft.core {
		if other := parsedRight.core[index]; part != other {
			return sign(part - other)
		}
	}

	return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease)
}

func Older(candidate, reference string) bool {
	return CompareVersions(candidate, reference) < 0
}

func parseVersion(value string) (parsedVersion, bool) {
	if build := strings.IndexByte(value, '+'); build >= 0 {
		value = value[:build]
	}

	core := value

	var prerelease []string
	if dash := strings.IndexByte(value, '-'); dash >= 0 {
		core = value[:dash]
		prerelease = strings.Split(value[dash+1:], ".")
	}

	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return parsedVersion{}, false
	}

	var parsed parsedVersion
	for index, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return parsedVersion{}, false
		}

		parsed.core[index] = number
	}

	for _, identifier := range prerelease {
		if identifier == "" {
			return parsedVersion{}, false
		}
	}

	parsed.prerelease = prerelease

	return parsed, true
}

func comparePrerelease(left, right []string) int {
	if len(left) == 0 || len(right) == 0 {
		return sign(len(right) - len(left))
	}

	for index, identifier := range left {
		if index >= len(right) {
			return 1
		}

		if verdict := compareIdentifiers(identifier, right[index]); verdict != 0 {
			return verdict
		}
	}

	return sign(len(left) - len(right))
}

func compareIdentifiers(left, right string) int {
	leftNumber, leftErr := strconv.Atoi(left)
	rightNumber, rightErr := strconv.Atoi(right)
	leftNumeric, rightNumeric := leftErr == nil, rightErr == nil

	if leftNumeric && rightNumeric {
		return sign(leftNumber - rightNumber)
	}

	if leftNumeric != rightNumeric {
		if leftNumeric {
			return -1
		}

		return 1
	}

	return strings.Compare(left, right)
}

func sign(value int) int {
	switch {
	case value < 0:
		return -1
	case value > 0:
		return 1
	default:
		return 0
	}
}
