import { React, getAppStore } from "jimu-core"
import type { JimuMapView } from "jimu-arcgis"
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer"
import Extent from "@arcgis/core/geometry/Extent"

import type { UnifiedGeometryInput } from "../types"
import { showFeaturePoint } from "../utils/mapGraphics"

const { useEffect, useRef } = React

export const useMapClick = (
  jimuMapView: JimuMapView | undefined,
  markerLayer: GraphicsLayer | undefined,
  clearMessageInput: () => void,
  onGeometryInput: (input: UnifiedGeometryInput) => Promise<void>,
) => {
  // Keep the latest callbacks without recreating the map click listener
  const callbacksRef = useRef({
    clearMessageInput,
    onGeometryInput,
  })

  callbacksRef.current = {
    clearMessageInput,
    onGeometryInput,
  }

  useEffect(() => {
    if (!jimuMapView?.view) return

    const view = jimuMapView.view

    const handle = view.on("click", async (event: any) => {
      // Ignore clicks while the map is moving
      if (view.stationary === false) return

      // Ignore clicks if another tool (e.g. Select tool drawing rectangle/lasso, Draw, Measure) is controlling the map
      try {
        const mapWidgetId = jimuMapView.mapWidgetId
        const state = (getAppStore()?.getState() as any)
        const autoControlId = state?.mapWidgetsInfo?.[mapWidgetId]?.autoControlWidgetId
        if (autoControlId) return
      } catch {
        // Fallback: continue
      }

      // Display the clicked location
      showFeaturePoint(markerLayer, event.mapPoint, view)
      callbacksRef.current.clearMessageInput()

      // Create a small rectangle around the click
      const CLICK_BUFFER = 8

      const hitTarget = {
        x: event.screenPoint.x - CLICK_BUFFER,
        y: event.screenPoint.y - CLICK_BUFFER,
        width: CLICK_BUFFER * 2,
        height: CLICK_BUFFER * 2,
      }

      // Compute map-space extent for tolerance when mapComponent.fetchPopupFeatures is unavailable (ArcGIS Enterprise 11.x)
      let clickGeometry: any = event.mapPoint
      try {
        const p1 = view.toMap({
          x: event.screenPoint.x - CLICK_BUFFER,
          y: event.screenPoint.y + CLICK_BUFFER,
        })
        const p2 = view.toMap({
          x: event.screenPoint.x + CLICK_BUFFER,
          y: event.screenPoint.y - CLICK_BUFFER,
        })
        if (p1 && p2) {
          clickGeometry = new Extent({
            xmin: Math.min(p1.x, p2.x),
            ymin: Math.min(p1.y, p2.y),
            xmax: Math.max(p1.x, p2.x),
            ymax: Math.max(p1.y, p2.y),
            spatialReference: view.spatialReference,
          })
        }
      } catch {
        clickGeometry = event.mapPoint
      }

      // Convert the map click into a unified geometry input
      const input: UnifiedGeometryInput = {
        origin: "map-click",
        geometries: [clickGeometry || event.mapPoint],
        retrievalMethod: "popup",
        hitTarget,
        pointerType: event.pointerType,
      }

      // Send the input to the unified processing workflow
      await callbacksRef.current.onGeometryInput(input)
    })

    return () => {
      handle.remove()
    }
  }, [jimuMapView, markerLayer])
}
