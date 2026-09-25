import { isSshFingerprint, isSshHost, isSshUser } from "@pupitre/shared/ssh"

export type SshAddressField = "host" | "ssh_user" | "fingerprint"

export type SshAddress = Partial<Record<SshAddressField, string>>

const CHECKS: Record<SshAddressField, (value: string) => boolean> = {
  host: isSshHost,
  ssh_user: isSshUser,
  fingerprint: isSshFingerprint,
}

export class SshAddressInvalidError extends Error {
  readonly field: SshAddressField

  constructor(field: SshAddressField) {
    super(`${field} is not fit for an SSH configuration`)
    this.name = "SshAddressInvalidError"
    this.field = field
  }
}

/** Every device writes these values into its SSH configuration: nothing malformed is ever stored. */
export function assertSshAddress(address: SshAddress): void {
  for (const field of Object.keys(CHECKS) as SshAddressField[]) {
    const value = address[field]

    if (value !== undefined && !CHECKS[field](value)) {
      throw new SshAddressInvalidError(field)
    }
  }
}
