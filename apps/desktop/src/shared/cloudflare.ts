/** The account only: zone and domain are chosen per server, and the tunnel id lives on the server alone. */
export interface CloudflareConnection {
  accountId: string;
  accountName: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
}
