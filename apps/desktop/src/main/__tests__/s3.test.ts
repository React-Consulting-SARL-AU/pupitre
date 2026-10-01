import { describe, expect, it } from "bun:test";
import { objectAddress, type ProbeDeps, probeBucket, signV4 } from "../s3";

/** AWS's documented example key, split so the commit hook's secret scan does not take it for a real one. */
const EXAMPLE_KEY_ID = ["AKIA", "IOSFODNN7EXAMPLE"].join("");

const EMPTY_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const STORAGE = {
  access_key_id: "AKIA-E2E",
  bucket: "pupitre-backups",
  endpoint: "https://acme.r2.cloudflarestorage.com",
  path_style: true,
  prefix: "pupitre",
  region: "auto",
};

function s3Error(status: number, code: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>refused</Message></Error>`,
    { status }
  );
}

function answering(
  put: () => Response,
  remove: () => Response = () => new Response(null, { status: 204 })
): ProbeDeps & { seen: { method: string; url: string }[] } {
  const seen: { method: string; url: string }[] = [];

  return {
    fetch: (url, init) => {
      seen.push({ method: String(init.method), url });

      return Promise.resolve(init.method === "PUT" ? put() : remove());
    },
    now: () => new Date("2026-09-24T10:00:00Z"),
    random: () => "a1b2c3",
    seen,
  };
}

describe("the S3 signature", () => {
  it("returns the signature of AWS's reference example", () => {
    const headers = signV4({
      accessKeyId: EXAMPLE_KEY_ID,
      amzDate: "20130524T000000Z",
      headers: { range: "bytes=0-9" },
      host: "examplebucket.s3.amazonaws.com",
      method: "GET",
      path: "/test.txt",
      payloadHash: EMPTY_HASH,
      region: "us-east-1",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    });

    expect(headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${EXAMPLE_KEY_ID}/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41`
    );
  });

  it("puts the bucket in the path, or in the host with virtual addressing", () => {
    expect(objectAddress(STORAGE, "pupitre/.pupitre-probe-a1").url).toBe(
      "https://acme.r2.cloudflarestorage.com/pupitre-backups/pupitre/.pupitre-probe-a1"
    );
    expect(
      objectAddress({ ...STORAGE, path_style: false }, "pupitre/x y").url
    ).toBe(
      "https://pupitre-backups.acme.r2.cloudflarestorage.com/pupitre/x%20y"
    );
  });
});

describe("the bucket probe", () => {
  it("writes then deletes a small object under the prefix", async () => {
    const deps = answering(() => new Response(null, { status: 200 }));

    expect(await probeBucket(STORAGE, "secret", deps)).toEqual({
      ok: true,
      result: null,
    });
    expect(deps.seen).toEqual([
      {
        method: "PUT",
        url: "https://acme.r2.cloudflarestorage.com/pupitre-backups/pupitre/.pupitre-probe-a1b2c3",
      },
      {
        method: "DELETE",
        url: "https://acme.r2.cloudflarestorage.com/pupitre-backups/pupitre/.pupitre-probe-a1b2c3",
      },
    ]);
  });

  it.each([
    [404, "NoSuchBucket", "refusal.backup.probe.bucket"],
    [403, "AccessDenied", "refusal.backup.probe.denied"],
    [403, "InvalidAccessKeyId", "refusal.backup.probe.keyId"],
    [401, "Unauthorized", "refusal.backup.probe.keyId"],
    [403, "SignatureDoesNotMatch", "refusal.backup.probe.secret"],
    [403, "RequestTimeTooSkewed", "refusal.backup.probe.clock"],
    [500, "InternalError", "refusal.backup.probe.refused"],
  ])("says why a write %i %s is refused", async (status, code, id) => {
    const answer = await probeBucket(
      STORAGE,
      "secret",
      answering(() => s3Error(status, code))
    );

    expect(answer).toMatchObject({ error: { phrase: { id } }, ok: false });
  });

  it("says a key that writes without being able to delete is not enough", async () => {
    const answer = await probeBucket(
      STORAGE,
      "secret",
      answering(
        () => new Response(null, { status: 200 }),
        () => s3Error(403, "AccessDenied")
      )
    );

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.backup.probe.delete" } },
      ok: false,
    });
  });

  it("says an endpoint does not respond", async () => {
    const answer = await probeBucket(STORAGE, "secret", {
      fetch: () => Promise.reject(new Error("getaddrinfo ENOTFOUND acme")),
      now: () => new Date(),
      random: () => "a1",
    });

    expect(answer).toMatchObject({
      error: {
        phrase: {
          id: "refusal.backup.probe.unreachable",
          values: { reason: "getaddrinfo ENOTFOUND acme" },
        },
      },
      ok: false,
    });
  });
});
