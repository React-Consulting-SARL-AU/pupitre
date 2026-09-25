import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { Manifest, Preset } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Layers } from "lucide-react";
import { useState } from "react";
import {
  bringsNothing,
  droppedBy,
  type Installed,
  type PresetOffer,
  presetOffers,
  withChoice,
} from "../../lib/catalog-selection";
import { ConfirmDialog } from "../ui/confirm-button";
import { Section } from "../ui/section";
import { CatalogPresetChoice } from "./catalog-preset-choice";

interface Replacing {
  preset: Preset;
  chosen?: string;
  lost: readonly Manifest[];
}

/**
 * The shortcuts, ahead of the twenty-odd modules.
 *
 * A preset says what it brings by name, not by count: the reader picks between
 * « Node.js, MySQL, Claude Code » and « everything », not between 7 and 23.
 * Those names are what it brings *here* — a module the server already runs, or
 * one this architecture has nothing to run, is not promised twice.
 *
 * A preset that carries `choose_one` names modules that contradict each other —
 * the exposures, the agents — and asks which one before it is applied.
 * Applying it silently would either install none of them or install two that
 * refuse to stand together.
 */
export function CatalogPresets({
  presets,
  modules,
  selected,
  installed = [],
  probe = null,
  onPick,
}: {
  presets: readonly Preset[];
  /** The catalogue, so a choice shows the names the agent gave rather than ids. */
  modules: readonly Manifest[];
  /** What is ticked right now, so an applied preset says so. */
  selected: readonly string[];
  installed?: Installed;
  probe?: ProbeResult | null;
  onPick?: (presetId: string, chosen?: string) => void;
}) {
  const t = useTranslations();

  const [asking, setAsking] = useState<PresetOffer | null>(null);
  const [replacing, setReplacing] = useState<Replacing | null>(null);

  const offers = presetOffers(modules, presets, selected, installed, probe);

  if (offers.length === 0) {
    return null;
  }

  function pick(offer: PresetOffer): void {
    if (offer.choices.length > 0) {
      setAsking(offer);

      return;
    }

    apply(offer.preset);
  }

  function apply(preset: Preset, chosen?: string): void {
    const lost = droppedBy(
      modules,
      withChoice(preset, chosen),
      selected,
      installed,
      probe
    );

    if (lost.length > 0) {
      setReplacing({ chosen, lost, preset });

      return;
    }

    onPick?.(preset.id, chosen);
  }

  /** What the preset adds to the core here, in the catalogue's own words. */
  function brings(offer: PresetOffer): string {
    if (bringsNothing(offer)) {
      return t("catalog.presets.nothing");
    }

    if (offer.adds.length > 0) {
      return offer.adds.map((module) => module.name).join(", ");
    }

    return offer.choices.length > 0
      ? t.plural("catalog.presets.chooses", offer.choices.length)
      : t("catalog.presets.coreOnly");
  }

  return (
    <Section name="presets" title={t("catalog.presets.title")}>
      <div className="grid gap-gutter sm:grid-cols-3">
        {offers.map((offer) => {
          const empty = bringsNothing(offer);

          return (
            <button
              aria-pressed={offer.applied}
              className={`clickable elevation-raised flex flex-col items-start gap-1 rounded-md border bg-surface px-4 py-3 text-left transition-soft ${
                offer.applied
                  ? "border-line-strong"
                  : "border-line hover:border-line-strong"
              } ${empty ? "opacity-55" : ""}`}
              data-preset={offer.preset.id}
              data-preset-applied={offer.applied ? "true" : "false"}
              disabled={empty}
              key={offer.preset.id}
              onClick={() => pick(offer)}
              type="button"
            >
              <span className="flex items-center gap-2 font-medium text-ink">
                {offer.applied ? (
                  <Check className="text-ink" size={13} strokeWidth={1.5} />
                ) : (
                  <Layers className="text-ink-3" size={13} strokeWidth={1.5} />
                )}
                {offer.preset.name}
              </span>
              <span className="text-ink-3 text-small leading-relaxed">
                {brings(offer)}
              </span>
            </button>
          );
        })}
      </div>

      {asking ? (
        <CatalogPresetChoice
          choices={asking.choices}
          onCancel={() => setAsking(null)}
          onChoose={(chosen) => {
            setAsking(null);
            apply(asking.preset, chosen);
          }}
          preset={asking.preset}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel={t("catalog.presets.apply")}
        confirmVariant="inverse"
        onCancel={() => setReplacing(null)}
        onConfirm={() => {
          if (replacing) {
            onPick?.(replacing.preset.id, replacing.chosen);
          }

          setReplacing(null);
        }}
        open={replacing !== null}
        question={
          replacing
            ? t.plural(
                "catalog.presets.replaceQuestion",
                replacing.lost.length,
                {
                  names: replacing.lost.map((module) => module.name).join(", "),
                }
              )
            : ""
        }
        title={
          replacing
            ? t("catalog.presets.replaceTitle", {
                preset: replacing.preset.name,
              })
            : ""
        }
      />
    </Section>
  );
}
