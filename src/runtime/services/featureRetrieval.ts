import Graphic from "@arcgis/core/Graphic";
import { fromJSON as geometryFromJSON } from "@arcgis/core/geometry/support/jsonUtils";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import type { JimuMapView } from "jimu-arcgis";

const normalizeUrl = (url?: string): string =>
  (url ?? "").trim().replace(/\/+$/, "").toLowerCase();

const resolvePopupTemplate = (layer: any, dsLayer?: any, attributes?: any): any => {
  const existing =
    layer?.popupTemplate ||
    layer?.defaultPopupTemplate ||
    dsLayer?.popupTemplate ||
    dsLayer?.defaultPopupTemplate;
  if (existing) return existing;

  if (typeof layer?.createPopupTemplate === "function") {
    try {
      const created = layer.createPopupTemplate();
      if (created) return created;
    } catch {
      // Fallback below
    }
  }

  if (typeof dsLayer?.createPopupTemplate === "function") {
    try {
      const created = dsLayer.createPopupTemplate();
      if (created) return created;
    } catch {
      // Fallback below
    }
  }

  const fieldInfos = Object.keys(attributes ?? {}).map((fieldName) => ({
    fieldName,
    label: fieldName,
    visible: true,
  }));

  return {
    title: layer?.title || dsLayer?.title || "Entité",
    content: [{ type: "fields", fieldInfos }],
  };
};

// Check if a layer/sublayer and all its ancestors are visible and within current map scale
export const isLayerVisibleAtScale = (layer: any, scale: number): boolean => {
  let current = layer;

  while (current) {
    if (current.visible === false) return false;
    if (scale > 0) {
      const minScale = current.minScale ?? 0;
      const maxScale = current.maxScale ?? 0;
      if (minScale > 0 && scale > minScale) return false;
      if (maxScale > 0 && scale < maxScale) return false;
    }
    current = current.parent;
  }

  return true;
};

// Deduplicate graphics by layer + objectId
export const deduplicateGraphics = (graphics: any[]): any[] => {
  const uniqueGraphics: any[] = [];
  const seen = new Map<any, Set<string | number>>();

  for (const graphic of graphics) {
    if (!graphic) continue;
    const layer: any = graphic.sourceLayer || graphic.layer;
    const objectIdField =
      layer?.objectIdField ||
      (graphic.attributes?.OBJECTID !== undefined
        ? "OBJECTID"
        : graphic.attributes?.objectid !== undefined
          ? "objectid"
          : graphic.attributes?.fid !== undefined
            ? "fid"
            : graphic.attributes?.gid !== undefined
              ? "gid"
              : undefined);
    const objectId = objectIdField
      ? graphic.attributes?.[objectIdField]
      : undefined;

    if (!layer || objectId === null || objectId === undefined) {
      uniqueGraphics.push(graphic);
      continue;
    }

    const layerKey = layer.id ?? layer.url ?? layer.title ?? layer;
    if (!seen.has(layerKey)) {
      seen.set(layerKey, new Set());
    }

    const layerIds = seen.get(layerKey)!;
    if (layerIds.has(objectId)) continue;

    layerIds.add(objectId);
    uniqueGraphics.push(graphic);
  }

  return uniqueGraphics;
};

// Synchronously convert already-selected DataRecords from Select/Query/Table into map Graphics (0 ms)
export const extractDirectGraphicsFromRecords = (
  records: any[] | undefined,
  jimuMapView: JimuMapView | undefined,
): any[] => {
  if (!records?.length || !jimuMapView?.view?.map) return [];

  const view = jimuMapView.view;
  const allLayers = view.map.allLayers.toArray();
  const jimuLayerViews = Object.values((jimuMapView as any).jimuLayerViews ?? {});

  // Build fast lookup by dataSourceId and URL
  const findMapLayerForDataSource = (ds: any): any => {
    if (!ds) return null;
    const mainDs = ds.getMainDataSource?.() ?? ds;
    const dsIds = new Set([ds.id, mainDs?.id].filter(Boolean));

    for (const jlv of jimuLayerViews as any[]) {
      if (
        (jlv?.layerDataSourceId && dsIds.has(jlv.layerDataSourceId)) ||
        (jlv?.dataSourceId && dsIds.has(jlv.dataSourceId))
      ) {
        if (jlv.layer) return jlv.layer;
      }
    }

    if (ds.layer && allLayers.includes(ds.layer)) {
      return ds.layer;
    }

    const targetUrl = normalizeUrl(ds.url || mainDs?.url);
    if (!targetUrl) return ds.layer ?? null;

    for (const layer of allLayers as any[]) {
      if (layer.type === "feature" && normalizeUrl(layer.url) === targetUrl) {
        return layer;
      }
      if (layer.type === "feature" && layer.layerId !== undefined) {
        const fullUrl = normalizeUrl(`${layer.url}/${layer.layerId}`);
        if (fullUrl === targetUrl) return layer;
      }
      if (layer.type === "map-image" && layer.allSublayers) {
        const sub = layer.allSublayers.find(
          (s: any) =>
            normalizeUrl(s.url) === targetUrl ||
            normalizeUrl(`${layer.url}/${s.id}`) === targetUrl,
        );
        if (sub) return sub;
      }
    }

    return ds.layer ?? null;
  };

  const directGraphics: any[] = [];

  for (const record of records) {
    if (!record) continue;
    const ds = record.dataSource;
    const mapLayer = findMapLayerForDataSource(ds);
    const layer =
      mapLayer ??
      ds?.layer ?? {
        id: ds?.id || "selection-layer",
        title: ds?.getLabel?.() || ds?.layerDefinition?.name || "Entité",
      };

    if (layer && layer.popupEnabled === false) continue;

    let geometry: any = null;
    if (typeof record.getJSAPIGeometry === "function") {
      try {
        geometry = record.getJSAPIGeometry();
      } catch {
        geometry = null;
      }
    }
    if (!geometry) {
      const raw = record.feature?.geometry ?? record.getGeometry?.();
      if (raw) {
        if (typeof raw.type === "string" && typeof raw.toJSON === "function") {
          geometry = raw;
        } else {
          try {
            const json =
              typeof raw.toJS === "function"
                ? raw.toJS()
                : typeof raw.toJSON === "function"
                  ? raw.toJSON()
                  : raw;
            geometry = geometryFromJSON(json);
          } catch {
            geometry = null;
          }
        }
      }
    }

    const rawFeature = record.feature;
    const attributes = rawFeature?.attributes
      ? { ...rawFeature.attributes }
      : typeof record.getData === "function"
        ? { ...record.getData() }
        : {};

    const popupTemplate = resolvePopupTemplate(mapLayer, ds?.layer, attributes);

    const graphic =
      rawFeature?.declaredClass === "esri.Graphic" && typeof rawFeature.clone === "function"
        ? rawFeature.clone()
        : new Graphic({
            attributes,
            geometry,
          });

    if (geometry && !graphic.geometry) {
      graphic.geometry = geometry;
    }
    graphic.layer = layer;
    (graphic as any).sourceLayer = layer;
    graphic.popupTemplate = popupTemplate;

    directGraphics.push(graphic);
  }

  return deduplicateGraphics(directGraphics);
};

// Retrieve popup-enabled features at a screen point or rectangle (streams progressively)
export const retrievePopupFeatures = async (
  mapComponent: any,
  hitTarget: any,
  pointerType: any = "mouse",
  onProgress?: (graphics: any[]) => void,
  view?: any,
  fallbackGeometry?: any,
): Promise<any[]> => {
  const activeView = view ?? mapComponent;

  if (typeof mapComponent?.fetchPopupFeatures === "function") {
    try {
      const graphicGenerator = await mapComponent.fetchPopupFeatures(hitTarget, {
        pointerType,
      });

      const graphics: any[] = [];

      for await (const graphic of graphicGenerator) {
        graphics.push(graphic);
        onProgress?.(graphics.slice());
      }

      if (graphics.length > 0) {
        return graphics;
      }
    } catch (err) {
      console.warn("fetchPopupFeatures fallback to spatial query:", err);
    }
  }

  if (activeView && fallbackGeometry) {
    return retrieveSpatialFeatures(activeView, fallbackGeometry, onProgress);
  }

  if (typeof activeView?.popup?.fetchFeatures === "function") {
    try {
      const response = await activeView.popup.fetchFeatures(hitTarget);
      const graphics = (await response?.allGraphicsPromise) ?? [];
      if (graphics.length > 0) {
        onProgress?.(graphics);
      }
      return graphics;
    } catch (err) {
      console.warn("popup.fetchFeatures fallback error:", err);
    }
  }

  return [];
};

// Retrieve popup-enabled features intersecting a geometry (or array of geometries)
export const retrieveSpatialFeatures = async (
  view: any,
  geometry: any,
  onProgress?: (graphics: any[]) => void,
): Promise<any[]> => {
  const POINT_TOLERANCE_FEET = 2;

  let queryGeometry = geometry;

  if (geometry?.type === "point" && !geometry?.spatialReference?.isGeographic) {
    try {
      const buffered = geometryEngine.buffer(
        geometry,
        POINT_TOLERANCE_FEET,
        "feet",
        false,
      );
      queryGeometry =
        (Array.isArray(buffered) ? buffered[0] : buffered) ?? geometry;
    } catch (error) {
      console.warn("Point tolerance buffer error:", error);
    }
  }

  const currentScale = view.scale ?? 0;
  const layerViewsByLayer = new Map<any, any>();
  view.allLayerViews?.forEach((lv: any) => {
    if (lv?.layer) layerViewsByLayer.set(lv.layer, lv);
  });

  const queryLayers: any[] = [];

  // Collect visible & in-scale popup-enabled Feature Layers and Map Image sublayers
  for (const layer of view.map.allLayers.toArray()) {
    if (!isLayerVisibleAtScale(layer, currentScale)) continue;

    const topLv = layerViewsByLayer.get(layer);
    if (topLv?.suspended) continue;

    if (layer.type === "feature") {
      if (layer.popupEnabled !== false) {
        queryLayers.push(layer);
      }
    }

    if (layer.type === "map-image") {
      try {
        if (layer.loadStatus === "not-loaded") {
          await layer.load();
        }

        layer.allSublayers?.forEach((sublayer: any) => {
          if (
            isLayerVisibleAtScale(sublayer, currentScale) &&
            (sublayer.sublayers?.length ?? 0) === 0 &&
            sublayer.popupEnabled !== false
          ) {
            queryLayers.push(sublayer);
          }
        });
      } catch (error) {
        console.error("Map Image Layer load error:", error);
      }
    }
  }

  const accumulated: any[] = [];

  // Query each visible in-scale layer in parallel and stream results as each layer resolves
  await Promise.all(
    queryLayers.map(async (layer) => {
      try {
        if (typeof layer.createQuery !== "function" || typeof layer.queryFeatures !== "function") {
          return;
        }
        const query = layer.createQuery();
        query.geometry = queryGeometry;
        query.spatialRelationship = "intersects";
        query.outFields = ["*"];
        query.returnGeometry = true;

        let featureSet: any = null;

        // Fast client-side path when FeatureLayerView has all fields loaded in memory
        if (layer.type === "feature") {
          const lv = layerViewsByLayer.get(layer);
          if (
            lv &&
            !lv.updating &&
            !lv.suspended &&
            typeof lv.queryFeatures === "function" &&
            (layer.outFields?.includes("*") || lv.availableFields?.includes("*"))
          ) {
            try {
              featureSet = await lv.queryFeatures(query);
            } catch {
              featureSet = null;
            }
          }
        }

        if (!featureSet) {
          featureSet = await layer.queryFeatures(query);
        }

        const layerGraphics = (featureSet?.features ?? []).map((graphic: any) => {
          graphic.layer = layer;
          (graphic as any).sourceLayer = layer;
          graphic.popupTemplate = resolvePopupTemplate(layer, undefined, graphic.attributes);
          return graphic;
        });

        if (layerGraphics.length > 0) {
          accumulated.push(...layerGraphics);
          onProgress?.(accumulated.slice());
        }
      } catch (error) {
        console.error(`Spatial query error: ${layer.title}`, error);
      }
    }),
  );

  return accumulated;
};
