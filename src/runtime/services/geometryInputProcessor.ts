import type { JimuMapView } from "jimu-arcgis"
import type Graphic from "@arcgis/core/Graphic"
import type Geometry from "@arcgis/core/geometry/Geometry"
import * as unionOperator from "@arcgis/core/geometry/operators/unionOperator"

import { createInwardBuffer } from "../utils/geometryUtils"
import { deduplicateGraphics, retrieveSpatialFeatures } from "./featureRetrieval"

// Geometry collection independent of the source widget
interface GeometryQueryInput {
  geometries: Geometry[]
}

// Retrieve features and the geometries used for querying
export const retrieveFeaturesFromGeometryInput = async (
  jimuMapView: JimuMapView,
  input: GeometryQueryInput,
  onProgress?: (graphics: Graphic[]) => void,
): Promise<{
  graphics: Graphic[]
  queryGeometries: Geometry[]
}> => {
  const queryGeometries: Geometry[] = []

  if (!jimuMapView?.view || !input?.geometries?.length) {
    return { graphics: [], queryGeometries }
  }

  for (const geometry of input.geometries) {
    if (!geometry) continue

    const queryGeometry =
      geometry.type === "polygon"
        ? (createInwardBuffer(geometry) ?? geometry)
        : geometry

    if (queryGeometry) {
      queryGeometries.push(queryGeometry)
    }
  }

  if (!queryGeometries.length) {
    return { graphics: [], queryGeometries }
  }

  // Group geometries by type + spatialReference and union them so each layer is queried once
  const groupedByType = new Map<string, Geometry[]>()
  for (const geom of queryGeometries) {
    const srKey = geom.spatialReference?.wkid ?? geom.spatialReference?.wkt ?? "default"
    const key = `${geom.type}:${srKey}`
    if (!groupedByType.has(key)) {
      groupedByType.set(key, [])
    }
    groupedByType.get(key)!.push(geom)
  }

  const unionedQueryGeometries: Geometry[] = []
  for (const group of groupedByType.values()) {
    if (group.length === 1) {
      unionedQueryGeometries.push(group[0])
    } else {
      try {
        const unioned = unionOperator.executeMany(group as any)
        if (unioned) {
          unionedQueryGeometries.push(unioned as Geometry)
        } else {
          unionedQueryGeometries.push(...group)
        }
      } catch {
        unionedQueryGeometries.push(...group)
      }
    }
  }

  const allGraphics: Graphic[] = []

  // Run unioned queries in parallel instead of sequentially
  await Promise.all(
    unionedQueryGeometries.map(async (queryGeometry) => {
      try {
        const features = await retrieveSpatialFeatures(
          jimuMapView.view,
          queryGeometry,
          (partial) => {
            if (onProgress) {
              const merged = deduplicateGraphics([...allGraphics, ...partial]).reverse()
              onProgress(merged)
            }
          },
        )
        allGraphics.push(...features)
      } catch (error) {
        console.error("Geometry input query error:", error)
      }
    }),
  )

  return {
    graphics: deduplicateGraphics(allGraphics).reverse(),
    queryGeometries,
  }
}
