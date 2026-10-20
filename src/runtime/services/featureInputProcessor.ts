import type { JimuMapView } from "jimu-arcgis"
import type Graphic from "@arcgis/core/Graphic"
import type Geometry from "@arcgis/core/geometry/Geometry"

import type { UnifiedGeometryInput } from "../types"
import { retrievePopupFeatures } from "./featureRetrieval"
import { retrieveFeaturesFromGeometryInput } from "./geometryInputProcessor"

export interface FeatureInputResult {
  graphics: Graphic[]
  queryGeometries: Geometry[]
}

export const processFeatureInput = async (
  input: UnifiedGeometryInput,
  jimuMapView: JimuMapView,
  onProgress?: (graphics: Graphic[]) => void,
): Promise<FeatureInputResult> => {
  if (!jimuMapView?.view || !input.geometries.length) {
    return { graphics: [], queryGeometries: [] }
  }

  if (input.retrievalMethod === "popup") {
    const graphics = await retrievePopupFeatures(
      (jimuMapView as any).mapComponent ?? jimuMapView.view,
      input.hitTarget,
      input.pointerType ?? "mouse",
      onProgress,
      jimuMapView.view,
      input.geometries[0],
    )
    return { graphics, queryGeometries: input.geometries }
  }

  // All other supported widgets use the same spatial workflow.
  return retrieveFeaturesFromGeometryInput(jimuMapView, input, onProgress)
}
