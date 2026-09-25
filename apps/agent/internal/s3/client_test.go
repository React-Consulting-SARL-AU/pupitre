package s3_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"testing"
	"time"

	"pupitre.studio/agent/internal/s3"
	"pupitre.studio/agent/internal/s3/s3test"
)

func digest(content []byte) string {
	sum := sha256.Sum256(content)

	return hex.EncodeToString(sum[:])
}

func TestASmallObjectGoesInOnePut(t *testing.T) {
	for _, pathStyle := range []bool{true, false} {
		fake := s3test.New(t, "backups")
		client := fake.Client(pathStyle)

		if err := client.HeadBucket(context.Background()); err != nil {
			t.Fatalf("path style %v: %v", pathStyle, err)
		}

		content := []byte("a small part")

		uploaded, err := client.Upload(context.Background(), "pupitre/srv/one.pupitre", bytes.NewReader(content))
		if err != nil {
			t.Fatal(err)
		}

		if uploaded.Bytes != int64(len(content)) || uploaded.SHA256 != digest(content) {
			t.Fatalf("uploaded = %+v", uploaded)
		}

		if fake.Calls("PutObject") != 1 || fake.Calls("CreateMultipartUpload") != 0 {
			t.Fatalf("a small object must go in one PUT")
		}
	}
}

func TestALargeStreamGoesInEqualPartsAndComesBackWhole(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)
	client.PartBytes = 1024

	content := bytes.Repeat([]byte("0123456789"), 350)

	uploaded, err := client.Upload(context.Background(), "k/big.pupitre", io.MultiReader(bytes.NewReader(content[:7]), bytes.NewReader(content[7:])))
	if err != nil {
		t.Fatal(err)
	}

	if uploaded.SHA256 != digest(content) || fake.Calls("UploadPart") != 4 || fake.Calls("CompleteMultipartUpload") != 1 {
		t.Fatalf("uploaded %+v in %d parts", uploaded, fake.Calls("UploadPart"))
	}

	body, err := client.Get(context.Background(), "k/big.pupitre")
	if err != nil {
		t.Fatal(err)
	}
	defer body.Close()

	back, err := io.ReadAll(body)
	if err != nil || !bytes.Equal(back, content) {
		t.Fatalf("the object read back is not what was sent: %v", err)
	}
}

func TestAPartIsRetriedThenTheUploadAbortedWhenItKeepsFailing(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)
	client.PartBytes = 1024

	fake.Refuse("UploadPart", http.StatusServiceUnavailable, "SlowDown")

	content := bytes.Repeat([]byte("x"), 2500)

	if _, err := client.Upload(context.Background(), "k/retried.pupitre", bytes.NewReader(content)); err != nil {
		t.Fatalf("one refusal must be retried: %v", err)
	}

	for range 3 {
		fake.Refuse("UploadPart", http.StatusInternalServerError, "InternalError")
	}

	_, err := client.Upload(context.Background(), "k/failed.pupitre", bytes.NewReader(content))
	if err == nil {
		t.Fatal("three refusals of the same part must fail the upload")
	}

	if fake.OpenUploads() != 0 || fake.Calls("AbortMultipartUpload") != 1 {
		t.Fatalf("a failed upload must be aborted: %d open", fake.OpenUploads())
	}

	if _, found := fake.Object("k/failed.pupitre"); found {
		t.Fatal("a failed upload must leave no object")
	}
}

func TestACompletionWhoseAnswerWasLostIsFoundInPlace(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)
	client.PartBytes = 1024

	fake.Lose("CompleteMultipartUpload")

	content := bytes.Repeat([]byte("x"), 2500)

	uploaded, err := client.Upload(context.Background(), "k/landed.pupitre", bytes.NewReader(content))
	if err != nil {
		t.Fatalf("the object is whole in the bucket, the upload went through: %v", err)
	}

	if stored, found := fake.Object("k/landed.pupitre"); !found || !bytes.Equal(stored, content) || uploaded.Bytes != int64(len(content)) {
		t.Fatalf("stored %d bytes, uploaded %+v", len(stored), uploaded)
	}

	if fake.Calls("CompleteMultipartUpload") != 2 || fake.Calls("HeadObject") != 1 || fake.Calls("AbortMultipartUpload") != 0 {
		t.Fatalf("complete %d, head %d, abort %d", fake.Calls("CompleteMultipartUpload"), fake.Calls("HeadObject"), fake.Calls("AbortMultipartUpload"))
	}
}

func TestAnUploadTheBucketNoLongerKnowsStillFails(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)
	client.PartBytes = 1024

	fake.Refuse("CompleteMultipartUpload", http.StatusNotFound, "NoSuchUpload")

	content := bytes.Repeat([]byte("x"), 2500)

	if _, err := client.Upload(context.Background(), "k/gone.pupitre", bytes.NewReader(content)); s3.KindOf(err) != s3.KindNoKey {
		t.Fatalf("an upload with nothing in place is a failure: %v", err)
	}
}

func TestAStreamThatBreaksLeavesNothingBehind(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)
	client.PartBytes = 1024

	broken := io.MultiReader(bytes.NewReader(bytes.Repeat([]byte("y"), 3000)), failing{})

	if _, err := client.Upload(context.Background(), "k/broken.pupitre", broken); err == nil || !errors.Is(err, errBroken) {
		t.Fatalf("got %v, want the producer's error", err)
	}

	if fake.OpenUploads() != 0 {
		t.Fatal("the upload of a broken stream must be aborted")
	}
}

var errBroken = errors.New("pg_dump died")

type failing struct{}

func (failing) Read([]byte) (int, error) {
	return 0, errBroken
}

func TestACopyStaysInsideTheBucket(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(false)
	fake.PutObject("pupitre/srv/old/project-a.pupitre", []byte("sealed bytes"), fake.Now)

	if err := client.Copy(context.Background(), "pupitre/srv/old/project-a.pupitre", "pupitre/srv/new/project-a.pupitre", 12); err != nil {
		t.Fatal(err)
	}

	copied, found := fake.Object("pupitre/srv/new/project-a.pupitre")
	if !found || string(copied) != "sealed bytes" || fake.Calls("CopyObject") != 1 {
		t.Fatalf("copy = %q, %v", copied, found)
	}

	err := client.Copy(context.Background(), "pupitre/srv/gone.pupitre", "pupitre/srv/x.pupitre", 1)
	if s3.KindOf(err) != s3.KindNoKey {
		t.Fatalf("a copy of a missing object: %v", err)
	}
}

func TestAListingWalksEveryPage(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)

	for _, key := range []string{"p/s/1/manifest.json", "p/s/1/setup.pupitre", "p/s/2/setup.pupitre", "p/s/3/manifest.json", "p/s/3/home.pupitre", "p/other"} {
		fake.PutObject(key, []byte(key), fake.Now)
	}

	objects, _, err := client.List(context.Background(), "p/s/", "")
	if err != nil || len(objects) != 5 {
		t.Fatalf("objects = %v, %v", objects, err)
	}

	_, prefixes, err := client.List(context.Background(), "p/s/", "/")
	if err != nil || len(prefixes) != 3 || prefixes[0] != "p/s/1/" || prefixes[2] != "p/s/3/" {
		t.Fatalf("prefixes = %v, %v", prefixes, err)
	}
}

func TestAbandonedUploadsAreListedAndAborted(t *testing.T) {
	fake := s3test.New(t, "backups")
	client := fake.Client(true)
	id := fake.Begin("p/s/9/project-x.pupitre", fake.Now.Add(-48*time.Hour))

	uploads, err := client.Uploads(context.Background(), "p/s/")
	if err != nil || len(uploads) != 1 || uploads[0].UploadID != id || uploads[0].Key != "p/s/9/project-x.pupitre" {
		t.Fatalf("uploads = %+v, %v", uploads, err)
	}

	if err := client.Abort(context.Background(), uploads[0].Key, uploads[0].UploadID); err != nil || fake.OpenUploads() != 0 {
		t.Fatalf("abort: %v", err)
	}
}

func TestRefusalsAreReadForWhatTheyMean(t *testing.T) {
	cases := []struct {
		status int
		code   string
		kind   s3.Kind
	}{
		{http.StatusForbidden, "AccessDenied", s3.KindDenied},
		{http.StatusNotFound, "NoSuchBucket", s3.KindNoBucket},
		{http.StatusForbidden, "RequestTimeTooSkewed", s3.KindSkewed},
		{http.StatusForbidden, "InvalidAccessKeyId", s3.KindBadKey},
		{http.StatusMovedPermanently, "PermanentRedirect", s3.KindWrongRegion},
	}

	for _, tc := range cases {
		fake := s3test.New(t, "backups")
		fake.Refuse("PutObject", tc.status, tc.code)

		err := fake.Client(true).Put(context.Background(), "k", []byte("x"), "")
		if s3.KindOf(err) != tc.kind {
			t.Fatalf("%s: kind %v (%v)", tc.code, s3.KindOf(err), err)
		}
	}

	wrongSecret := s3test.New(t, "backups").Client(true)
	wrongSecret.SecretAccessKey = "not the secret"

	if err := wrongSecret.HeadBucket(context.Background()); s3.KindOf(err) != s3.KindDenied {
		t.Fatalf("a HEAD refused for its signature reads as denied: %v", err)
	}

	elsewhere := s3test.New(t, "backups").Client(true)
	elsewhere.Bucket = "another"

	if err := elsewhere.HeadBucket(context.Background()); s3.KindOf(err) != s3.KindNoBucket {
		t.Fatalf("an unknown bucket: %v", err)
	}

	unreachable := s3.Client{Endpoint: "http://127.0.0.1:1", Bucket: "b", Backoff: func(int) time.Duration { return 0 }}

	if err := unreachable.HeadBucket(context.Background()); s3.KindOf(err) != s3.KindUnreachable {
		t.Fatalf("a closed port: %v", err)
	}
}
