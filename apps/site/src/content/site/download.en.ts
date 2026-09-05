import type { DownloadContent } from "./download"

export const downloadEn: DownloadContent = {
  meta: {
    title: "Download Pupitre",
    description:
      "The Pupitre desktop app for macOS, Windows and Linux, with the checksums, the requirements and what the server needs.",
  },
  hero: {
    label: "Download",
    headline: "The app for your machine.",
    lead: "One desktop app, three systems. It talks to your server over SSH with a key it generates on this device; nothing else is installed on your laptop.",
    detecting: "Your system",
    unknown: "Pick your system",
  },
  os: {
    macos: {
      name: "macOS",
      note: "macOS 13 Ventura or later, Apple silicon and Intel. Signed and notarised.",
    },
    windows: {
      name: "Windows",
      note: "Windows 11, x64. Signed with Azure Trusted Signing.",
    },
    linux: {
      name: "Linux",
      note: "Ubuntu 22.04 or later on the desktop, x64 and arm64. AppImage, no installer.",
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
    lead: "Every file below is the same release. Check the digest if you care to; the app checks its own updates against the signature.",
    download: "Download",
    size: "Size",
    digest: "SHA-256",
    format: "Format",
    empty: "No build published for this system yet.",
  },
  stale: {
    title: "This list may be behind",
    body: "The build could not read the release list from the platform, so this page shows the last list the repository knows. The links stay valid; the version may not be the newest.",
  },
  release: {
    label: "Release",
    title: "What is published",
    version: "Version",
    published: "Published",
    channel: "Channel",
    changelog: "Read the changelog",
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
        "Ubuntu 22.04 or later on the desktop, x64 or arm64.",
        "An SSH client is not required: the app carries its own configuration and its own key.",
      ],
    },
    server: {
      title: "Your server",
      lines: [
        "Ubuntu 22.04 or 24.04, amd64 or arm64.",
        "4 GB of RAM at least; more for a remote JetBrains IDE or several databases.",
        "20 GB of free disk, and a root or sudo account for the first connection.",
        "Port 22 reachable. Pupitre opens nothing else, and nothing connects inward afterwards.",
      ],
    },
  },
  install: {
    label: "After the download",
    title: "Four minutes to the first connection",
    lead: "Nothing to configure before you start. The app asks for the server, then explains every step it takes.",
    steps: [
      "Open the app. It generates an ed25519 key for this device and keeps the private half on your disk.",
      "Add your server: its address, and a root or sudo account for the first connection only.",
      "Let it inspect. It reads the distribution, the RAM, the disk and what is already installed, and says what it will not manage.",
      "Choose your services and let it install. From there the app is the window onto that machine.",
    ],
  },
}
