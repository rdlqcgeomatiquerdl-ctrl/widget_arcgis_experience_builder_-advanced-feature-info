import * as bufferOperator from "@arcgis/core/geometry/operators/bufferOperator"

// Create a slightly smaller polygon for spatial queries
export const createInwardBuffer = (polygon: any) => {
  try {
    if (polygon?.spatialReference?.isGeographic) {
      return polygon
    }

    const bufferedPolygon = bufferOperator.execute(
      polygon,
      -0.1,
      { unit: "feet" },
    )

    if (!bufferedPolygon || bufferedPolygon.isEmpty) {
      console.warn("Inward buffer produced an empty polygon, using original polygon")
      return polygon
    }

    return bufferedPolygon
  } catch (error) {
    console.warn("Inward buffer fallback to original polygon:", error)
    return polygon
  }
}