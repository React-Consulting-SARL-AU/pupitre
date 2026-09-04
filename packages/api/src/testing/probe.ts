export const PROBE_REPORT = {
  os: "debian",
  version: "13",
  arch: "amd64",
  ram_mb: 8192,
  disk_free_gb: 120.5,
  sudo: true,
  ports: [{ port: 22, process: "sshd" }],
  docker: false,
  panel: null,
  agent_version: null,
  installed_modules: [],
  verdict: { level: "ready", reasons: [] },
} as const

export const HOST_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJVYtLyOPEHD0MehUA5aoQcpXGFTdf2G883VYZ2psxy1 root@vps"

export const HOST_FINGERPRINT =
  "SHA256:UxcMt/JJIyGB3YiHDNm8b432seEkfgF+12/Mux642aM"
