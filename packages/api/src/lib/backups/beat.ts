import { type BackupBeat, BackupBeatSchema } from "@pupitre/shared/backup"

export function readBackupBeat(value: unknown): BackupBeat | null {
  const parsed = BackupBeatSchema.safeParse(value)

  return parsed.success ? parsed.data : null
}
