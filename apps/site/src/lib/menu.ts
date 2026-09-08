type MenuRoot = Pick<Document, "querySelectorAll" | "addEventListener">

export function closeMenusOnDismiss(
  selector: string,
  root: MenuRoot = document
): void {
  const menus = root.querySelectorAll<HTMLDetailsElement>(selector)

  for (const menu of menus) {
    root.addEventListener("click", (event) => {
      if (menu.open && !menu.contains(event.target as Node)) {
        menu.open = false
      }
    })

    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menu.open = false
      }
    })
  }
}
