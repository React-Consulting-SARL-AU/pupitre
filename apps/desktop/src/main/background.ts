import { Menu, nativeImage, Tray } from "electron";
import {
  type BackgroundNeeds,
  type TrayActions,
  trayTemplate,
} from "./background-run";
import { localAgentsListening } from "./mcp";
import { forwards, watchForwards } from "./port-forward";
import { byId } from "./servers";
import { forwardDeps } from "./services";
import { trayBitmap } from "./tray-icon";

/** The menu bar's icon height on macOS, and a size the Windows and Linux trays scale cleanly. */
const TRAY_POINTS = 18;
const SCALES = [1, 2];
const BLACK = 0;
const WHITE = 255;

let tray: Tray | null = null;
let unwatch: (() => void) | null = null;

/** The kept forwards are counted from memory: at a login launch none is open yet. */
export function backgroundNeeds(): BackgroundNeeds {
  return {
    agentsListening: localAgentsListening(),
    keptForwards: forwardDeps.memory?.kept().length ?? 0,
  };
}

function trayImage() {
  const ink = process.platform === "darwin" ? BLACK : WHITE;
  const image = nativeImage.createEmpty();

  for (const scaleFactor of SCALES) {
    const size = TRAY_POINTS * scaleFactor;

    image.addRepresentation({
      buffer: trayBitmap(size, ink),
      height: size,
      scaleFactor,
      width: size,
    });
  }

  image.setTemplateImage(true);

  return image;
}

export function showTray(locale: () => string, actions: TrayActions): void {
  if (tray) {
    return;
  }

  const shown = new Tray(trayImage());
  const paint = () =>
    shown.setContextMenu(
      Menu.buildFromTemplate(
        trayTemplate(
          locale(),
          {
            agentsListening: localAgentsListening(),
            forwards: forwards(),
            serverName: (serverId) => byId(serverId)?.name ?? serverId,
          },
          actions
        )
      )
    );

  shown.setToolTip("Pupitre");
  paint();
  tray = shown;
  unwatch = watchForwards(paint);
}

export function hideTray(): void {
  unwatch?.();
  unwatch = null;
  tray?.destroy();
  tray = null;
}
