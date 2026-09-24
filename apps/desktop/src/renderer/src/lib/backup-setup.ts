/**
 * The steps a first setup of backups walks, and the fields of `core.backup`
 * each one answers: a refusal of the agent sends the reader back to the step
 * that holds its field.
 */

export const BACKUP_SETUP_STEPS = [
  "bucket",
  "passphrase",
  "frequency",
  "content",
] as const;

export type BackupSetupStep = (typeof BACKUP_SETUP_STEPS)[number];

export const FREQUENCY_FIELDS = ["interval_hours", "hour", "keep"] as const;

export const CONTENT_FIELDS = [
  "databases",
  "projects",
  "projects_env_only",
  "home",
  "extra_paths",
  "exclude_projects",
  "exclude_databases",
] as const;

const FIELDS_OF: Record<BackupSetupStep, readonly string[]> = {
  bucket: [],
  content: CONTENT_FIELDS,
  frequency: FREQUENCY_FIELDS,
  passphrase: [],
};

export function fieldsOf(step: BackupSetupStep): readonly string[] {
  return FIELDS_OF[step];
}

/** Every other field is the bucket's, filled from the connection. */
export function stepOfField(field: string): BackupSetupStep {
  return (
    BACKUP_SETUP_STEPS.find((step) => FIELDS_OF[step].includes(field)) ??
    "bucket"
  );
}
