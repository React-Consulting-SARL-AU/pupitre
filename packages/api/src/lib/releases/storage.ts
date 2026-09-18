import {
  encodeR2Path,
  presignR2,
  type R2StorageConfig,
  r2ConfigFromEnv,
} from "../storage/r2-presign"

export type ReleaseStorageKind = "r2" | "local"

export interface ReleaseStorage {
  readonly kind: ReleaseStorageKind
  signedUrl(key: string, ttlSeconds: number): Promise<string>
}

const BUCKET_VARIABLE = "R2_BUCKET_NAME"

export function createR2ReleaseStorage(
  config: R2StorageConfig
): ReleaseStorage {
  return {
    kind: "r2",
    signedUrl: (key, ttlSeconds) =>
      presignR2({ config, method: "GET", key, ttlSeconds, now: new Date() }),
  }
}

export function createLocalReleaseStorage(): ReleaseStorage {
  return {
    kind: "local",
    signedUrl: (key, ttlSeconds) => {
      const expires = Math.floor(Date.now() / 1000) + ttlSeconds

      return Promise.resolve(
        `http://localhost/__release-storage/${encodeR2Path(key)}?expires=${expires}&signature=local`
      )
    },
  }
}

export function createReleaseStorage(): ReleaseStorage {
  const config = r2ConfigFromEnv(BUCKET_VARIABLE)

  return config ? createR2ReleaseStorage(config) : createLocalReleaseStorage()
}

let configured: ReleaseStorage | null = null

export function configureReleaseStorage(storage: ReleaseStorage): void {
  configured = storage
}

export function getReleaseStorage(): ReleaseStorage {
  configured ??= createReleaseStorage()

  return configured
}
