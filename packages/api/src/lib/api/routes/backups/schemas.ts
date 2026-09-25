import {
  BackupBeatSchema,
  BackupDeclarationSchema,
  PlatformBackupSchema,
} from "@pupitre/shared/backup"
import { t } from "elysia"
import { fromContract } from "../../contract-schema"

export const backupDeclarationBody = fromContract(BackupDeclarationSchema)

export const backupSchema = fromContract(PlatformBackupSchema, {
  $id: "Backup",
})

export const backupBeatSchema = fromContract(BackupBeatSchema, {
  $id: "BackupBeat",
})

export const restoredBody = t.Object({
  server_id: t.String({ minLength: 1 }),
})
