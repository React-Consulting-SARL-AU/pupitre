import {
  BACKUP_HOUR_DEFAULT,
  BACKUP_INTERVAL_DEFAULT_HOURS,
  BACKUP_INTERVAL_MAX_HOURS,
  BACKUP_KEEP_DEFAULT,
  BACKUP_KEEP_MAX,
} from "@pupitre/shared/backup";
import { Field, fieldAria } from "@renderer/components/ui/field";
import { NumberField } from "@renderer/components/ui/number-field";
import { Select } from "@renderer/components/ui/select";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  BACKUP_INTERVAL_CHOICES,
  choiceOf,
  historyOf,
  type IntervalChoice,
  numberOf,
  startsAtHour,
} from "@renderer/lib/backup-schedule";
import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const DEFAULT_CUSTOM_INTERVAL = 48;

/**
 * When backups run and how many stay: an interval among the usual ones or
 * any other, the hour a daily one starts at, and the retention said in time.
 */
export function BackupsFrequencyFields({
  values,
  problemOf,
  onValue,
}: {
  values: Record<string, unknown>;
  problemOf: (key: string) => string | undefined;
  onValue: (key: string, next: number) => void;
}) {
  const t = useTranslations();

  const interval = numberOf(
    values.interval_hours,
    BACKUP_INTERVAL_DEFAULT_HOURS
  );
  const hour = numberOf(values.hour, BACKUP_HOUR_DEFAULT);
  const keep = numberOf(values.keep, BACKUP_KEEP_DEFAULT);
  const problems = {
    hour: problemOf("hour"),
    interval_hours: problemOf("interval_hours"),
    keep: problemOf("keep"),
  };

  const [custom, setCustom] = useState(() => choiceOf(interval) === "custom");
  const choice: IntervalChoice = custom ? "custom" : choiceOf(interval);
  const scheduled = interval > 0;
  const history = historyOf(interval, keep);

  function choose(next: IntervalChoice): void {
    setCustom(next === "custom");

    if (next === "custom") {
      onValue("interval_hours", DEFAULT_CUSTOM_INTERVAL);

      return;
    }

    onValue("interval_hours", Number(next));
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2" data-backup-frequency="">
      <Field
        label={t("backups.frequency.every")}
        name="backup-interval"
        problem={custom ? undefined : problems.interval_hours}
      >
        <Select
          {...fieldAria({
            name: "backup-interval",
            problem: Boolean(problems.interval_hours),
          })}
          onChange={choose}
          options={BACKUP_INTERVAL_CHOICES.map((value) => ({
            label: t(`backups.frequency.choice.${value}`),
            value,
          }))}
          value={choice}
          wrong={!custom && Boolean(problems.interval_hours)}
        />
      </Field>

      {custom ? (
        <Field
          label={t("backups.frequency.hours")}
          name="backup-interval-hours"
          problem={problems.interval_hours}
        >
          <NumberField
            {...fieldAria({
              name: "backup-interval-hours",
              problem: Boolean(problems.interval_hours),
            })}
            decrementLabel={t("common.decrease", {
              label: t("backups.frequency.hours"),
            })}
            incrementLabel={t("common.increase", {
              label: t("backups.frequency.hours"),
            })}
            max={BACKUP_INTERVAL_MAX_HOURS}
            min={1}
            onChange={(next) => onValue("interval_hours", next)}
            value={interval}
            wrong={Boolean(problems.interval_hours)}
          />
        </Field>
      ) : null}

      {startsAtHour(interval) ? (
        <Field
          help={t("backups.frequency.hourHelp")}
          label={t("backups.frequency.hour")}
          name="backup-hour"
          problem={problems.hour}
        >
          <Select
            {...fieldAria({
              help: true,
              name: "backup-hour",
              problem: Boolean(problems.hour),
            })}
            kind="data"
            onChange={(next) => onValue("hour", Number(next))}
            options={HOURS.map((one) => ({
              label: `${String(one).padStart(2, "0")}:00`,
              value: String(one),
            }))}
            value={String(hour)}
            wrong={Boolean(problems.hour)}
          />
        </Field>
      ) : null}

      {scheduled ? (
        <Field
          help={t("backups.frequency.keepHelp", {
            history: t.plural(
              `backups.frequency.span.${history.unit}`,
              history.count
            ),
          })}
          label={t("backups.frequency.keep")}
          name="backup-keep"
          problem={problems.keep}
        >
          <NumberField
            {...fieldAria({
              help: true,
              name: "backup-keep",
              problem: Boolean(problems.keep),
            })}
            decrementLabel={t("common.decrease", {
              label: t("backups.frequency.keep"),
            })}
            incrementLabel={t("common.increase", {
              label: t("backups.frequency.keep"),
            })}
            max={BACKUP_KEEP_MAX}
            min={1}
            onChange={(next) => onValue("keep", next)}
            value={keep}
            wrong={Boolean(problems.keep)}
          />
        </Field>
      ) : (
        <p className="text-[12px] text-ink-3 leading-relaxed sm:col-span-2">
          {t("backups.frequency.manual")}
        </p>
      )}
    </div>
  );
}
