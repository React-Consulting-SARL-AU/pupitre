package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/signal"
	"syscall"

	"pupitre.studio/agent/internal/daemon"
)

func runDaemon(agent *daemon.Daemon, stderr io.Writer) int {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := agent.Run(ctx); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	return 0
}

// The enrolment token arrives on the standard input, never on the command line: an argument would show up in ps for anyone on the machine.
func runEnroll(agent *daemon.Daemon, stdin io.Reader, stderr io.Writer) int {
	token, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && token == "" {
		fmt.Fprintln(stderr, "enrolment token expected on standard input")
		return 2
	}

	if err := agent.Enroll(token, ""); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}

	fmt.Fprintln(stderr, "server enrolled")

	if _, err := agent.Sync(); err != nil {
		fmt.Fprintf(stderr, "first state not read, the agent will retry: %s\n", err)
	}

	return 0
}
