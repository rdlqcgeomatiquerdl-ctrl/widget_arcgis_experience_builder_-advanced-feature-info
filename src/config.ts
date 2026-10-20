import type { ImmutableObject } from "seamless-immutable"

export const DEFAULT_SELECTION_COLOR = "#00ffff"

export interface Config {
  selectionColor?: string
  autoOpenSidebar?: boolean
  sidebarWidgetId?: string
}
export type IMConfig = ImmutableObject<Config>
