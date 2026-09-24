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

describe("le fournisseur d'un seau", () => {
  it("se lit sur le point d'accès, R2 pour un seau encore vide", () => {
    expect(providerOf("")).toBe("r2");
    expect(providerOf(R2)).toBe("r2");
    expect(providerOf("https://s3.eu-west-3.amazonaws.com")).toBe("aws");
    expect(providerOf("https://s3.fr-par.scw.cloud")).toBe("other");
  });

  it("déduit le point d'accès de R2 de l'identifiant, ou de l'adresse collée entière", () => {
    expect(r2Endpoint(ACCOUNT)).toBe(R2);
    expect(r2Endpoint(`${R2}/`)).toBe(R2);
    expect(r2Endpoint(" ")).toBe("");
    expect(r2AccountOf(R2)).toBe(ACCOUNT);
  });

  it("déduit celui d'AWS de la région", () => {
    expect(awsEndpoint("eu-west-3")).toBe("https://s3.eu-west-3.amazonaws.com");
    expect(awsEndpoint("")).toBe("");
  });

  it("change l'adresse et l'adressage en changeant de fournisseur, jamais le seau ni la clé", () => {
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

  it("refuse un identifiant de compte R2 qui ne peut pas en être un", () => {
    const typed = { ...VIEW, endpoint: r2Endpoint("mon-compte") };

    expect(storageProblems("r2", typed).endpoint).toBe("r2Account");
    expect(storageProblems("r2", VIEW)).toEqual({});
    expect(storageProblems("other", typed).endpoint).toBeUndefined();
  });
});

describe("le seau que tient le serveur", () => {
  it("dérive de la connexion de cet ordinateur dès qu'une valeur diffère", () => {
    expect(driftsFrom(VIEW, { ...VIEW, interval_hours: 24 })).toBe(false);
    expect(driftsFrom(VIEW, { ...VIEW, bucket: "ancien" })).toBe(true);
    expect(driftsFrom(VIEW, { interval_hours: 24 })).toBe(false);
  });
});
