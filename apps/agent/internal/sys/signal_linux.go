package sys

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"syscall"
)

// The same numbers on amd64 and arm64: every system call added since 5.0 shares one table.
const (
	sysPidfdSendSignal = 424
	sysPidfdOpen       = 434
)

// The pidfd pins the process before its owner is read, so the signal reaches the very process that was checked or none.
func signalAs(pid, uid int, sig syscall.Signal) error {
	fd, _, errno := syscall.Syscall(sysPidfdOpen, uintptr(pid), 0, 0)
	if errno != 0 {
		return errno
	}
	defer syscall.Close(int(fd))

	owner, err := realUID(pid)
	if err != nil {
		return err
	}

	if owner != uid {
		return syscall.EPERM
	}

	if _, _, errno := syscall.Syscall6(sysPidfdSendSignal, fd, uintptr(sig), 0, 0, 0, 0); errno != 0 {
		return errno
	}

	return nil
}

func realUID(pid int) (int, error) {
	status, err := os.Open("/proc/" + strconv.Itoa(pid) + "/status")
	if err != nil {
		return -1, syscall.ESRCH
	}
	defer status.Close()

	scanner := bufio.NewScanner(status)
	for scanner.Scan() {
		ids, found := strings.CutPrefix(scanner.Text(), "Uid:")
		if !found {
			continue
		}

		fields := strings.Fields(ids)
		if len(fields) == 0 {
			break
		}

		return strconv.Atoi(fields[0])
	}

	return -1, syscall.ESRCH
}
