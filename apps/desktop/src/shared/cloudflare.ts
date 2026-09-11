/**
 * The client's Cloudflare account, as the app holds it for all their servers.
 *
 * Only the account. The zone and the domain are a per-server decision, asked in
 * the module's own form; the tunnel belongs to the server, which is the only
 * place its identifier is kept.
 */
export interface CloudflareConnection {
  accountId: string;
  accountName: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
}
