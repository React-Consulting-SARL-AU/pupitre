import type { DownloadContent } from "./download"

export const downloadEn: DownloadContent = {
  meta: {
    title: "Download Pupitre",
    description:
      "The Pupitre desktop app for macOS, Windows and Linux, with the requirements and what the server needs.",
  },
  hero: {
    label: "Download",
    headline: "The app for your machine.",
    lead: "One desktop app, three systems. It talks to your server over SSH with a key it generates on this device; nothing else is installed on your laptop.",
    detecting: "Your system",
    unknown: "Pick your system",
  },
  account: {
    title: "The app needs a Pupitre account",
    body: "Pupitre signs in to a Pupitre account. Create it first: an email address is enough, and no card is asked for.",
    cta: "Create an account",
  },
  os: {
    macos: {
      name: "macOS",
      note: "macOS 13 Ventura or later, Apple silicon and Intel. Signed and notarised.",
    },
    windows: {
      name: "Windows",
      note: "Windows 11, x64. The installer is not code-signed yet: SmartScreen may ask you to confirm on first launch.",
    },
    linux: {
      name: "Linux",
      note: "Ubuntu 22.04 or later on the desktop, x64. AppImage or .deb.",
    },
  },
  arch: {
    arm64: "Apple silicon / arm64",
    x64: "Intel / x64",
    universal: "Universal",
  },
  assets: {
    label: "Every build",
    title: "All three systems",
    lead: "Every file below is the same release. The app checks its own updates against the signature.",
    verify: "Every build is published with its size and its SHA-256.",
    download: "Download",
    size: "Size",
    digest: "SHA-256",
    format: "Format",
    empty: "No build published for this system yet.",
  },
  release: {
    label: "Release",
    title: "What is published",
    version: "Version",
    published: "Published",
    channel: "Channel",
    channels: { stable: "Stable", beta: "Beta" },
  },
  requirements: {
    label: "Requirements",
    title: "What you need on each side",
    lead: "The app runs on your laptop. The work happens on a server you rent, which Pupitre never installs itself.",
    app: {
      title: "Your laptop",
      lines: [
        "macOS 13 Ventura or later, Apple silicon or Intel.",
        "Windows 11 on x64.",
        "Ubuntu 22.04 or later on the desktop, x64.",
        "The system’s OpenSSH client, which the app drives with its own configuration and its own key: built into macOS and Windows 11, the openssh-client package on Ubuntu.",
      ],
    },
    server: {
      title: "Your server",
      lines: [
        "Ubuntu 22.04 or 24.04, amd64 or arm64.",
        "4 GB of RAM at least; more for a remote JetBrains IDE or several databases.",
        "20 GB of free disk, and a root or sudo account for the first connection.",
        "Port 22 reachable. Neither the platform nor support ever connects to it; the firewall then lets in SSH, and 80 and 443 only once you install Caddy.",
      ],
    },
  },
  install: {
    label: "After the download",
    title: "From the download to the first connection",
    lead: "Nothing to configure before you start. The app asks for the server, then explains every step it takes.",
    steps: [
      "Open the app and sign in with your Pupitre account. It shows a code, you confirm it in the console, and the two are linked.",
      "It generates an ed25519 key for this device and keeps the private half on your disk.",
      "Add your server: its address, and a root or sudo account for the first connection only.",
      "Let it inspect. It reads the distribution, the RAM, the disk and what is already installed, and says what it will not manage.",
      "Choose your services and let it install. From there the app is the window onto that machine.",
    ],
  },
}
