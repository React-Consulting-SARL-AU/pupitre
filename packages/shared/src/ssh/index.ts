const HEX_GROUP = "[0-9A-Fa-f]{1,4}"

const IPV4 = "(?:\\d{1,3}\\.){3}\\d{1,3}"

const DNS_LABEL = "[A-Za-z0-9](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9])?"

const DNS_NAME = `${DNS_LABEL}(?:\\.${DNS_LABEL})*`

const IPV6 = [
  `(?:${HEX_GROUP}:){7}${HEX_GROUP}`,
  `(?:${HEX_GROUP}:){6}${IPV4}`,
  `(?:${HEX_GROUP}:){1,7}:`,
  `(?:${HEX_GROUP}:){1,6}:${HEX_GROUP}`,
  `(?:${HEX_GROUP}:){1,5}(?::${HEX_GROUP}){1,2}`,
  `(?:${HEX_GROUP}:){1,4}(?::${HEX_GROUP}){1,3}`,
  `(?:${HEX_GROUP}:){1,3}(?::${HEX_GROUP}){1,4}`,
  `(?:${HEX_GROUP}:){1,2}(?::${HEX_GROUP}){1,5}`,
  `${HEX_GROUP}:(?::${HEX_GROUP}){1,6}`,
  `:(?:(?::${HEX_GROUP}){1,7}|:)`,
  `::(?:ffff(?::0{1,4})?:)?${IPV4}`,
  `(?:${HEX_GROUP}:){1,4}:${IPV4}`,
].join("|")

/** Anything else would reach ssh_config or argv as a new directive, an option or a `%` token. */
export const SSH_HOST_PATTERN = `^(?:${DNS_NAME}|${IPV6})$`

export const SSH_HOST_MAX = 253

export const SSH_USER_PATTERN = "^[A-Za-z_][A-Za-z0-9_-]{0,31}$"

export const SSH_USER_MAX = 32

export const SSH_FINGERPRINT_PATTERN = "^SHA256:[A-Za-z0-9+/]+={0,2}$"

export const SSH_PORT_MIN = 1

export const SSH_PORT_MAX = 65_535

const SSH_HOST_RE = new RegExp(SSH_HOST_PATTERN)

const SSH_USER_RE = new RegExp(SSH_USER_PATTERN)

const SSH_FINGERPRINT_RE = new RegExp(SSH_FINGERPRINT_PATTERN)

export function isSshHost(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= SSH_HOST_MAX &&
    SSH_HOST_RE.test(value)
  )
}

export function isSshUser(value: unknown): value is string {
  return typeof value === "string" && SSH_USER_RE.test(value)
}

export function isSshFingerprint(value: unknown): value is string {
  return typeof value === "string" && SSH_FINGERPRINT_RE.test(value)
}

export function isSshPort(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= SSH_PORT_MIN &&
    (value as number) <= SSH_PORT_MAX
  )
}
