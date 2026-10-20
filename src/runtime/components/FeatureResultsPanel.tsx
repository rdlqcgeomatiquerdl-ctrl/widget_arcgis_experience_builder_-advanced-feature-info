/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { React } from "jimu-core"
import Feature from "@arcgis/core/widgets/Feature"
import { groupPopupFeatures } from "../utils/groupFeatures"
import { DEFAULT_SELECTION_COLOR, toCssRgba } from "../utils/mapGraphics"

const { useState, useEffect, useRef } = React

// Renders a Graphic's PopupTemplate using the standard ArcGIS JS API Feature widget,
// with a clean HTML attribute table fallback if the Feature widget cannot render.
const FeatureContent = ({ graphic }: { graphic: any }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !graphic) return

    setUseFallback(false)
    el.innerHTML = ""
    const div = document.createElement("div")
    el.appendChild(div)

    let widget: Feature | null = null
    try {
      widget = new Feature({
        container: div,
        graphic,
        map: graphic.layer?.parent ?? undefined,
        spatialReference: graphic.geometry?.spatialReference ?? undefined,
      })
    } catch (err) {
      console.warn("Feature widget render fallback:", err)
      setUseFallback(true)
    }

    return () => {
      try {
        widget?.destroy()
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [graphic])

  const attributes = graphic?.attributes ?? {}

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          whiteSpace: "pre-wrap",
          display: useFallback ? "none" : "block",
        }}
      />
      {useFallback && (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12px",
          }}
        >
          <tbody>
            {Object.entries(attributes).map(([key, val]) => (
              <tr
                key={key}
                style={{ borderBottom: "1px solid #ececec" }}
              >
                <td
                  style={{
                    padding: "4px 6px",
                    fontWeight: 600,
                    color: "#4a4a4a",
                    width: "45%",
                    wordBreak: "break-word",
                  }}
                >
                  {key}
                </td>
                <td
                  style={{
                    padding: "4px 6px",
                    color: "#151515",
                    wordBreak: "break-word",
                  }}
                >
                  {val !== null && val !== undefined ? String(val) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface FeatureResultsPanelProps {
  popupFeatures: any[]
  selectedGraphic: any
  selectionEnabled: boolean
  selectionColor?: string
  onFeatureClick: (graphic: any) => void
  onToggleSelection: () => void
  onClearResults: () => void
}

const iconBtnBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  border: "none",
  borderRadius: "4px",
  background: "transparent",
  color: "#151515",
  cursor: "pointer",
  padding: 0,
}

const FeatureResultsPanel = ({
  popupFeatures,
  selectedGraphic,
  selectionEnabled,
  selectionColor = DEFAULT_SELECTION_COLOR,
  onFeatureClick,
  onToggleSelection,
  onClearResults,
}: FeatureResultsPanelProps) => {
  const [expandedSections, setExpandedSections] = useState<{
    [key: string]: boolean
  }>({})
  const [expandedBlocks, setExpandedBlocks] = useState<{
    [key: string]: boolean
  }>({})

  const groupedPopupFeatures = groupPopupFeatures(popupFeatures)

  const allSectionsExpanded = Object.keys(groupedPopupFeatures).every(
    (title) => expandedSections[title] ?? true,
  )

  const toggleAllSections = () => {
    const nextState: { [key: string]: boolean } = {}

    Object.keys(groupedPopupFeatures).forEach((title) => {
      nextState[title] = !allSectionsExpanded
    })

    setExpandedSections(nextState)
  }

  const toggleSection = (groupTitle: string) => {
    const current = expandedSections[groupTitle] ?? true
    setExpandedSections((previous) => ({
      ...previous,
      [groupTitle]: !current,
    }))
  }

  const toggleBlock = (blockKey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const current = expandedBlocks[blockKey] ?? true
    setExpandedBlocks((previous) => ({
      ...previous,
      [blockKey]: !current,
    }))
  }

  const toggleAllLabel = allSectionsExpanded
    ? "Réduire toutes les sections"
    : "Développer toutes les sections"

  const selectionLabel = selectionEnabled
    ? "Effacer la surbrillance et désactiver la sélection"
    : "Activer la sélection"

  const selectedBlockBg = toCssRgba(selectionColor, 0.35)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#ffffff",
        color: "#151515",
        border: "1px solid #d4d4d4",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: "1px solid #e0e0e0",
          backgroundColor: "#ffffff",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#151515",
              lineHeight: 1.3,
            }}
          >
            Informations sur les entités
          </div>
          {popupFeatures.length > 0 && (
            <div style={{ fontSize: "12px", color: "#6a6a6a" }}>
              Nombre d'entités trouvées : {popupFeatures.length}
            </div>
          )}
        </div>

        {popupFeatures.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {/* Expand or collapse all sections */}
            <button
              type="button"
              title={toggleAllLabel}
              aria-label={toggleAllLabel}
              style={iconBtnBaseStyle}
              onClick={toggleAllSections}
            >
              {allSectionsExpanded ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2.3l5.35 5.35-.7.7L8 3.7 3.35 8.35l-.7-.7L8 2.3zm0 5l5.35 5.35-.7.7L8 8.7l-4.65 4.65-.7-.7L8 7.3z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 13.7L2.65 8.35l.7-.7L8 12.3l4.65-4.65.7.7L8 13.7zm0-5L2.65 3.35l.7-.7L8 7.3l4.65-4.65.7.7L8 8.7z" />
                </svg>
              )}
            </button>

            {/* Toggle feature selection */}
            <button
              type="button"
              title={selectionLabel}
              aria-label={selectionLabel}
              style={{
                ...iconBtnBaseStyle,
                backgroundColor: selectionEnabled ? "#97d1bbe8" : "transparent",
              }}
              onClick={onToggleSelection}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5c0 1.58 1.92 3.72 2.5 4.33.58-.61 2.5-2.75 2.5-4.33A2.5 2.5 0 0 0 9.5 2zm0 3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM3 5h2v1H3v7h8v-2h1v3H2V5h1z" />
              </svg>
            </button>

            {/* Clear feature results */}
            <button
              type="button"
              title="Effacer tous les résultats"
              aria-label="Effacer tous les résultats"
              style={iconBtnBaseStyle}
              onClick={onClearResults}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 3h3v1h-1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4H2V3h3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1zM6 2v1h4V2H6zm-2 2v10h8V4H4zm2 2h1v6H6V6zm3 0h1v6H9V6z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Grouped feature results */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {popupFeatures.length > 0 &&
          Object.entries(groupedPopupFeatures).map(([groupTitle, graphics]) => {
            const isSectionExpanded = expandedSections[groupTitle] ?? true

            return (
              <div
                key={groupTitle}
                style={{ borderBottom: "1px solid #d8d8d8" }}
              >
                {/* Group Header */}
                <div
                  onClick={() => toggleSection(groupTitle)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    backgroundColor: "#dfdedead",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "13px",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      transform: isSectionExpanded
                        ? "rotate(90deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5.5 2.5l5.5 5.5-5.5 5.5-.7-.7L9.6 8 4.8 3.2l.7-.7z" />
                    </svg>
                  </span>
                  <span style={{ flex: 1 }}>{groupTitle}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#555",
                      fontWeight: 500,
                    }}
                  >
                    ({graphics.length})
                  </span>
                </div>

                {/* Group Content */}
                {isSectionExpanded && (
                  <div>
                    {graphics.map((graphic, index) => {
                      const leafTitle =
                        graphic.sourceLayer?.title ||
                        graphic.layer?.title ||
                        "Entité"
                      const blockKey = `${groupTitle}-${leafTitle}-${index}`
                      const isBlockExpanded = expandedBlocks[blockKey] ?? true

                      return (
                        <div
                          key={blockKey}
                          onClick={() => onFeatureClick(graphic)}
                          style={{
                            borderBottom: "1px solid #efefef",
                            backgroundColor:
                              selectedGraphic === graphic
                                ? selectedBlockBg
                                : "transparent",
                            cursor: selectionEnabled ? "pointer" : "default",
                            padding: "6px 10px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "4px 2px",
                              fontWeight: 600,
                              fontSize: "12.5px",
                              color: "#2b2b2b",
                            }}
                          >
                            <span>{leafTitle}</span>
                            <button
                              type="button"
                              onClick={(e) => toggleBlock(blockKey, e)}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                padding: "2px 4px",
                                color: "#555",
                              }}
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                style={{
                                  transform: isBlockExpanded
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                }}
                              >
                                <path d="M2.65 5.35l.7-.7L8 9.3l4.65-4.65.7.7L8 10.7 2.65 5.35z" />
                              </svg>
                            </button>
                          </div>

                          {isBlockExpanded && (
                            <div style={{ paddingTop: "4px" }}>
                              <FeatureContent graphic={graphic} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export default FeatureResultsPanel
