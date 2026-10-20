import {
  MessageType,
  MutableStoreManager,
  type DataRecord,
  type DataRecordsSelectionChangeMessage,
  type Message,
} from "jimu-core"
import type Geometry from "@arcgis/core/geometry/Geometry"
import { fromJSON as geometryFromJSON } from "@arcgis/core/geometry/support/jsonUtils"
import type { WidgetSelectionInput } from "../types"
import { setAncestorSidebarsOpen } from "./sidebarUtils"

// Convert selected records to ArcGIS Maps SDK geometries regardless of source widget.
export const getRecordGeometry = (record: DataRecord): Geometry | null => {
  const anyRecord = record as any
  if (typeof anyRecord.getJSAPIGeometry === "function") {
    try {
      const jsapiGeom = anyRecord.getJSAPIGeometry()
      if (jsapiGeom) return jsapiGeom as Geometry
    } catch {
      // Fallback below
    }
  }

  const raw = anyRecord.feature?.geometry ?? record.getGeometry?.()
  if (!raw) return null

  if (typeof raw.type === "string" && typeof raw.toJSON === "function") {
    return raw as Geometry
  }

  const json =
    typeof raw.toJS === "function"
      ? raw.toJS()
      : typeof raw.toJSON === "function"
        ? raw.toJSON()
        : raw

  try {
    return geometryFromJSON(json)
  } catch (error) {
    console.warn("[Feature Info Multi] Unsupported selection geometry:", error)
    return null
  }
}

interface LayerSelectionEntry {
  geometries: Geometry[]
  records: DataRecord[]
}

const selectionsByTarget = new Map<
  string,
  Map<string, Map<string, LayerSelectionEntry>>
>()
const clearTimers = new Map<string, ReturnType<typeof setTimeout>>()
const widgetListeners = new Map<
  string,
  Set<(input: WidgetSelectionInput) => void>
>()

export const subscribeWidgetSelection = (
  widgetId: string,
  listener: (input: WidgetSelectionInput) => void,
): (() => void) => {
  if (!widgetListeners.has(widgetId)) {
    widgetListeners.set(widgetId, new Set())
  }
  widgetListeners.get(widgetId)!.add(listener)
  return () => {
    widgetListeners.get(widgetId)?.delete(listener)
  }
}

const emitToWidget = (targetWidgetId: string, input: WidgetSelectionInput) => {
  MutableStoreManager.getInstance().updateStateValue(
    targetWidgetId,
    "widgetInput",
    input,
  )
  const listeners = widgetListeners.get(targetWidgetId)
  if (listeners) {
    listeners.forEach((fn) => {
      try {
        fn(input)
      } catch (e) {
        console.error(e)
      }
    })
  }
}

const getSourceMap = (
  targetWidgetId: string,
  sourceKey: string,
): Map<string, LayerSelectionEntry> => {
  let targetMap = selectionsByTarget.get(targetWidgetId)
  if (!targetMap) {
    targetMap = new Map()
    selectionsByTarget.set(targetWidgetId, targetMap)
  }
  let sourceMap = targetMap.get(sourceKey)
  if (!sourceMap) {
    sourceMap = new Map()
    targetMap.set(sourceKey, sourceMap)
  }
  return sourceMap
}

export const handleSelectionMessageForWidget = async (
  targetWidgetId: string,
  message: Message,
): Promise<boolean> => {
  if (message?.type !== MessageType.DataRecordsSelectionChange) return false

  const selection = message as DataRecordsSelectionChangeMessage
  const records = selection.records ?? []
  const dsId =
    selection.dataSourceId ??
    selection.dataSourceIds?.[0] ??
    (records[0] as any)?.dataSource?.id ??
    "records"
  const sourceKey = selection.widgetId ?? `ds:${dsId}`
  const timerKey = `${targetWidgetId}:${sourceKey}`
  const store = MutableStoreManager.getInstance()
  if (store.getStateValue([targetWidgetId, "widgetInput"]) === null) {
    selectionsByTarget.delete(targetWidgetId)
  }
  const sourceMap = getSourceMap(targetWidgetId, sourceKey)

  if (records.length === 0) {
    // Ignore empty selection notifications for layers that had no active selection
    if (!sourceMap.has(dsId) && sourceMap.size > 0) {
      return true
    }

    sourceMap.delete(dsId)
    const entries = Array.from(sourceMap.values())
    const remainingGeometries = entries.flatMap((e) => e.geometries)
    const remainingRecords = entries.flatMap((e) => e.records)

    if (remainingGeometries.length > 0) {
      const input: WidgetSelectionInput = {
        kind: "selection",
        sourceId: sourceKey,
        geometries: remainingGeometries,
        records: remainingRecords,
      }
      emitToWidget(targetWidgetId, input)
      return true
    }

    // Debounce clear slightly in case another layer in Select is about to report a selection
    const existingTimer = clearTimers.get(timerKey)
    if (existingTimer) clearTimeout(existingTimer)
    clearTimers.set(
      timerKey,
      setTimeout(() => {
        clearTimers.delete(timerKey)
        if (sourceMap.size === 0) {
          const input: WidgetSelectionInput = {
            kind: "clear",
            sourceId: sourceKey,
          }
          emitToWidget(targetWidgetId, input)
          setAncestorSidebarsOpen(targetWidgetId, false)
        }
      }, 40),
    )
    return true
  }

  const existingClearTimer = clearTimers.get(timerKey)
  if (existingClearTimer) {
    clearTimeout(existingClearTimer)
    clearTimers.delete(timerKey)
  }

  const geometries: Geometry[] = []
  const missingByDs = new Map<any, Array<string | number>>()

  for (const record of records) {
    const geom = getRecordGeometry(record)
    if (geom && (record as any).hasFullGeometry !== false) {
      geometries.push(geom)
    } else {
      const ds = (record as any).dataSource
      const id = record.getId?.()
      if (
        ds &&
        typeof ds.query === "function" &&
        id !== undefined &&
        id !== null
      ) {
        if (!missingByDs.has(ds)) missingByDs.set(ds, [])
        missingByDs.get(ds)!.push(id)
      } else if (geom) {
        geometries.push(geom)
      }
    }
  }

  if (missingByDs.size > 0) {
    await Promise.all(
      Array.from(missingByDs.entries()).map(async ([ds, objectIds]) => {
        try {
          const res = await ds.query({
            objectIds,
            returnGeometry: true,
            returnFullGeometry: true,
          })
          for (const rec of res?.records ?? []) {
            const g = getRecordGeometry(rec)
            if (g) geometries.push(g)
          }
        } catch (err) {
          console.warn(
            "[Advanced Feature Info] Fallback geometry query failed:",
            err,
          )
        }
      }),
    )
  }

  if (geometries.length === 0) {
    console.warn(
      "[Advanced Feature Info] Selected records are missing geometries",
    )
    return false
  }

  sourceMap.set(dsId, { geometries, records })
  const entries = Array.from(sourceMap.values())
  const allGeometries = entries.flatMap((e) => e.geometries)
  const allRecords = entries.flatMap((e) => e.records)

  const input: WidgetSelectionInput = {
    kind: "selection",
    sourceId: sourceKey,
    geometries: allGeometries,
    records: allRecords,
  }
  setAncestorSidebarsOpen(targetWidgetId, true)
  emitToWidget(targetWidgetId, input)
  return true
}
