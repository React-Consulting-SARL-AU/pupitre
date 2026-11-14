package mcp

import (
	"strconv"
	"strings"
)

const (
	escape  = '\x1b'
	bell    = '\x07'
	tabStop = 8
)

// A process under tmux believes it writes to a terminal: Gradle, npm or cargo redraw their progress in place,
// so the log holds every frame and its cursor moves. The model reads the last frame, as a screen would show it.
func Plain(lines []string) []string {
	var view screen

	view.write([]rune(strings.Join(lines, "\n")))

	return view.lines()
}

type screen struct {
	rows     [][]rune
	row, col int
}

func (s *screen) write(input []rune) {
	for at := 0; at < len(input); at++ {
		switch char := input[at]; {
		case char == '\n':
			s.moveTo(s.row+1, 0)
		case char == '\r':
			s.col = 0
		case char == '\b':
			s.col = max(s.col-1, 0)
		case char == '\t':
			s.put(' ')

			for s.col%tabStop != 0 {
				s.put(' ')
			}
		case char == escape:
			at = s.sequence(input, at+1)
		case char >= ' ':
			s.put(char)
		}
	}
}

// Returns the index of the sequence's last rune.
func (s *screen) sequence(input []rune, at int) int {
	if at >= len(input) {
		return at
	}

	switch input[at] {
	case '[':
		return s.control(input, at+1)
	case ']':
		return operatingCommandEnd(input, at+1)
	case '(', ')', '#':
		return at + 1
	}

	return at
}

func (s *screen) control(input []rune, at int) int {
	start := at

	for at < len(input) && (input[at] < '@' || input[at] > '~') {
		at++
	}

	if at >= len(input) {
		return at
	}

	parameters := string(input[start:at])
	if strings.HasPrefix(parameters, "?") {
		return at
	}

	count := max(firstNumber(parameters, 1), 1)

	switch input[at] {
	case 'A':
		s.moveTo(s.row-count, s.col)
	case 'B':
		s.moveTo(s.row+count, s.col)
	case 'C':
		s.col += count
	case 'D':
		s.col = max(s.col-count, 0)
	case 'E':
		s.moveTo(s.row+count, 0)
	case 'F':
		s.moveTo(s.row-count, 0)
	case 'G':
		s.col = count - 1
	case 'K':
		s.eraseLine(firstNumber(parameters, 0))
	case 'J':
		s.eraseBelow(firstNumber(parameters, 0))
	}

	return at
}

func operatingCommandEnd(input []rune, at int) int {
	for ; at < len(input); at++ {
		if input[at] == bell {
			return at
		}

		if input[at] == escape && at+1 < len(input) && input[at+1] == '\\' {
			return at + 1
		}
	}

	return at
}

func firstNumber(parameters string, fallback int) int {
	first, _, _ := strings.Cut(parameters, ";")

	number, err := strconv.Atoi(first)
	if err != nil {
		return fallback
	}

	return number
}

func (s *screen) moveTo(row, col int) {
	s.row = max(row, 0)
	s.col = col

	for len(s.rows) <= s.row {
		s.rows = append(s.rows, nil)
	}
}

func (s *screen) put(char rune) {
	s.moveTo(s.row, s.col)

	line := s.rows[s.row]
	for len(line) <= s.col {
		line = append(line, ' ')
	}

	line[s.col] = char
	s.rows[s.row] = line
	s.col++
}

func (s *screen) eraseLine(mode int) {
	s.moveTo(s.row, s.col)

	line := s.rows[s.row]

	switch mode {
	case 0:
		s.rows[s.row] = line[:min(s.col, len(line))]
	case 1:
		for at := 0; at <= s.col && at < len(line); at++ {
			line[at] = ' '
		}
	default:
		s.rows[s.row] = nil
	}
}

func (s *screen) eraseBelow(mode int) {
	if mode != 0 {
		return
	}

	s.eraseLine(0)
	s.rows = s.rows[:s.row+1]
}

// Blank runs left by erased frames read as one empty line.
func (s *screen) lines() []string {
	plain := make([]string, 0, len(s.rows))
	blank := true

	for _, row := range s.rows {
		line := strings.TrimRight(string(row), " ")

		if line == "" && blank {
			continue
		}

		blank = line == ""
		plain = append(plain, line)
	}

	if len(plain) > 0 && plain[len(plain)-1] == "" {
		plain = plain[:len(plain)-1]
	}

	return plain
}
