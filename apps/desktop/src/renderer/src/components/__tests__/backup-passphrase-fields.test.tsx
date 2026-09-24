import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BackupPassphraseFields } from "../connections/backup-passphrase-fields";

const DRAWN = "k7pm-x2qa-zdkd-4x4k-4b96-6qrc";

function render(drawn: string | null, noted: boolean, attempted: boolean) {
  return renderToStaticMarkup(
    <BackupPassphraseFields
      attempted={attempted}
      confirm={drawn ?? ""}
      drawn={drawn}
      noted={noted}
      onChange={() => undefined}
      onNoted={() => undefined}
      passphrase={drawn ?? ""}
      shown={attempted}
    />
  );
}

describe("la phrase de passe tirée", () => {
  it("demande de dire qu'elle est notée ailleurs, une fois tirée", () => {
    const html = render(DRAWN, false, false);

    expect(html).toContain(DRAWN);
    expect(html).toContain(
      "J&#x27;ai noté cette phrase ailleurs que sur cet ordinateur"
    );
  });

  it("dit ce qui manque quand on enregistre sans l'avoir cochée", () => {
    expect(render(DRAWN, false, true)).toContain(
      "Cochez cette case une fois la phrase notée"
    );
    expect(render(DRAWN, true, true)).not.toContain(
      "Cochez cette case une fois la phrase notée"
    );
  });

  it("ne demande rien de tel pour une phrase tapée deux fois", () => {
    expect(render(null, false, true)).not.toContain(
      "J&#x27;ai noté cette phrase"
    );
  });
});
