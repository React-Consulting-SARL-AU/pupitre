import { describe, expect, it } from "bun:test";
import {
  awsEndpoint,
  driftsFrom,
  providerOf,
  r2AccountOf,
  r2Endpoint,
  storageOf,
  storageProblems,
  switchedTo,
} from "../backup-providers";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

const R2 = `https://${ACCOUNT}.r2.cloudflarestorage.com`;

const VIEW = {
  ...storageOf(null),
  access_key_id: "AKIA-TEST",
  bucket: "backups",
  endpoint: R2,
  kdf_salt: "AAECAwQFBgcICQoLDA0ODw==",
  recipient: "ms1b2m6G3lR0b3v8C9W3dGdtS1XU9Qp3mM5o6f7g8h0=",
};

describe("a bucket's provider", () => {
  it("is read from the endpoint, R2 for a still-empty bucket", () => {
    expect(providerOf("")).toBe("r2");
    expect(providerOf(R2)).toBe("r2");
    expect(providerOf("https://s3.eu-west-3.amazonaws.com")).toBe("aws");
    expect(providerOf("https://s3.fr-par.scw.cloud")).toBe("other");
  });

  it("derives the R2 endpoint from the account ID, or from the full pasted address", () => {
    expect(r2Endpoint(ACCOUNT)).toBe(R2);
    expect(r2Endpoint(`${R2}/`)).toBe(R2);
    expect(r2Endpoint(" ")).toBe("");
    expect(r2AccountOf(R2)).toBe(ACCOUNT);
  });

  it("derives the AWS one from the region", () => {
    expect(awsEndpoint("eu-west-3")).toBe("https://s3.eu-west-3.amazonaws.com");
    expect(awsEndpoint("")).toBe("");
  });

  it("changes the address and addressing style on a provider switch, never the bucket or the key", () => {
    const aws = switchedTo("aws", VIEW);

    expect(aws).toMatchObject({
      access_key_id: "AKIA-TEST",
      bucket: "backups",
      endpoint: "",
      path_style: false,
      region: "",
    });
    expect(switchedTo("r2", aws)).toMatchObject({
      path_style: true,
      region: "auto",
    });
  });

  it("refuses an R2 account ID that cannot be one", () => {
    const typed = { ...VIEW, endpoint: r2Endpoint("mon-compte") };

    expect(storageProblems("r2", typed).endpoint).toBe("r2Account");
    expect(storageProblems("r2", VIEW)).toEqual({});
    expect(storageProblems("other", typed).endpoint).toBeUndefined();
  });
});

describe("the bucket the server holds", () => {
  it("drifts from this computer's connection as soon as a value differs", () => {
    expect(driftsFrom(VIEW, { ...VIEW, interval_hours: 24 })).toBe(false);
    expect(driftsFrom(VIEW, { ...VIEW, bucket: "ancien" })).toBe(true);
    expect(driftsFrom(VIEW, { interval_hours: 24 })).toBe(false);
  });
});
