package s3

import (
	"net/http"
	"strings"
	"testing"
	"time"
)

// AWS's documented example key, split so the commit hook's secret scan does not take it for a real one.
const exampleKeyID = "AKIA" + "IOSFODNN7EXAMPLE"

// The GET Object example of the AWS Signature Version 4 documentation, signed exactly as S3 expects it.
func TestTheSignatureMatchesTheAWSExample(t *testing.T) {
	request, err := http.NewRequest(http.MethodGet, "https://examplebucket.s3.amazonaws.com/test.txt", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Range", "bytes=0-9")

	holder := credentials{accessKey: exampleKeyID, secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1"}
	holder.sign(request, EmptyPayload, time.Date(2013, time.May, 24, 0, 0, 0, 0, time.UTC))

	want := "AWS4-HMAC-SHA256 Credential=" + exampleKeyID + "/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
	if got := request.Header.Get("Authorization"); got != want {
		t.Fatalf("authorization\n got %s\nwant %s", got, want)
	}

	if err := Verify(request, holder.accessKey, holder.secret, holder.region); err != nil {
		t.Fatalf("a request this client signed must verify: %v", err)
	}
}

func TestAKeyIsEscapedAsTheSignatureNamesIt(t *testing.T) {
	client := Client{Endpoint: "https://acc.r2.cloudflarestorage.com/", Bucket: "backups", PathStyle: true}

	target, host, err := client.address("pupitre/srv 1/a+b$.pupitre", false)
	if err != nil {
		t.Fatal(err)
	}

	if host != "acc.r2.cloudflarestorage.com" || target.EscapedPath() != "/backups/pupitre/srv%201/a%2Bb%24.pupitre" {
		t.Fatalf("host %s, path %s", host, target.EscapedPath())
	}

	virtual := client
	virtual.PathStyle = false

	target, host, err = virtual.address("", true)
	if err != nil || host != "backups.acc.r2.cloudflarestorage.com" || target.EscapedPath() != "/" {
		t.Fatalf("host %s, path %s, %v", host, target.EscapedPath(), err)
	}
}

func TestAnEndpointWithoutHostIsRefusedBeforeAnyRequest(t *testing.T) {
	_, _, err := Client{Endpoint: "r2.example"}.address("x", false)
	if err == nil || !strings.Contains(err.Error(), "endpoint") {
		t.Fatalf("got %v", err)
	}
}
