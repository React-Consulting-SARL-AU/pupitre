import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/**
 * A document for the components that only exist once mounted.
 *
 * What floats — a dialog, a list of options, a menu — is drawn through a
 * portal, and a string render has no body to portal into: it renders them as
 * nothing. These are mounted in the document `dom-register` set up for the
 * whole run instead, and read back from it.
 */
export interface Mounted {
  container: HTMLElement;
  /** The whole document: what the component drew where it stands and what it portalled out. */
  html: () => string;
  text: () => string;
  click: (target: Element | null) => Promise<void>;
  key: (target: Element | null, name: string) => Promise<void>;
  unmount: () => void;
}

export async function mount(element: ReactElement): Promise<Mounted> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement("div");

  document.body.appendChild(container);

  let root: Root | null = null;

  await act(() => {
    root = createRoot(container);
    root.render(element);
  });

  // A portal finds its node in an effect and draws on the next pass.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return {
    click: async (target) => {
      if (!target) {
        throw new Error(`nothing to click in ${document.body.innerHTML}`);
      }

      await act(async () => {
        (target as HTMLElement).click();
        await Promise.resolve();
      });
    },
    container,
    html: () => document.body.innerHTML,
    key: async (target, name) => {
      const details = { bubbles: true, cancelable: true, key: name };

      await act(async () => {
        (target ?? document.body).dispatchEvent(
          new KeyboardEvent("keydown", details)
        );
        (target ?? document.body).dispatchEvent(
          new KeyboardEvent("keyup", details)
        );
        await Promise.resolve();
      });
    },
    text: () => document.body.textContent ?? "",
    unmount: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

/** Types into a mounted field the way React hears it: through the native setter, then an input event. */
export async function typeInto(
  input: Element | null,
  value: string
): Promise<void> {
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`no input to type into in ${document.body.innerHTML}`);
  }

  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const POLL_MS = 20;

export async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    });
  }

  throw new Error(`condition not met in ${document.body.innerHTML}`);
}

function labelsOf(role: string): string[] {
  return [...document.querySelectorAll(`[role=${role}]`)].map(
    (element) => element.textContent?.trim() ?? ""
  );
}

/** What a `Select` offers, read by opening it the way a click opens it: its options, and the captions of its groups. */
export async function optionsOf(
  view: Mounted,
  trigger: Element | null
): Promise<{ options: string[]; groups: string[] }> {
  if (!trigger) {
    throw new Error(`no select in ${view.html()}`);
  }

  await view.click(trigger);
  await waitUntil(() => document.querySelector("[role=option]") !== null);

  const options = labelsOf("option");
  const groups = [...document.querySelectorAll("[role=group]")].map(
    (group) =>
      group.querySelector("[role=presentation], div")?.textContent ?? ""
  );

  await view.key(document.activeElement, "Escape");
  await waitUntil(() => document.querySelector("[role=option]") === null);

  return { groups, options };
}
