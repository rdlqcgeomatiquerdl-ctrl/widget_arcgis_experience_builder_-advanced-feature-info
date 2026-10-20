/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import {
  React,
  type AllWidgetProps,
  MessageManager,
  MessageType,
  MutableStoreManager,
} from "jimu-core"
import { JimuMapViewComponent, type JimuMapView } from "jimu-arcgis"

import { processFeatureInput } from "./services/featureInputProcessor"
import {
  deduplicateGraphics,
  extractDirectGraphicsFromRecords,
} from "./services/featureRetrieval"
import {
  DEFAULT_SELECTION_COLOR,
  highlightFeature,
  showInputGeometries,
} from "./utils/mapGraphics"
import { setAncestorSidebarsOpen } from "./utils/sidebarUtils"
import {
  handleSelectionMessageForWidget,
  subscribeWidgetSelection,
} from "./utils/selectionMessageBus"
import { useMapGraphics } from "./hooks/useMapGraphics"
import { useMapClick } from "./hooks/useMapClick"
import FeatureResultsPanel from "./components/FeatureResultsPanel"
import type { IMConfig } from "../config"
import type { UnifiedGeometryInput, WidgetSelectionInput } from "./types"

const { useState, useEffect, useRef } = React

interface ActiveInput {
  sourceId?: string
  requestId: number
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const { markerLayer, selectionLayer } = useMapGraphics(jimuMapView)
  const [popupFeatures, setPopupFeatures] = useState<any[]>([])
  const [selectedGraphic, setSelectedGraphic] = useState<any>(null)
  const [selectionEnabled, setSelectionEnabled] = useState(false)
  const [busInput, setBusInput] = useState<WidgetSelectionInput | null>(null)

  const selectionColor = props.config?.selectionColor || DEFAULT_SELECTION_COLOR
  const selectionColorRef = useRef(selectionColor)
  selectionColorRef.current = selectionColor

  const sidebarWidgetId = props.config?.sidebarWidgetId
  const sidebarWidgetIdRef = useRef(sidebarWidgetId)
  sidebarWidgetIdRef.current = sidebarWidgetId

  const requestSequenceRef = useRef(0)
  const activeInputRef = useRef<ActiveInput | null>(null)
  const lastQueryGeometriesRef = useRef<any[]>([])

  const storeInput = (props.mutableStateProps?.widgetInput ??
    MutableStoreManager.getInstance().getStateValue([props.id, "widgetInput"])) as
    | WidgetSelectionInput | null | undefined

  const messageInput = busInput ?? storeInput

  // Subscribe to selection bus AND automatically intercept MessageManager selection changes
  // so the widget reacts to Select/Query/Search even if the user didn't configure the Action tab!
  useEffect(() => {
    const unsubscribe = subscribeWidgetSelection(props.id, (input) => {
      setBusInput(input)
    })

    const mm = MessageManager.getInstance() as any
    if (mm && typeof mm.publishMessage === "function") {
      if (!mm.__afiPatched) {
        const origPublish = mm.publishMessage.bind(mm)
        mm.__afiListeners = new Map<string, (msg: any) => void>()
        mm.publishMessage = function (message: any) {
          if (message?.type === MessageType.DataRecordsSelectionChange) {
            mm.__afiListeners.forEach((listener: (msg: any) => void) => {
              try {
                listener(message)
              } catch (e) {
                console.warn(e)
              }
            })
          }
          return origPublish(message)
        }
        mm.__afiPatched = true
      }

      mm.__afiListeners?.set(props.id, (message: any) => {
        void handleSelectionMessageForWidget(props.id, message)
      })
    }

    return () => {
      unsubscribe()
      const mmInst = MessageManager.getInstance() as any
      mmInst?.__afiListeners?.delete(props.id)
    }
  }, [props.id])

  // Close target sidebar by default on initial mount if no selection is active
  useEffect(() => {
    if (!messageInput || messageInput.kind === "clear") {
      setAncestorSidebarsOpen(props.id, false, sidebarWidgetIdRef.current)
    }
  }, [props.id, sidebarWidgetId])

  // Refresh map highlight colors immediately when selectionColor is changed in Settings
  useEffect(() => {
    if (selectedGraphic?.geometry && selectionLayer) {
      selectionLayer.removeAll()
      highlightFeature(selectionLayer, selectedGraphic.geometry, selectionColor)
    }
    if (lastQueryGeometriesRef.current.length > 0 && markerLayer) {
      showInputGeometries(
        markerLayer,
        lastQueryGeometriesRef.current,
        selectionColor,
      )
    }
  }, [selectionColor])

  const updateFeatureResults = (graphics: any[]) => {
    selectionLayer?.removeAll()
    setSelectedGraphic(null)
    setPopupFeatures(graphics)
  }

  // Clear only our stored message; we do not reset another widget's UI.
  const resetMessageInput = () => {
    setBusInput(null)
    MutableStoreManager.getInstance().updateStateValue(props.id, "widgetInput", null)
  }

  const handleUnifiedGeometryInput = async (
    input: UnifiedGeometryInput,
  ): Promise<void> => {
    if (!jimuMapView?.view) return

    const requestId = ++requestSequenceRef.current
    activeInputRef.current = { sourceId: input.sourceId, requestId }

    selectionLayer?.removeAll()
    setSelectedGraphic(null)

    const directGraphics =
      input.retrievalMethod === "spatial"
        ? extractDirectGraphicsFromRecords(input.records, jimuMapView)
        : []

    if (input.retrievalMethod === "spatial") {
      lastQueryGeometriesRef.current = input.geometries
      showInputGeometries(
        markerLayer,
        input.geometries,
        selectionColorRef.current,
      )
    } else {
      lastQueryGeometriesRef.current = []
    }

    if (directGraphics.length > 0) {
      setPopupFeatures(directGraphics)
      setAncestorSidebarsOpen(props.id, true, sidebarWidgetIdRef.current)
    }

    try {
      const { graphics, queryGeometries } = await processFeatureInput(
        input,
        jimuMapView,
        (partialGraphics) => {
          if (activeInputRef.current?.requestId !== requestId) return
          const merged = deduplicateGraphics([
            ...directGraphics,
            ...partialGraphics,
          ])
          setPopupFeatures(merged)
          if (merged.length > 0) {
            setAncestorSidebarsOpen(props.id, true, sidebarWidgetIdRef.current)
          }
        },
      )
      if (activeInputRef.current?.requestId !== requestId) return

      // Map Click draws its own marker before retrieval.
      // All external geometry selections display the geometries used to query.
      if (input.retrievalMethod === "spatial") {
        lastQueryGeometriesRef.current = queryGeometries
        showInputGeometries(
          markerLayer,
          queryGeometries,
          selectionColorRef.current,
        )
      }
      const finalGraphics = deduplicateGraphics([
        ...directGraphics,
        ...graphics,
      ])
      setPopupFeatures(finalGraphics)
      if (finalGraphics.length > 0) {
        setAncestorSidebarsOpen(props.id, true, sidebarWidgetIdRef.current)
      } else {
        setAncestorSidebarsOpen(props.id, false, sidebarWidgetIdRef.current)
      }
    } catch (error) {
      if (activeInputRef.current?.requestId === requestId) {
        console.error("Unified geometry input error:", error)
      }
    }
  }

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) setJimuMapView(jmv)
  }

  // Preserve the widget's custom feature-highlighting behavior (compatible with both JS API 4.28 highlightOptions and 4.30+/5.x highlights).
  useEffect(() => {
    const view = jimuMapView?.view as any
    if (!view) return

    if (view.highlights && typeof view.highlights.find === "function") {
      const defaultHighlight = view.highlights.find(
        (highlight: any) => highlight.name === "default",
      )
      if (!defaultHighlight) return

      const originalHaloOpacity = defaultHighlight.haloOpacity
      const originalFillOpacity = defaultHighlight.fillOpacity
      defaultHighlight.haloOpacity = 0
      defaultHighlight.fillOpacity = 0

      return () => {
        defaultHighlight.haloOpacity = originalHaloOpacity
        defaultHighlight.fillOpacity = originalFillOpacity
      }
    } else if (view.highlightOptions) {
      const originalHaloOpacity = view.highlightOptions.haloOpacity
      const originalFillOpacity = view.highlightOptions.fillOpacity
      view.highlightOptions.haloOpacity = 0
      view.highlightOptions.fillOpacity = 0

      return () => {
        if (view.highlightOptions) {
          view.highlightOptions.haloOpacity = originalHaloOpacity
          view.highlightOptions.fillOpacity = originalFillOpacity
        }
      }
    }
  }, [jimuMapView])

  const handleBlockClick = async (graphic: any) => {
    if (!selectionEnabled || !jimuMapView?.view || !selectionLayer || !graphic?.geometry) return

    if (selectedGraphic === graphic) {
      selectionLayer.removeAll()
      setSelectedGraphic(null)
      return
    }

    try {
      selectionLayer.removeAll()
      highlightFeature(selectionLayer, graphic.geometry, selectionColor)
      setSelectedGraphic(graphic)
      await jimuMapView.view.goTo(graphic.geometry, { duration: 250 })
    } catch (error) {
      if ((error as any)?.name !== "AbortError") {
        console.error("Zoom / selection error:", error)
      }
    }
  }

  const clearFeatureResults = () => {
    ++requestSequenceRef.current
    activeInputRef.current = null
    lastQueryGeometriesRef.current = []
    updateFeatureResults([])
    markerLayer?.removeAll()
    resetMessageInput()
    setAncestorSidebarsOpen(props.id, false, sidebarWidgetIdRef.current)
  }

  const toggleSelection = () => {
    if (selectionEnabled) {
      selectionLayer?.removeAll()
      setSelectedGraphic(null)
    }
    setSelectionEnabled(!selectionEnabled)
  }

  // Map clicks use the hit rectangle to retrieve overlapping popup features.
  useMapClick(jimuMapView, markerLayer, resetMessageInput, handleUnifiedGeometryInput)

  // Every compatible widget publishes the same selection/clear message payload.
  useEffect(() => {
    if (!messageInput) return

    if (messageInput.kind === "clear") {
      // A source can only clear its own currently displayed results.
      if (activeInputRef.current?.sourceId !== messageInput.sourceId) return
      ++requestSequenceRef.current
      activeInputRef.current = null
      lastQueryGeometriesRef.current = []
      markerLayer?.removeAll()
      updateFeatureResults([])
      setAncestorSidebarsOpen(props.id, false, sidebarWidgetIdRef.current)
      return
    }

    if (!jimuMapView?.view || !messageInput.geometries.length) return

    void handleUnifiedGeometryInput({
      origin: "widget",
      sourceId: messageInput.sourceId,
      geometries: messageInput.geometries,
      records: messageInput.records,
      retrievalMethod: "spatial",
    })
  }, [jimuMapView?.view, markerLayer, messageInput])

  return (
    <div className="jimu-widget" style={{ width: "100%", height: "100%" }}>
      {props.useMapWidgetIds?.length === 1 && (
        <JimuMapViewComponent
          useMapWidgetId={props.useMapWidgetIds[0]}
          onActiveViewChange={activeViewChangeHandler}
        />
      )}
      {jimuMapView?.view && (
        <FeatureResultsPanel
          popupFeatures={popupFeatures}
          selectedGraphic={selectedGraphic}
          selectionEnabled={selectionEnabled}
          selectionColor={selectionColor}
          onFeatureClick={handleBlockClick}
          onToggleSelection={toggleSelection}
          onClearResults={clearFeatureResults}
        />
      )}
    </div>
  )
}

export default Widget
