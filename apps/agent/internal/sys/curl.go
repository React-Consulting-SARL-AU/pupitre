package sys

import "strconv"

// A stalled vendor is dropped well before the 30-minute default, since the install lock is held meanwhile.
const (
	curlConnectSeconds = 20
	curlStallBytes     = 1024
	curlStallSeconds   = 60
	curlTextSeconds    = 120
	curlFileSeconds    = 25 * 60
)

var curlTransport = []string{"--proto", "=https", "--tlsv1.2", "--connect-timeout", strconv.Itoa(curlConnectSeconds)}

func CurlText(args ...string) []string {
	return curl("-fsSL", curlTextSeconds, args)
}

func CurlFile(path, url string) []string {
	return curl("-fsSL", curlFileSeconds, []string{"-o", path, url})
}

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
