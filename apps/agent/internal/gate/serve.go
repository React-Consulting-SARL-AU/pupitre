package gate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

// Reads its two files at start and again on SIGHUP; a file that fails to read keeps what was loaded before.
func Serve(dir string, listen string, logf func(format string, args ...any)) error {
	g := New()

	if err := reload(g, dir); err != nil {
		return err
	}

	hangups := make(chan os.Signal, 1)
	signal.Notify(hangups, syscall.SIGHUP)

	go func() {
		for range hangups {
			if err := reload(g, dir); err != nil {
				logf("reload refused: %v", err)
			}
		}
	}()

	server := &http.Server{
		Addr:              listen,
		Handler:           g,
		ReadHeaderTimeout: 20 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()

		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		_ = server.Shutdown(shutdown)
	}()

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}

func reload(g *Gate, dir string) error {
	var access Access
	if err := readJSON(filepath.Join(dir, filepath.Base(AccessPath)), &access); err != nil {
		return err
	}

	if access.Secret == "" {
		return fmt.Errorf("%s: no secret", AccessPath)
	}

	var routes Routes
	if err := readJSON(filepath.Join(dir, filepath.Base(RoutesPath)), &routes); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	g.Load(access, routes.Routes)

	return nil
}

func readJSON(path string, into any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	if err := json.Unmarshal(raw, into); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}

	return nil
}
