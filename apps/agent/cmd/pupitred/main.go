package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"
)

var version = "dev"

type request struct {
	ID  int64  `json:"id"`
	Cmd string `json:"cmd"`
}

type responseError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type response struct {
	ID     int64          `json:"id"`
	OK     bool           `json:"ok"`
	Result map[string]any `json:"result,omitempty"`
	Error  *responseError `json:"error,omitempty"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	switch os.Args[1] {
	case "version":
		fmt.Println("pupitred " + version)
	case "serve":
		if err := serve(os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: pupitred <version|serve>")
}

func serve(in io.Reader, out io.Writer) error {
	scanner := bufio.NewScanner(in)
	encoder := json.NewEncoder(out)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		if err := encoder.Encode(handle(line)); err != nil {
			return err
		}
	}

	return scanner.Err()
}

func handle(line []byte) response {
	var req request
	if err := json.Unmarshal(line, &req); err != nil {
		return response{
			ID:    req.ID,
			Error: &responseError{Code: "invalid_request", Message: err.Error()},
		}
	}

	switch req.Cmd {
	case "ping":
		return response{
			ID:     req.ID,
			OK:     true,
			Result: map[string]any{"ts": time.Now().UTC().Format(time.RFC3339)},
		}
	default:
		return response{
			ID:    req.ID,
			Error: &responseError{Code: "unknown_command", Message: "unknown command: " + req.Cmd},
		}
	}
}
