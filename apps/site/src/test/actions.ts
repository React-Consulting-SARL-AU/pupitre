const ACTION_RE = /<(a|button|summary)\b([^>]*)>([\s\S]*?)<\/\1>/g
const BUTTON_TAG_RE = /<(?:a|button|summary)\b[^>]*>/g
const TAGS_RE = /<[^>]*>/g
const DOWNLOAD_RE = /\/download\/$/
const SPACE_RE = /\s+/

export interface Action {
  href: string
  label: string
  main: boolean
}

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
}

function isButton(tag: string): boolean {
  return (attribute(tag, "class") ?? "").split(SPACE_RE).includes("btn")
}

export function actions(html: string): Action[] {
  return [...html.matchAll(ACTION_RE)]
    .map(([, , attributes, inner]) => ({
      href: attribute(attributes, "href") ?? "",
      label: inner.replace(TAGS_RE, "").trim(),
      emphasis: attribute(attributes, "data-emphasis"),
    }))
    .filter((action) => action.emphasis !== undefined)
    .map(({ href, label, emphasis }) => ({
      href,
      label,
      main: emphasis === "main",
    }))
}

export function actionTo(html: string, href: string): Action | undefined {
  return actions(html).find((action) => action.href === href)
}

export function offersDownloadAsMainAction(html: string): boolean {
  return actions(html).some(
    (action) => action.main && DOWNLOAD_RE.test(action.href)
  )
}

export function undeclaredButtons(html: string): string[] {
  return (html.match(BUTTON_TAG_RE) ?? [])
    .filter(isButton)
    .filter((tag) => attribute(tag, "data-emphasis") === undefined)
}
