/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { React } from "jimu-core"
import Feature from "@arcgis/core/widgets/Feature"
import { groupPopupFeatures } from "../utils/groupFeatures"
import { DEFAULT_SELECTION_COLOR, toCssRgba } from "../utils/mapGraphics"

const { useState, useEffect, useRef } = React

// Renders a Graphic's PopupTemplate using the standard ArcGIS JS API Feature widget
// (compatible with both ArcGIS Enterprise 11.x / JS API 4.x and Experience Builder 1.21 / JS API 5.x)
const FeatureContent = ({ graphic }: { graphic: any }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !graphic) return

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
    }

    return () => {
      try {
        widget?.destroy()
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [graphic])

  return <div ref={containerRef} style={{ whiteSpace: "pre-wrap" }} />
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

  // Add padding to Calcite's section header inside its shadow root
  const styleSectionHeader = async (section: any) => {
    if (!section || typeof section.componentOnReady !== "function") return

    await section.componentOnReady()

    const shadowRoot = section.shadowRoot
    if (!shadowRoot || shadowRoot.querySelector("#section-header-style")) {
      return
    }

    const style = document.createElement("style")
    style.id = "section-header-style"
    style.textContent = `
      .toggle {
        padding-inline: 12px !important;
      }
    `

    shadowRoot.appendChild(style)
  }

  const updateSectionExpansion = (groupTitle: string, expanded: boolean) => {
    setExpandedSections((previous) => ({
      ...previous,
      [groupTitle]: expanded,
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
    <calcite-panel
      heading="Informations sur les entités"
      style={
        {
          "--calcite-panel-background-color": "#ffffff",
        } as React.CSSProperties
      }
    >
      {popupFeatures.length > 0 && (
        <>
          <span slot="description" style={{ fontSize: "12px" }}>
            Nombre d'entités trouvées : {popupFeatures.length}
          </span>

          <div
            slot="header-actions-end"
            style={{ display: "flex", alignItems: "center", gap: "2px" }}
          >
            {/* Expand or collapse all sections */}
            <calcite-action
              id="toggle-all-sections"
              icon={allSectionsExpanded ? "chevrons-up" : "chevrons-down"}
              text={toggleAllLabel}
              title={toggleAllLabel}
              style={
                {
                  "--calcite-color-focus": "transparent",
                } as React.CSSProperties
              }
              onClick={toggleAllSections}
            />
            <calcite-tooltip
              close-on-click
              reference-element="toggle-all-sections"
              placement="bottom"
            >
              {toggleAllLabel}
            </calcite-tooltip>

            {/* Toggle feature selection */}
            <calcite-action
              id="selection-action-switch"
              icon="enable-disable-feature-selection"
              text={selectionLabel}
              title={selectionLabel}
              style={
                {
                  "--calcite-color-focus": "transparent",
                  "--calcite-action-background-color": selectionEnabled
                    ? "#97d1bbe8"
                    : "transparent",
                } as React.CSSProperties
              }
              onClick={onToggleSelection}
            />
            <calcite-tooltip
              close-on-click
              reference-element="selection-action-switch"
              placement="bottom"
            >
              {selectionLabel}
            </calcite-tooltip>

            {/* Clear feature results */}
            <calcite-action
              id="clear-results-action"
              icon="trash"
              text="Effacer tous les résultats"
              title="Effacer tous les résultats"
              onClick={onClearResults}
            />
            <calcite-tooltip
              close-on-click
              reference-element="clear-results-action"
              placement="bottom"
            >
              Effacer tous les résultats
            </calcite-tooltip>
          </div>
        </>
      )}

      {/* Grouped feature results */}
      {popupFeatures.length > 0 && (
        <div>
          {Object.entries(groupedPopupFeatures).map(([groupTitle, graphics]) => (
            <calcite-block-section
              key={groupTitle}
              ref={(section) => {
                if (section) void styleSectionHeader(section)
              }}
              text={groupTitle}
              expanded={expandedSections[groupTitle] ?? true}
              oncalciteBlockSectionExpand={() => {
                updateSectionExpansion(groupTitle, true)
              }}
              oncalciteBlockSectionCollapse={() => {
                updateSectionExpansion(groupTitle, false)
              }}
              style={
                {
                  "--calcite-block-section-content-space": "0px",
                  "--calcite-block-section-border-color": "transparent",
                  "--calcite-color-focus": "transparent",
                  "--calcite-block-section-background-color": "#dfdedead",
                } as React.CSSProperties
              }
            >
              {graphics.map((graphic, index) => {
                const leafTitle =
                  graphic.sourceLayer?.title ||
                  graphic.layer?.title ||
                  "Entité"

                return (
                  <calcite-block
                    key={`${groupTitle}-${leafTitle}-${index}`}
                    heading={leafTitle}
                    label={leafTitle}
                    expanded
                    style={
                      {
                        "--calcite-block-border-color": "transparent",
                        "--calcite-block-content-space": "5px",
                        backgroundColor:
                          selectedGraphic === graphic
                            ? selectedBlockBg
                            : "transparent",
                        transition: "background-color 0s ease",
                        cursor: selectionEnabled ? "pointer" : "default",
                      } as React.CSSProperties
                    }
                    onClick={() => onFeatureClick(graphic)}
                  >
                    <FeatureContent graphic={graphic} />
                  </calcite-block>
                )
              })}
            </calcite-block-section>
          ))}
        </div>
      )}

      <div
        slot="footer"
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "flex-end",
          fontSize: "11px",
          color: "#6a6a6a",
        }}
      >
        <span>
          Source :{" "}
          <a
            href="https://github.com/weiliu-gis/advanced-feature-info"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            weiliu-gis/advanced-feature-info
          </a>{" "}
          (Wei Liu)
        </span>
      </div>
    </calcite-panel>
  )
}

export default FeatureResultsPanel
