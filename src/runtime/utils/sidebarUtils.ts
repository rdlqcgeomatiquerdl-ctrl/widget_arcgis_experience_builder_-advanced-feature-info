import { appActions, getAppStore } from "jimu-core"

export interface SidebarWidgetOption {
  id: string
  label: string
}

export const isSidebarWidget = (widgetJson: any): boolean => {
  if (!widgetJson) return false
  const uri = String(widgetJson.uri || "").toLowerCase()
  const name = String(widgetJson.manifest?.name || "").toLowerCase()
  return uri.includes("widgets/layout/sidebar") || name === "sidebar"
}

const getActiveAppConfig = (): any => {
  const state = getAppStore()?.getState()
  return state?.appStateInBuilder?.appConfig ?? state?.appConfig
}

// List all Sidebar widgets in the application so the user can choose one in Settings
export const getAllSidebarWidgets = (appConfigOverride?: any): SidebarWidgetOption[] => {
  const appConfig = appConfigOverride ?? getActiveAppConfig()
  if (!appConfig?.widgets) return []

  const options: SidebarWidgetOption[] = []
  for (const id of Object.keys(appConfig.widgets)) {
    const w = appConfig.widgets[id]
    if (isSidebarWidget(w)) {
      options.push({
        id,
        label: w.label ? `${w.label} (${id})` : id,
      })
    }
  }
  return options
}

const layoutContainsWidget = (
  appConfig: any,
  layoutId: string,
  targetWidgetId: string,
  visitedLayouts: Set<string>,
): boolean => {
  if (!layoutId || visitedLayouts.has(layoutId)) return false
  visitedLayouts.add(layoutId)

  const layout = appConfig?.layouts?.[layoutId]
  if (!layout?.content) return false

  for (const itemKey of Object.keys(layout.content)) {
    const item = layout.content[itemKey]
    if (!item) continue

    if (item.type === "WIDGET" && item.widgetId) {
      if (item.widgetId === targetWidgetId) {
        return true
      }
      const childWidget = appConfig?.widgets?.[item.widgetId]
      if (childWidget?.layouts) {
        for (const slotKey of Object.keys(childWidget.layouts)) {
          const sizeMap = childWidget.layouts[slotKey]
          if (!sizeMap) continue
          for (const sizeKey of Object.keys(sizeMap)) {
            if (
              layoutContainsWidget(
                appConfig,
                sizeMap[sizeKey],
                targetWidgetId,
                visitedLayouts,
              )
            ) {
              return true
            }
          }
        }
      }
    } else if (item.type === "SECTION" && item.sectionId) {
      const section = appConfig?.sections?.[item.sectionId]
      const views: string[] = section?.views || []
      for (const viewId of views) {
        const view = appConfig?.views?.[viewId]
        if (!view?.layout) continue
        for (const sizeKey of Object.keys(view.layout)) {
          if (
            layoutContainsWidget(
              appConfig,
              view.layout[sizeKey],
              targetWidgetId,
              visitedLayouts,
            )
          ) {
            return true
          }
        }
      }
    }
  }

  return false
}

// Find all ancestor Sidebar widgets that contain the given widgetId
export const findAncestorSidebarIds = (widgetId: string): string[] => {
  if (!widgetId) return []
  const appConfig = getActiveAppConfig()
  if (!appConfig?.widgets) return []

  const sidebarIds: string[] = []

  for (const candidateId of Object.keys(appConfig.widgets)) {
    const widgetJson = appConfig.widgets[candidateId]
    if (!isSidebarWidget(widgetJson) || !widgetJson.layouts) continue

    const visitedLayouts = new Set<string>()
    let found = false

    for (const slotKey of Object.keys(widgetJson.layouts)) {
      const sizeMap = widgetJson.layouts[slotKey]
      if (!sizeMap) continue
      for (const sizeKey of Object.keys(sizeMap)) {
        if (
          layoutContainsWidget(
            appConfig,
            sizeMap[sizeKey],
            widgetId,
            visitedLayouts,
          )
        ) {
          found = true
          break
        }
      }
      if (found) break
    }

    if (found) {
      sidebarIds.push(candidateId)
    }
  }

  return sidebarIds
}

// Resolve target sidebar IDs: uses explicitly configured sidebarWidgetId if set,
// otherwise falls back to auto-detecting ancestor sidebars.
export const resolveTargetSidebarIds = (
  widgetId: string,
  explicitSidebarId?: string,
): string[] => {
  const appConfig = getActiveAppConfig()
  const widgetConfig = appConfig?.widgets?.[widgetId]?.config
  const configuredId = explicitSidebarId ?? widgetConfig?.sidebarWidgetId

  if (configuredId && configuredId !== "auto") {
    if (appConfig?.widgets?.[configuredId]) {
      return [configuredId]
    }
  }

  return findAncestorSidebarIds(widgetId)
}

// Open (open = true) or close (open = false) the configured or ancestor Sidebar widget
export const setAncestorSidebarsOpen = (
  widgetId: string,
  open: boolean,
  explicitSidebarId?: string,
): void => {
  const appConfig = getActiveAppConfig()
  const widgetConfig = appConfig?.widgets?.[widgetId]?.config
  if (widgetConfig?.autoOpenSidebar === false) return

  const sidebarIds = resolveTargetSidebarIds(widgetId, explicitSidebarId)
  if (!sidebarIds.length) return

  for (const sidebarId of sidebarIds) {
    // In Experience Builder's Sidebar widget, state.widgetsState[sidebarId].collapse
    // maps directly to sidebarVisible (true = expanded/open, false = collapsed/closed).
    getAppStore().dispatch(
      appActions.widgetStatePropChange(sidebarId, "collapse", open),
    )
  }
}
