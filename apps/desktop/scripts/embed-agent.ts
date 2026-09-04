import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ARCHITECTURES } from "@pupitre/shared/catalog";

/**
 * The agent the app carries, copied from the agent's own build.
 *
 * A server that has never seen Pupitre has no way to fetch `pupitred`: the app
 * is what brings it, over the channel it already has. The binary is copied here
 * at build time exactly as `probe.sh` is, with the checksum of what was copied,
 * so what leaves the app is provably what the agent's build produced.
 */

export const AGENT_MANIFEST = "manifest.json";

export const AGENT_RELEASE = "release.json";

export interface AgentBinaryEntry {
  file: string;
  sha256: string;
  bytes: number;
  /** Ed25519, base64, over `pupitred\n<version>\n<arch>\n<sha256>\n`. */
  signature?: string;
}

export interface AgentManifest {
  built_at: string;
  version?: string;
  notes?: string[];
  binaries: Record<string, AgentBinaryEntry>;
}

/**
 * What the publication chain leaves next to the binaries.
 *
 * A plain `go build` writes none of it, and the app then carries an agent it
 * can push onto a bare machine but cannot offer as an update: replacing a
 * running agent is the one gesture that needs a signature, and inventing one
 * here would only get it refused on the server.
 */
export interface AgentRelease {
  version: string;
  notes?: string[];
  signatures?: Record<string, string>;
}

export function readAgentRelease(dir: string): AgentRelease | null {
  const path = join(dir, AGENT_RELEASE);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as AgentRelease;

    return parsed.version ? parsed : null;
  } catch {
    return null;
  }
}

export interface EmbedOptions {
  from: string;
  to: string;
  now?: () => Date;
}

export interface EmbedResult {
  manifest: AgentManifest | null;
  missing: string[];
}

export function agentFileName(arch: string): string {
  return `pupitred-linux-${arch}`;
}

export function embedAgent({
  from,
  to,
  now = () => new Date(),
}: EmbedOptions): EmbedResult {
  mkdirSync(to, { recursive: true });

  const release = readAgentRelease(from);
  const binaries: Record<string, AgentBinaryEntry> = {};
  const missing: string[] = [];

  for (const arch of ARCHITECTURES) {
    const file = agentFileName(arch);
    const source = join(from, file);

    if (!existsSync(source)) {
      missing.push(arch);
      rmSync(join(to, file), { force: true });
      continue;
    }

    const content = readFileSync(source);
    copyFileSync(source, join(to, file));
    chmodSync(join(to, file), 0o755);

    const signature = release?.signatures?.[arch];

    binaries[arch] = {
      bytes: content.byteLength,
      file,
      sha256: createHash("sha256").update(content).digest("hex"),
      ...(signature ? { signature } : {}),
    };
  }

  const path = join(to, AGENT_MANIFEST);

  // No manifest rather than a stale one: the screen has to be able to say the
  // app carries no agent, and an old manifest would make it promise a binary
  // that is no longer there.
  if (Object.keys(binaries).length === 0) {
    rmSync(path, { force: true });

    return { manifest: null, missing };
  }

  const manifest: AgentManifest = {
    binaries,
    built_at: now().toISOString(),
    ...(release ? { notes: release.notes ?? [], version: release.version } : {}),
  };

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

  return { manifest, missing };
}

if (import.meta.main) {
  const here = dirname(new URL(import.meta.url).pathname);
  const result = embedAgent({
    from: resolve(here, "..", "..", "agent", "dist"),
    to: resolve(here, "..", "resources", "agent"),
  });

  if (result.missing.length > 0) {
    process.stderr.write(
      `agent absent pour ${result.missing.join(", ")} : construis-le avec bun --cwd=apps/agent run build\n`
    );
  }
}
