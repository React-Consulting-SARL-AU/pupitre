import { createHash, createHmac, randomBytes } from "node:crypto";
import type { AgentResponse } from "@shared/agent";
import type { BackupStorage } from "@shared/backups";
import { refuseWith } from "./refusal";

/**
 * Just enough of S3 to check a bucket before the connection is kept: an AWS
 * Signature Version 4 signer, and a probe that writes then deletes one small
 * object where backups will go. The servers do the real work; this is the
 * laptop making sure the reader typed a key that will let them.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";

const SERVICE = "s3";

const DATE_SEPARATORS = /[-:]/g;

const MILLISECONDS = /\.\d{3}/;

const TRAILING_SLASH = /\/$/;

/** A bucket that has not answered by then is not going to. */
const CALL_MS = 15_000;

export interface SignedRequest {
  method: string;
  /** The canonical URI, already encoded: `/bucket/key` or `/key`. */
  path: string;
  host: string;
  /** Lower-case names; `host`, `x-amz-date` and `x-amz-content-sha256` are added. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `20130524T000000Z`. */
  amzDate: string;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

/** RFC 3986 unreserved characters stay; everything else is percent-encoded, as SigV4 wants it. */
export function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** The headers of a signed request, `authorization` among them. */
export function signV4(request: SignedRequest): Record<string, string> {
  const date = request.amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...request.headers,
    host: request.host,
    "x-amz-content-sha256": request.payloadHash,
    "x-amz-date": request.amzDate,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonical = [
    request.method,
    request.path,
    "",
    ...names.map((name) => `${name}:${headers[name]?.trim()}`),
    "",
    signedHeaders,
    request.payloadHash,
  ].join("\n");
  const scope = `${date}/${request.region}/${SERVICE}/aws4_request`;
  const toSign = [ALGORITHM, request.amzDate, scope, sha256(canonical)].join(
    "\n"
  );
  const key = hmac(
    hmac(
      hmac(hmac(`AWS4${request.secretAccessKey}`, date), request.region),
      SERVICE
    ),
    "aws4_request"
  );
  const signature = createHmac("sha256", key).update(toSign).digest("hex");

  return {
    ...headers,
    authorization: `${ALGORITHM} Credential=${request.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export function amzDateOf(now: Date): string {
  return now
    .toISOString()
    .replace(DATE_SEPARATORS, "")
    .replace(MILLISECONDS, "");
}

/** Where an object lies: under the endpoint's path for path-style, in the bucket's own host otherwise. */
export function objectAddress(
  storage: Pick<BackupStorage, "endpoint" | "bucket" | "path_style">,
  key: string
): { url: string; host: string; path: string } {
  const endpoint = new URL(storage.endpoint);
  const encodedKey = key.split("/").map(encodeSegment).join("/");
  const base = endpoint.pathname.replace(TRAILING_SLASH, "");
  const host = storage.path_style
    ? endpoint.host
    : `${storage.bucket}.${endpoint.host}`;
  const path = storage.path_style
    ? `${base}/${encodeSegment(storage.bucket)}/${encodedKey}`
    : `${base}/${encodedKey}`;

  return { host, path, url: `${endpoint.protocol}//${host}${path}` };
}

export interface ProbeDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => Date;
  random: () => string;
}

export const PROBE_DEPS: ProbeDeps = {
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
  random: () => randomBytes(6).toString("hex"),
};

const S3_CODE = /<Code>([^<]*)<\/Code>/;

/**
 * S3's own refusal codes, each with the sentence that says what to change.
 * R2 answers `Unauthorized` for an access key it does not know, where AWS says
 * `InvalidAccessKeyId`.
 */
const REFUSALS: Record<string, string> = {
  AccessDenied: "refusal.backup.probe.denied",
  AllAccessDisabled: "refusal.backup.probe.denied",
  InvalidAccessKeyId: "refusal.backup.probe.keyId",
  Unauthorized: "refusal.backup.probe.keyId",
  InvalidBucketName: "refusal.backup.probe.bucket",
  NoSuchBucket: "refusal.backup.probe.bucket",
  RequestTimeTooSkewed: "refusal.backup.probe.clock",
  SignatureDoesNotMatch: "refusal.backup.probe.secret",
};

async function refusalOf(
  response: Response,
  deleting: boolean
): Promise<AgentResponse<never>> {
  const body = await response.text().catch(() => "");
  const code = S3_CODE.exec(body)?.[1] ?? "";
  const known = REFUSALS[code];

  if (deleting && known === "refusal.backup.probe.denied") {
    return refuseWith("bad_request", "refusal.backup.probe.delete");
  }

  if (known) {
    return refuseWith("bad_request", known);
  }

  if (response.status === 404) {
    return refuseWith("bad_request", "refusal.backup.probe.bucket");
  }

  return response.status === 403
    ? refuseWith("bad_request", "refusal.backup.probe.denied")
    : refuseWith("bad_request", "refusal.backup.probe.refused", {
        code: code || String(response.status),
      });
}

/**
 * One small object written then deleted under the prefix, signed with the key
 * the reader gave: what every backup will do, done once before anything is
 * kept. The delete matters as much as the write — pruning old backups needs it.
 */
export async function probeBucket(
  storage: BackupStorage,
  secretAccessKey: string,
  deps: ProbeDeps = PROBE_DEPS
): Promise<AgentResponse<null>> {
  const key = `${storage.prefix}/.pupitre-probe-${deps.random()}`;
  const address = objectAddress(storage, key);
  const body = Buffer.from("pupitre\n");

  const send = (method: "PUT" | "DELETE") => {
    const payload = method === "PUT" ? body : Buffer.alloc(0);
    const headers = signV4({
      accessKeyId: storage.access_key_id,
      amzDate: amzDateOf(deps.now()),
      headers: {},
      host: address.host,
      method,
      path: address.path,
      payloadHash: sha256(payload),
      region: storage.region,
      secretAccessKey,
    });
    const { host: _host, ...sent } = headers;

    return deps.fetch(address.url, {
      ...(method === "PUT" ? { body: payload } : {}),
      headers: sent,
      method,
      signal: AbortSignal.timeout(CALL_MS),
    });
  };

  try {
    const written = await send("PUT");

    if (!written.ok) {
      return await refusalOf(written, false);
    }

    const deleted = await send("DELETE");

    return deleted.ok || deleted.status === 404
      ? { ok: true, result: null }
      : await refusalOf(deleted, true);
  } catch (failure) {
    return refuseWith("bad_request", "refusal.backup.probe.unreachable", {
      endpoint: storage.endpoint,
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }
}
