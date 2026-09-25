/** What the renderer may ask of one project, or of every project at once. */
export type ProjectAction = "project.up" | "project.down" | "project.restart";

export const PROJECT_ACTIONS: readonly ProjectAction[] = [
  "project.up",
  "project.down",
  "project.restart",
];
