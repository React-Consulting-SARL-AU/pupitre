package selfupdate_test

import (
	"testing"

	"pupitre.studio/agent/internal/selfupdate"
)

func TestCompareVersionsOrdersSemver(t *testing.T) {
	cases := []struct {
		left  string
		right string
		want  int
	}{
		{"1.0.0", "1.0.0", 0},
		{"1.0.1", "1.0.0", 1},
		{"1.1.0", "1.0.9", 1},
		{"2.0.0", "10.0.0", -1},
		{"0.9.0", "1.0.0", -1},
		{"1.0.0-beta.1", "1.0.0", -1},
		{"1.0.0-beta.2", "1.0.0-beta.10", -1},
		{"1.0.0-beta", "1.0.0-alpha", 1},
		{"1.0.0+build.7", "1.0.0", 0},
	}

	for _, tc := range cases {
		if got := selfupdate.CompareVersions(tc.left, tc.right); got != tc.want {
			t.Errorf("CompareVersions(%q, %q) = %d, want %d", tc.left, tc.right, got, tc.want)
		}

		if got := selfupdate.CompareVersions(tc.right, tc.left); got != -tc.want {
			t.Errorf("CompareVersions(%q, %q) = %d, want %d", tc.right, tc.left, got, -tc.want)
		}
	}
}

func TestCompareVersionsFallsBackOnTheStringOrder(t *testing.T) {
	if selfupdate.CompareVersions("nightly", "nightly") != 0 {
		t.Fatal("two identical non-semver versions must compare equal")
	}

	if !selfupdate.Older("1.0.0", "nightly") || !selfupdate.Older("1.4.0", "dev") {
		t.Fatal("the fallback order must stay total")
	}

	if selfupdate.Older("nightly", "1.0.0") {
		t.Fatal("the fallback order must stay antisymmetric")
	}
}

func TestOlderNamesTheStrictOrder(t *testing.T) {
	if !selfupdate.Older("0.9.0", "1.0.0") {
		t.Fatal("0.9.0 comes before 1.0.0")
	}

	if selfupdate.Older("1.0.0", "1.0.0") {
		t.Fatal("a version does not come before itself")
	}
}
