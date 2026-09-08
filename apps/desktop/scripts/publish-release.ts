import { spawnSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  absoluteFeed,
  artefactOf,
  feedKey,
  isBlockmap,
  isFeed,
  objectKey,
  signedAppMessage,
} from "./release-artefacts";

/**
 * Publish a version of the app: the bucket, then the platform.
 *
 * Artefacts go up first into the public bucket, into their version's folder,
 * with their signature alongside; electron-updater's feeds go up next, into
 * the channel's folder, rewritten to point at this version. The version
 * table is filled in only afterward: a row that exists is a row whose file
 * is already there.
 *
 * Nothing in this script runs from a workstation: the release key and the
 * admin token live in CI's secrets.
 */

const PRIVATE_KEY_VARIABLE = "PUPITRE_RELEASE_PRIVATE_KEY";

const PUBLISH_TOKEN_VARIABLE = "PUPITRE_PUBLISH_TOKEN";

const ED25519_PKCS8_PREFIX = "302e020100300506032b657004220420";

const SEED_BYTES = 32;

interface Options {
  dir: string;
  version: string;
  channel: string;
  notes: string;
  base: string;
  bucket: string;
  platform: string;
  dryRun: boolean;
}

function argumentOf(name: string, fallback = ""): string {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));

  return found ? found.slice(name.length + 3) : fallback;
}

function required(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} est vide : la publication ne peut pas continuer.`);
  }

  return value;
}

function options(): Options {
  const version = required("--version", argumentOf("version"));
  const notesFile = argumentOf("notes-file");

  return {
    base: required(
      "--base",
      argumentOf("base", process.env.PUPITRE_DOWNLOADS_URL ?? "")
    ),
    bucket: argumentOf("bucket", process.env.R2_BUCKET ?? ""),
    channel: argumentOf(
      "channel",
      process.env.PUPITRE_RELEASE_CHANNEL || "beta"
    ),
    dir: argumentOf("dir", "dist"),
    dryRun: process.argv.includes("--dry-run"),
    notes: notesFile
      ? readFileSync(notesFile, "utf8").trim()
      : required("--notes", argumentOf("notes")),
    platform: required(
      "--api",
      argumentOf("api", process.env.PUPITRE_PLATFORM_URL ?? "")
    ),
    version,
  };
}

/**
 * The private key arrives as raw base64, the 64 bytes Ed25519 calls a
 * private key; Node wants a PKCS#8 envelope around the seed, which is the
 * first half of it.
 */
function privateKey() {
  const raw = Buffer.from(
    required(PRIVATE_KEY_VARIABLE, process.env[PRIVATE_KEY_VARIABLE] ?? ""),
    "base64"
  );

  return createPrivateKey({
    format: "der",
    key: Buffer.concat([
      Buffer.from(ED25519_PKCS8_PREFIX, "hex"),
      raw.subarray(0, SEED_BYTES),
    ]),
    type: "pkcs8",
  });
}

function run(command: string[], dryRun: boolean): void {
  process.stdout.write(`${command.join(" ")}\n`);

  if (dryRun) {
    return;
  }

  const [program, ...args] = command;
  const spawned = spawnSync(program as string, args, { stdio: "inherit" });

  if (spawned.status !== 0) {
    throw new Error(`${command[0]} a échoué : ${command.join(" ")}`);
  }
}

function upload(path: string, key: string, options: Options): void {
  run(
    [
      "bun",
      "x",
      "wrangler",
      "r2",
      "object",
      "put",
      `${required("--bucket", options.bucket)}/${key}`,
      `--file=${path}`,
      "--remote",
    ],
    options.dryRun
  );
}

async function declare(body: unknown, options: Options): Promise<void> {
  const token = required(
    PUBLISH_TOKEN_VARIABLE,
    process.env[PUBLISH_TOKEN_VARIABLE] ?? ""
  );

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(body)}\n`);

    return;
  }

  const response = await fetch(
    new URL("/api/v1/admin/app-releases", options.platform),
    {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error(
      `la plateforme a refusé la publication (${response.status}) : ${await response.text()}`
    );
  }
}

async function publishArtefact(
  file: string,
  settings: Options,
  key: ReturnType<typeof privateKey>
): Promise<void> {
  const artefact = artefactOf(file);

  if (!artefact) {
    return;
  }

  const path = join(settings.dir, file);
  const content = readFileSync(path);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const signature = sign(
    null,
    signedAppMessage(settings.version, artefact.os, artefact.arch, sha256),
    key
  ).toString("base64");

  writeFileSync(`${path}.sig`, `${signature}\n`);

  upload(path, objectKey(settings.version, file), settings);
  upload(`${path}.sig`, objectKey(settings.version, `${file}.sig`), settings);

  await declare(
    {
      arch: artefact.arch,
      bytes: content.byteLength,
      channel: settings.channel,
      format: artefact.format,
      notes: settings.notes,
      os: artefact.os,
      sha256,
      signature,
      r2_key: objectKey(settings.version, file),
      version: settings.version,
    },
    settings
  );
}

function publishFeed(file: string, settings: Options): void {
  const path = join(settings.dir, file);
  const rewritten = absoluteFeed(
    readFileSync(path, "utf8"),
    settings.base,
    settings.version
  );

  writeFileSync(path, rewritten);

  upload(path, objectKey(settings.version, file), settings);
  upload(path, feedKey(settings.channel, file), settings);
}

async function main(): Promise<void> {
  const settings = options();
  const key = privateKey();
  const files = readdirSync(settings.dir).sort();
  const artefacts = files.filter((file) => artefactOf(file) !== null);

  if (artefacts.length === 0) {
    throw new Error(
      `${settings.dir} ne contient aucun artefact publiable : le build n'a rien produit.`
    );
  }

  for (const file of artefacts) {
    await publishArtefact(file, settings, key);
  }

  for (const file of files.filter(isBlockmap)) {
    upload(
      join(settings.dir, file),
      objectKey(settings.version, file),
      settings
    );
  }

  for (const file of files.filter(isFeed)) {
    publishFeed(file, settings);
  }

  process.stdout.write(
    `${artefacts.length} artefacts publiés en ${settings.channel} pour ${settings.version}\n`
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
