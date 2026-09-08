import { Logo } from "@renderer/components/logo";
import { Label } from "@renderer/components/ui/label";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";

/**
 * The side of the sign-in that says what is being signed in to.
 *
 * It is the one place in the app where the product speaks rather than reports,
 * so it holds three sentences and no control. Below the split it disappears
 * entirely: a narrow window owes the reader the sign-in, not the promise.
 */

const PROMISES = ["machine", "offline", "keys"] as const;

export function AccountGateAside({ platform }: { platform: string }) {
  const t = useTranslations();

  return (
    <aside className="hidden flex-col justify-between border-line border-r bg-surface px-10 pt-2 pb-10 lg:flex">
      <div>
        <WindowBand />

        <div className="rise mt-6 flex items-center gap-3" style={riseAt(0)}>
          <Logo size={30} />
          <span className="font-bold font-display text-ink text-lg tracking-tight">
            Pupitre
          </span>
        </div>
      </div>

      <div>
        <h2
          className="rise max-w-[22ch] text-balance font-bold font-display text-2xl text-ink leading-tight tracking-tight"
          style={riseAt(1)}
        >
          {t("account.gate.lead")}
        </h2>

        <ul className="mt-8 flex flex-col gap-5">
          {PROMISES.map((promise, index) => (
            <li
              className="rise flex gap-3"
              key={promise}
              style={riseAt(2 + index)}
            >
              <span
                aria-hidden="true"
                className="mt-2 h-px w-6 shrink-0 bg-line-strong"
              />
              <p className="text-ink-2 leading-relaxed">
                {t(`account.gate.promise.${promise}`)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rise min-w-0" style={riseAt(5)}>
        <Label>{t("account.gate.platform")}</Label>
        <p className="mt-1 truncate font-data text-[12px] text-ink-4">
          {platform}
        </p>
      </div>
    </aside>
  );
}
