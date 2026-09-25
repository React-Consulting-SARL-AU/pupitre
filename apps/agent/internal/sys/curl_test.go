package sys

import (
	"slices"
	"strconv"
	"testing"
)

func flag(argv []string, name string) (int, bool) {
	at := slices.Index(argv, name)
	if at < 0 || at+1 >= len(argv) {
		return 0, false
	}

	value, err := strconv.Atoi(argv[at+1])

	return value, err == nil
}

func TestEveryCurlGivesUpWellBeforeTheCommandTimeout(t *testing.T) {
	for name, argv := range map[string][]string{
		"text":     CurlText("https://example.org/index.json"),
		"file":     CurlFile("/var/lib/pupitre/downloads/tool", "https://example.org/tool"),
		"redirect": CurlRedirect("https://example.org/latest"),
	} {
		if argv[0] != "curl" || argv[len(argv)-1][:8] != "https://" {
			t.Errorf("%s: argv = %v", name, argv)
		}

		for _, required := range []string{"--proto", "--tlsv1.2", "--connect-timeout", "--speed-time", "--max-time"} {
			if !slices.Contains(argv, required) {
				t.Errorf("%s: %s missing from %v", name, required, argv)
			}
		}

		if seconds, ok := flag(argv, "--max-time"); !ok || seconds >= int(DefaultTimeout.Seconds()) {
			t.Errorf("%s: --max-time %d must end before the %s a command gets", name, seconds, DefaultTimeout)
		}
	}
}

func TestOnlyTheRedirectReaderDoesNotFollow(t *testing.T) {
	if slices.Contains(CurlRedirect("https://example.org/latest"), "-fsSL") || !slices.Contains(CurlText("https://example.org"), "-fsSL") {
		t.Fatal("a redirect is read, not followed; everything else follows")
	}
}
