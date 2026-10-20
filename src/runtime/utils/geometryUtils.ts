import * as geometryEngine from "@arcgis/core/geometry/geometryEngine"

// Create a slightly smaller polygon for spatial queries
export const createInwardBuffer = (polygon: any) => {
  try {
    if (polygon?.spatialReference?.isGeographic) {
      return polygon
    }

    const buffered = geometryEngine.buffer(polygon, -0.1, "feet", false)
    const bufferedPolygon = Array.isArray(buffered) ? buffered[0] : buffered

    if (!bufferedPolygon || (bufferedPolygon as any).isEmpty) {
      console.warn("Inward buffer produced an empty polygon, using original polygon")
      return polygon
    }

    return bufferedPolygon
  } catch (error) {
    console.warn("Inward buffer fallback to original polygon:", error)
    return polygon
  }
}
