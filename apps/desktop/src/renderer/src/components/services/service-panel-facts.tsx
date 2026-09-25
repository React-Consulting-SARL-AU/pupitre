import type { ServiceDetail } from "@shared/services";
import { Details } from "../ui/details";

export function ServicePanelFacts({
  detail,
  refusal,
}: {
  detail: ServiceDetail;
  refusal?: string;
}) {
  const facts = [
    detail.version,
    detail.port ? `port ${detail.port}` : null,
  ].filter(Boolean);

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
