import type { ServiceDetail } from "@shared/services";
import { Details } from "../ui/details";

/** What the agent says of this module right now, under its name. */
export function ServicePanelFacts({
  detail,
  refusal,
}: {
  detail: ServiceDetail;
  /** Why the module cannot be retired, when the catalogue forbids it. */
  refusal?: string;
}) {
  const facts = [
    detail.version,
    detail.port ? `port ${detail.port}` : null,
  ].filter(Boolean);

  // What names the module on the machine decides nothing for the reader, and
  // decides everything for whoever goes looking on the server itself.
  const named = [detail.id, detail.unit].filter(Boolean).join(" · ");

  return (
    <>
      {facts.length > 0 ? (
        <p className="font-data text-small" data-service-facts="">
          {facts.join(" · ")}
        </p>
      ) : null}

      {refusal ? (
        <p className="text-small" data-removal-refused="">
          {refusal}
        </p>
      ) : null}

      <Details className="mt-1" name="service">
        <span className="font-data">{named}</span>
      </Details>
    </>
  );
}
