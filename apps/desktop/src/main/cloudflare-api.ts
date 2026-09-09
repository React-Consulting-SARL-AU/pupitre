import type { CloudflareConnection, CloudflareZone } from "@shared/cloudflare";

/**
 * The client's Cloudflare account, seen from the laptop.
 *
 * These calls used to live on the VPS, where the token therefore had to sleep.
 * They are here because the server only needs a tunnel's credentials: it runs
 * the tunnel, it does not own it, and nothing of the zone reaches down to it.
 * The zone is not held either — it is derived from the domain each server
 * publishes under, so one account can carry several servers under several
 * zones without the client copying an identifier anywhere.
 */

const ENDPOINT = "https://api.cloudflare.com/client/v4";

export interface DnsRecord {
  id: string;
  content: string;
}

export interface CloudflareApi {
  createTunnel: (name: string, secret: string) => Promise<string>;
  findTunnel: (name: string) => Promise<string | null>;
  /** Whether the account still holds this tunnel: a server can name one it lost. */
  hasTunnel: (id: string) => Promise<boolean>;
  deleteTunnel: (id: string) => Promise<void>;
  zones: () => Promise<CloudflareZone[]>;
  /** The zone a domain belongs to: the app never asks the client for an identifier. */
  zoneOf: (domain: string) => Promise<CloudflareZone | null>;
  findRecord: (zoneId: string, fqdn: string) => Promise<DnsRecord | null>;
  createRecord: (
    zoneId: string,
    fqdn: string,
    content: string
  ) => Promise<void>;
  updateRecord: (zoneId: string, id: string, content: string) => Promise<void>;
  deleteRecord: (zoneId: string, id: string) => Promise<void>;
}

/** What a token opens, read from Cloudflare rather than typed by the client. */
export interface TokenAccount {
  id: string;
  name: string;
}

export class CloudflareError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareError";
    this.status = status;
  }
}

interface Answer<T> {
  success: boolean;
  result?: T;
  errors?: { code?: number; message?: string }[];
}

const COMMENT = "pupitre";

/** The token never appears in an error: only Cloudflare's own message surfaces. */
/**
 * What the token opens, asked of Cloudflare directly.
 *
 * The bash stack checked the token at the fifth second rather than at the
 * eighth step, and this is that check: an account list that comes back is a
 * token that works, and the account it names is the one the client would
 * otherwise have had to copy out of a dashboard.
 */
export async function verifyToken(
  token: string,
  fetcher: typeof fetch = fetch
): Promise<TokenAccount[]> {
  const response = await fetcher(`${ENDPOINT}/accounts`, {
    headers: { authorization: `Bearer ${token}` },
  });

  const answer = (await response.json().catch(() => null)) as Answer<
    TokenAccount[]
  > | null;

  if (!(response.ok && answer?.success)) {
    throw new CloudflareError(
      answer?.errors?.[0]?.message ?? `HTTP ${String(response.status)}`,
      response.status
    );
  }

  return answer.result ?? [];
}

export function cloudflareApi(
  token: string,
  connection: CloudflareConnection,
  fetcher: typeof fetch = fetch
): CloudflareApi {
  const call = async <T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> => {
    const response = await fetcher(`${ENDPOINT}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const answer = (await response
      .json()
      .catch(() => null)) as Answer<T> | null;

    if (!(response.ok && answer?.success)) {
      const reason =
        answer?.errors?.[0]?.message ?? `HTTP ${String(response.status)}`;

      throw new CloudflareError(reason, response.status);
    }

    return answer.result as T;
  };

  const account = encodeURIComponent(connection.accountId);

  const listZones = async (query = ""): Promise<CloudflareZone[]> => {
    const found = await call<CloudflareZone[]>(
      "GET",
      `/zones?account.id=${account}&per_page=50${query}`
    );

    return found.map(({ id, name }) => ({ id, name }));
  };

  return {
    zones: () => listZones(),

    /**
     * A domain belongs to the zone whose name it ends on: `dev.flymate.dev`
     * publishes under the `flymate.dev` zone, and the longest match wins so a
     * client who owns both a zone and one of its subdomains gets the right one.
     */
    async zoneOf(domain) {
      const wanted = domain.trim().toLowerCase();
      const held = await listZones();

      return (
        held
          .filter(
            (zone) => wanted === zone.name || wanted.endsWith(`.${zone.name}`)
          )
          .sort((left, right) => right.name.length - left.name.length)[0] ??
        null
      );
    },

    async createTunnel(name, secret) {
      const created = await call<{ id: string }>(
        "POST",
        `/accounts/${account}/cfd_tunnel`,
        { name, tunnel_secret: secret, config_src: "local" }
      );

      return created.id;
    },

    /**
     * A tunnel the account deleted still answers, with the day it went: what
     * the server names has to be one that can still carry something.
     */
    async hasTunnel(id) {
      try {
        const found = await call<{ deleted_at?: string | null }>(
          "GET",
          `/accounts/${account}/cfd_tunnel/${encodeURIComponent(id)}`
        );

        return !found.deleted_at;
      } catch (failure) {
        if (failure instanceof CloudflareError && failure.status === 404) {
          return false;
        }

        throw failure;
      }
    },

    /**
     * The name filter of the API is not trusted alone: a tunnel it did not
     * return still refuses its name to a new one. What the account holds is
     * read whole and matched here.
     */
    async findTunnel(name) {
      const found = await call<{ id: string; name: string }[]>(
        "GET",
        `/accounts/${account}/cfd_tunnel?is_deleted=false&per_page=1000`
      );

      return found.find((tunnel) => tunnel.name === name)?.id ?? null;
    },

    /** `cascade` takes the connections down with it: a tunnel still spoken to by a vanished machine refuses to go otherwise. */
    async deleteTunnel(id) {
      await call(
        "DELETE",
        `/accounts/${account}/cfd_tunnel/${encodeURIComponent(id)}?cascade=true`
      );
    },

    async findRecord(zoneId, fqdn) {
      const found = await call<DnsRecord[]>(
        "GET",
        `/zones/${encodeURIComponent(zoneId)}/dns_records?name=${encodeURIComponent(fqdn)}`
      );

      return found[0] ?? null;
    },

    async createRecord(zoneId, fqdn, content) {
      await call("POST", `/zones/${encodeURIComponent(zoneId)}/dns_records`, {
        type: "CNAME",
        name: fqdn,
        content,
        proxied: true,
        comment: COMMENT,
      });
    },

    async updateRecord(zoneId, id, content) {
      await call(
        "PATCH",
        `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(id)}`,
        {
          content,
          proxied: true,
          comment: COMMENT,
        }
      );
    },

    async deleteRecord(zoneId, id) {
      await call(
        "DELETE",
        `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(id)}`
      );
    },
  };
}
