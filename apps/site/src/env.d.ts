/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_RELEASES_URL?: string
  readonly PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
