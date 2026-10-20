import Graphic from "@arcgis/core/Graphic"
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer"
import PictureMarkerSymbol from "@arcgis/core/symbols/PictureMarkerSymbol"
import { DEFAULT_SELECTION_COLOR } from "../../config"

export { DEFAULT_SELECTION_COLOR }

const parseColorToRgb = (colorStr?: string): [number, number, number] => {
  const raw = (colorStr || DEFAULT_SELECTION_COLOR).trim()
  if (raw.startsWith("#")) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16) || 0,
        parseInt(hex[1] + hex[1], 16) || 0,
        parseInt(hex[2] + hex[2], 16) || 0,
      ]
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16) || 0,
        parseInt(hex.slice(2, 4), 16) || 0,
        parseInt(hex.slice(4, 6), 16) || 0,
      ]
    }
  }
  const rgbMatch = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    return [
      Number(rgbMatch[1]) || 0,
      Number(rgbMatch[2]) || 0,
      Number(rgbMatch[3]) || 0,
    ]
  }
  return [0, 255, 255]
}

export const toRgbaArray = (
  colorStr: string | undefined,
  alpha: number,
): [number, number, number, number] => {
  const [r, g, b] = parseColorToRgb(colorStr)
  return [r, g, b, alpha]
}

export const toCssRgba = (
  colorStr: string | undefined,
  alpha: number,
): string => {
  const [r, g, b, a] = toRgbaArray(colorStr, alpha)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Show the clicked map location
export const showFeaturePoint = (
  markerLayer: GraphicsLayer | undefined,
  point: any,
  view: any,
) => {
  if (!view?.stationary) return
  if (!markerLayer || !point) return

  markerLayer.removeAll()

  const pinGraphic = new Graphic({
    geometry: point,
    symbol: new PictureMarkerSymbol({
      url: "https://static.arcgis.com/images/Symbols/Shapes/RedPin1LargeB.png",
      width: "40px",
      height: "40px",
      yoffset: "15px",
    }),
  })

  markerLayer.add(pinGraphic)
}

// Highlight a selected feature on the map
export const highlightFeature = (
  selectionLayer: GraphicsLayer,
  geometry: any,
  selectionColor: string = DEFAULT_SELECTION_COLOR,
) => {
  const selectionGraphic = new Graphic({
    geometry,
  })

  const outlineColor = toRgbaArray(selectionColor, 1)

  if (geometry.type === "polygon") {
    selectionGraphic.symbol = {
      type: "simple-fill",
      color: toRgbaArray(selectionColor, 0.2),
      outline: {
        color: outlineColor,
        width: 2.5,
      },
    } as any
  }

  if (geometry.type === "polyline") {
    selectionGraphic.symbol = {
      type: "simple-line",
      color: outlineColor,
      width: 4,
    } as any
  }

  if (geometry.type === "point") {
    selectionGraphic.symbol = {
      type: "simple-marker",
      color: toRgbaArray(selectionColor, 0.4),
      size: 16,
      outline: {
        color: outlineColor,
        width: 2,
      },
    } as any
  }

  selectionLayer.add(selectionGraphic)
}

// Display one or more geometries from other widgets
export const showInputGeometries = (
  markerLayer: any,
  geometries: any[],
  selectionColor: string = DEFAULT_SELECTION_COLOR,
) => {
  if (!markerLayer) return

  // Clear previous location graphics only once
  markerLayer.removeAll()

  const outlineColor = toRgbaArray(selectionColor, 1)
  const fillColor = toRgbaArray(selectionColor, 0.12)

  for (const geometry of geometries) {
    if (!geometry) continue

    let symbol: any

    if (geometry.type === "point") {
      // Use the same red pin as Map Click
      symbol = new PictureMarkerSymbol({
        url: "https://static.arcgis.com/images/Symbols/Shapes/RedPin1LargeB.png",
        width: "40px",
        height: "40px",
        yoffset: "15px",
      })
    } else if (geometry.type === "polyline") {
      symbol = {
        type: "simple-line",
        color: outlineColor,
        width: 3,
      }
    } else if (geometry.type === "polygon") {
      symbol = {
        type: "simple-fill",
        color: fillColor,
        outline: {
          color: outlineColor,
          width: 3,
        },
      }
    } else {
      continue
    }

    markerLayer.add(
      new Graphic({
        geometry,
        symbol,
      }),
    )
  }
}
