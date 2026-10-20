import { React } from "jimu-core"
import type { JimuMapView } from "jimu-arcgis"
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer"
import Extent from "@arcgis/core/geometry/Extent"

import type { UnifiedGeometryInput } from "../types"
import { showFeaturePoint } from "../utils/mapGraphics"
import {
  deduplicateGraphics,
  resolvePopupTemplate,
} from "../services/featureRetrieval"

const { useEffect, useRef } = React

export const useMapClick = (
  jimuMapView: JimuMapView | undefined,
  markerLayer: GraphicsLayer | undefined,
  clearMessageInput: () => void,
  onGeometryInput: (input: UnifiedGeometryInput) => Promise<void>,
  onFeaturesFound?: (graphics: any[]) => void,
) => {
  // Keep the latest callbacks without recreating the map click listener
  const callbacksRef = useRef({
    clearMessageInput,
    onGeometryInput,
    onFeaturesFound,
  })

  callbacksRef.current = {
    clearMessageInput,
    onGeometryInput,
    onFeaturesFound,
  }

  useEffect(() => {
    if (!jimuMapView?.view) return

    const view = jimuMapView.view

    const handle = view.on("click", async (event: any) => {
      // Ignore clicks while the map is moving
      if (view.stationary === false) return

      // Display the clicked location
      showFeaturePoint(markerLayer, event.mapPoint, view)
      callbacksRef.current.clearMessageInput()

      // 1. Try fast view.hitTest first (immediate client-side feature detection)
      try {
        const hit = await view.hitTest(event)
        const hitGraphics: any[] = []
        if (hit?.results?.length) {
          hit.results.forEach((res: any) => {
            const g = res.graphic
            const l = res.layer || g?.layer
            if (
              g &&
              l &&
              l !== markerLayer &&
              l.id !== "feature-info-multi-marker" &&
              l.id !== "feature-info-multi-selection" &&
              l.type !== "graphics"
            ) {
              g.layer = l
              g.sourceLayer = l
              g.popupTemplate = resolvePopupTemplate(
                l,
                undefined,
                g.attributes,
              )
              hitGraphics.push(g)
            }
          })
        }
        if (hitGraphics.length > 0 && callbacksRef.current.onFeaturesFound) {
          const deduplicated = deduplicateGraphics(hitGraphics)
          callbacksRef.current.onFeaturesFound(deduplicated)
          return
        }
      } catch (err) {
        console.warn("hitTest error, falling back to spatial retrieval:", err)
      }

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
