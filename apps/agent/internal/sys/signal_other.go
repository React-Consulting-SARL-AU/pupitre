//go:build !linux

package sys

import "syscall"

// Only Linux pins a process by descriptor; elsewhere the agent never runs as root, and the kernel's own rule already spares other accounts.
func signalAs(pid, _ int, sig syscall.Signal) error {
	return syscall.Kill(pid, sig)
}
