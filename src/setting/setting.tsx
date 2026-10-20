/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { React } from "jimu-core"
import type { AllWidgetSettingProps } from "jimu-for-builder"
import {
  MapWidgetSelector,
  SettingSection,
  SettingRow,
} from "jimu-ui/advanced/setting-components"
import { Select, Option, Switch } from "jimu-ui"
import { ColorPicker } from "jimu-ui/basic/color-picker"
import { DEFAULT_SELECTION_COLOR, type IMConfig } from "../config"
import { getAllSidebarWidgets } from "../runtime/utils/sidebarUtils"

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const selectionColor =
    props.config?.selectionColor || DEFAULT_SELECTION_COLOR
  const autoOpenSidebar = props.config?.autoOpenSidebar !== false
  const sidebarWidgetId = props.config?.sidebarWidgetId || "auto"

  const sidebarOptions = getAllSidebarWidgets()

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({ id: props.id, useMapWidgetIds })
  }

  const onSelectionColorChange = (color: string) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set(
        "selectionColor",
        color || DEFAULT_SELECTION_COLOR,
      ),
    })
  }

  const onAutoOpenSidebarChange = (
    evt: React.ChangeEvent<HTMLInputElement>,
  ) => {
    props.onSettingChange({
      id: props.id,
      config: props.config.set("autoOpenSidebar", evt.target.checked),
    })
  }

  const onSidebarWidgetChange = (
    evt: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const val = evt.target.value
    props.onSettingChange({
      id: props.id,
      config: props.config.set(
        "sidebarWidgetId",
        val === "auto" ? "" : val,
      ),
    })
  }

  return (
    <div className="widget-setting-advanced-feature-info">
      <SettingSection title="Source de la carte">
        <SettingRow label="Sélectionner un widget Carte" flow="wrap">
          <MapWidgetSelector
            useMapWidgetIds={props.useMapWidgetIds}
            onSelect={onMapWidgetSelected}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Apparence de la sélection">
        <SettingRow label="Couleur de sélection des entités">
          <ColorPicker
            width={28}
            height={28}
            color={selectionColor}
            onChange={onSelectionColorChange}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Barre latérale">
        <SettingRow
          tag="label"
          label="Ouvrir/fermer automatiquement lors d'une sélection"
        >
          <Switch
            checked={autoOpenSidebar}
            onChange={onAutoOpenSidebarChange}
          />
        </SettingRow>

        {autoOpenSidebar && (
          <SettingRow label="Barre latérale cible" flow="wrap">
            <Select
              size="sm"
              value={sidebarWidgetId}
              onChange={onSidebarWidgetChange}
            >
              <Option value="auto">
                Automatique (barre latérale parente)
              </Option>
              {sidebarOptions.map((item) => (
                <Option key={item.id} value={item.id}>
                  {item.label}
                </Option>
              ))}
            </Select>
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title="Crédits et droit d'auteur">
        <SettingRow flow="wrap">
          <div style={{ fontSize: "12px", lineHeight: "1.5" }}>
            Basé sur le widget open-source{" "}
            <a
              href="https://github.com/weiliu-gis/advanced-feature-info"
              target="_blank"
              rel="noopener noreferrer"
            >
              weiliu-gis/advanced-feature-info
            </a>{" "}
            par <strong>Wei Liu</strong>.
          </div>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

export default Setting
