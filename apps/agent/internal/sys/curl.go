package sys

import "strconv"

// A vendor that stops answering is given up on within these bounds, not at the
// thirty minutes a command gets by default: the install lock is held meanwhile.
const (
	curlConnectSeconds = 20
	curlStallBytes     = 1024
	curlStallSeconds   = 60
	curlTextSeconds    = 120
	curlFileSeconds    = 25 * 60
)

var curlTransport = []string{"--proto", "=https", "--tlsv1.2", "--connect-timeout", strconv.Itoa(curlConnectSeconds)}

// CurlText reads a small document — an index, a version, a checksum, a key — to standard output, or to the file an -o in args names.
func CurlText(args ...string) []string {
	return curl("-fsSL", curlTextSeconds, args)
}

// CurlFile downloads url to path: a slow link gets its time, a stalled one is dropped after a minute.
func CurlFile(path, url string) []string {
	return curl("-fsSL", curlFileSeconds, []string{"-o", path, url})
}

// CurlRedirect prints where url redirects, without following it: a "latest" link names its version that way.
func CurlRedirect(url string) []string {
	return curl("-fsS", curlTextSeconds, []string{"-o", "/dev/null", "-w", "%{redirect_url}", url})
}

func curl(flags string, maxSeconds int, args []string) []string {
	argv := append([]string{"curl", flags}, curlTransport...)
	argv = append(argv,
		"--speed-limit", strconv.Itoa(curlStallBytes),
		"--speed-time", strconv.Itoa(curlStallSeconds),
		"--max-time", strconv.Itoa(maxSeconds),
	)

	return append(argv, args...)
}
