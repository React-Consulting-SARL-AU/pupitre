package seal

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"io"

	"pupitre.studio/agent/internal/contract"
)

const (
	magicBytes       = 8
	publicKeyBytes   = 32
	noncePrefixBytes = 8
	counterBytes     = 4
)

var (
	ErrNotABackup    = errors.New("the file is not a Pupitre backup")
	ErrChunkSize     = errors.New("the chunk size is out of bounds")
	ErrShortChunk    = errors.New("a chunk is shorter than its tag")
	ErrDoesNotOpen   = errors.New("a chunk does not open: wrong key, or the file was altered or cut")
	ErrHeaderOnly    = errors.New("the file ends after its header")
	ErrTooManyChunks = errors.New("the file holds more chunks than a counter numbers")
)

var (
	final    = []byte{1}
	notFinal = []byte{0}
)

// Fix what a real seal draws at random; only the fixtures set them.
type Options struct {
	EphemeralPrivateKey []byte
	NoncePrefix         []byte
	ChunkBytes          int
}

type writer struct {
	out     io.Writer
	aead    cipher.AEAD
	prefix  []byte
	buffer  []byte
	chunk   int
	counter uint32
	closed  bool
}

func NewWriter(out io.Writer, recipient []byte, options Options) (io.WriteCloser, error) {
	chunk := options.ChunkBytes
	if chunk == 0 {
		chunk = contract.Backup.Container.ChunkBytes
	}

	if chunk < contract.Backup.Container.MinChunkBytes || chunk > contract.Backup.Container.MaxChunkBytes {
		return nil, ErrChunkSize
	}

	ephemeral, err := ephemeralKey(options.EphemeralPrivateKey)
	if err != nil {
		return nil, err
	}

	prefix := options.NoncePrefix
	if prefix == nil {
		prefix = make([]byte, noncePrefixBytes)
		if _, err := rand.Read(prefix); err != nil {
			return nil, err
		}
	}

	header := make([]byte, 0, contract.Backup.Container.HeaderBytes)
	header = append(header, contract.Backup.Container.Magic...)
	header = append(header, ephemeral.PublicKey().Bytes()...)
	header = append(header, prefix...)
	header = binary.BigEndian.AppendUint32(header, uint32(chunk))

	peer, err := ecdh.X25519().NewPublicKey(recipient)
	if err != nil {
		return nil, ErrKeySize
	}

	shared, err := ephemeral.ECDH(peer)
	if err != nil {
		return nil, err
	}

	aead, err := chunkCipher(shared, header)
	if err != nil {
		return nil, err
	}

	if _, err := out.Write(header); err != nil {
		return nil, err
	}

	return &writer{out: out, aead: aead, prefix: prefix, buffer: make([]byte, 0, chunk), chunk: chunk}, nil
}

func ephemeralKey(fixed []byte) (*ecdh.PrivateKey, error) {
	if fixed != nil {
		return ecdh.X25519().NewPrivateKey(fixed)
	}

	return ecdh.X25519().GenerateKey(rand.Reader)
}

// A full chunk is never the last one: the last always holds less, possibly nothing.
func (w *writer) Write(data []byte) (int, error) {
	written := 0

	for len(data) > 0 {
		room := w.chunk - len(w.buffer)
		taken := min(room, len(data))

		w.buffer = append(w.buffer, data[:taken]...)
		data = data[taken:]
		written += taken

		if len(w.buffer) == w.chunk {
			if err := w.flush(notFinal); err != nil {
				return written, err
			}
		}
	}

	return written, nil
}

func (w *writer) Close() error {
	if w.closed {
		return nil
	}

	w.closed = true

	return w.flush(final)
}

func (w *writer) flush(aad []byte) error {
	if w.counter == ^uint32(0) {
		return ErrTooManyChunks
	}

	sealed := w.aead.Seal(nil, nonce(w.prefix, w.counter), w.buffer, aad)
	w.counter++
	w.buffer = w.buffer[:0]

	_, err := w.out.Write(sealed)

	return err
}

type reader struct {
	in      *bufio.Reader
	aead    cipher.AEAD
	prefix  []byte
	sealed  []byte
	pending []byte
	counter uint32
	done    bool
}

// Only the last chunk is sealed as final and it is always present, so a file cut at a chunk boundary does not open.
func NewReader(in io.Reader, private []byte) (io.Reader, error) {
	buffered := bufio.NewReader(in)

	header := make([]byte, contract.Backup.Container.HeaderBytes)
	if _, err := io.ReadFull(buffered, header); err != nil {
		return nil, ErrNotABackup
	}

	if string(header[:magicBytes]) != contract.Backup.Container.Magic {
		return nil, ErrNotABackup
	}

	chunk := int(binary.BigEndian.Uint32(header[magicBytes+publicKeyBytes+noncePrefixBytes:]))
	if chunk < contract.Backup.Container.MinChunkBytes || chunk > contract.Backup.Container.MaxChunkBytes {
		return nil, ErrChunkSize
	}

	key, err := ecdh.X25519().NewPrivateKey(private)
	if err != nil {
		return nil, ErrKeySize
	}

	ephemeral, err := ecdh.X25519().NewPublicKey(header[magicBytes : magicBytes+publicKeyBytes])
	if err != nil {
		return nil, ErrNotABackup
	}

	shared, err := key.ECDH(ephemeral)
	if err != nil {
		return nil, ErrDoesNotOpen
	}

	aead, err := chunkCipher(shared, header)
	if err != nil {
		return nil, err
	}

	prefix := append([]byte(nil), header[magicBytes+publicKeyBytes:magicBytes+publicKeyBytes+noncePrefixBytes]...)

	return &reader{in: buffered, aead: aead, prefix: prefix, sealed: make([]byte, chunk+contract.Backup.Container.TagBytes)}, nil
}

func (r *reader) Read(out []byte) (int, error) {
	for len(r.pending) == 0 {
		if r.done {
			return 0, io.EOF
		}

		if err := r.next(); err != nil {
			return 0, err
		}
	}

	copied := copy(out, r.pending)
	r.pending = r.pending[copied:]

	return copied, nil
}

// A full-sized chunk at the end of the file was sealed as not final, so it does not open as final.
func (r *reader) next() error {
	read, err := io.ReadFull(r.in, r.sealed)

	switch {
	case errors.Is(err, io.EOF):
		if r.counter == 0 {
			return ErrHeaderOnly
		}

		return ErrDoesNotOpen
	case errors.Is(err, io.ErrUnexpectedEOF):
		r.done = true
	case err != nil:
		return err
	default:
		if _, peeked := r.in.Peek(1); errors.Is(peeked, io.EOF) {
			r.done = true
		}
	}

	if read < contract.Backup.Container.TagBytes {
		return ErrShortChunk
	}

	aad := notFinal
	if r.done {
		aad = final
	}

	opened, err := r.aead.Open(nil, nonce(r.prefix, r.counter), r.sealed[:read], aad)
	if err != nil {
		return ErrDoesNotOpen
	}

	if r.counter == ^uint32(0) {
		return ErrTooManyChunks
	}

	r.counter++
	r.pending = opened

	return nil
}

func chunkCipher(shared, header []byte) (cipher.AEAD, error) {
	key, err := hkdf.Key(sha256.New, shared, header, contract.Backup.Container.Info, keyBytes)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	return cipher.NewGCM(block)
}

func nonce(prefix []byte, counter uint32) []byte {
	return binary.BigEndian.AppendUint32(append(make([]byte, 0, noncePrefixBytes+counterBytes), prefix...), counter)
}
