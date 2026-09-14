import type { Field } from "@pupitre/shared/catalog";
import {
  ConfigFieldControl,
  type FieldHandlers,
} from "@renderer/components/config/config-field-control";
import { ConfigZoneField } from "@renderer/components/config/config-zone-field";
import type { CloudflareZone } from "@shared/cloudflare";
import type { SecretMark } from "@shared/secrets";

/**
 * One field of an installed module — and, for the domain of an exposure, the
 * account's zones to pick it from, above the field itself.
 *
 * The pick fills the domain; the field stays typed, since the domain may be a
 * subdomain of the zone, one per server. Changing it is what moves every
 * project's name: the agent carries the routes under the new domain, and the
 * app moves the records.
 */
export function ServiceConfigField({
  field,
  moduleId,
  zones,
  value,
  marks,
  held,
  problem,
  handlers,
}: {
  field: Field;
  moduleId: string;
  /** The zones of the connected account, when the module publishes through one. */
  zones: readonly CloudflareZone[];
  value: unknown;
  marks?: Record<string, SecretMark>;
  held: readonly string[];
  /** Why the value is refused, in the words of whoever refused it. */
  problem?: string;
  handlers: FieldHandlers;
}) {
  const control = (
    <ConfigFieldControl
      field={field}
      handlers={handlers}
      held={held}
      marks={marks}
      moduleId={moduleId}
      problem={problem}
      value={value}
    />
  );

  if (field.key !== "domain" || zones.length === 0) {
    return control;
  }

  return (
    <>
      <ConfigZoneField
        moduleId={moduleId}
        onChange={(domain) => handlers.onValue?.("domain", domain)}
        value={value}
        zones={zones}
      />
      {control}
    </>
  );
}
