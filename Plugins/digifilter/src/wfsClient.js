import CONFIG from './config';

export function buildWfsUrl(typeName, cqlFilter) {
  return `${CONFIG.WFS_BASE}?service=WFS&version=1.1.0&request=GetFeature` +
    `&typeName=${encodeURIComponent(typeName)}` +
    `&outputFormat=application/json` +
    `&srsname=${encodeURIComponent(CONFIG.WFS_SRS)}` +
    `&CQL_FILTER=${encodeURIComponent(cqlFilter)}`;
}

export function geometryToWKT(geometry) {
  if (!geometry) return null;
  // WFS 1.1.0 needs Y (North) then X (East)
  const formatCoord = c => `${c[1]} ${c[0]}`;

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0].map(formatCoord).join(',');
    return `POLYGON((${coords}))`;
  } else if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates.map(poly =>
      `((${poly[0].map(formatCoord).join(',')}))`
    ).join(',');
    return `MULTIPOLYGON(${polys})`;
  }
  return null;
}

export function computeGeoJSONExtent(geometry) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  function visitCoords(coords) {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
    } else {
      coords.forEach(visitCoords);
    }
  }

  visitCoords(geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

export function extentsIntersect(a, b) {
  return a[0] <= b[2] &&
         a[2] >= b[0] &&
         a[1] <= b[3] &&
         a[3] >= b[1];
}

export async function fetchProjektGeometry(projektNr) {
  if (!projektNr || projektNr === 'undefined') return null;
  const typeName = `${CONFIG.WFS_WORKSPACE}:${CONFIG.WFS_TYPENAME}`;
  const url = buildWfsUrl(typeName, `${CONFIG.PROJEKT_ATTRS.projektNr}=${projektNr}`);
  try {
    const response = await fetch(url);
    const json = await response.json();
    return json.features?.[0]?.geometry || null;
  } catch (e) { return null; }
}

export async function getProjektWKT(projektNr, state) {
  if (state.cachedProjektNr === projektNr && state.cachedProjektWKT) {
    return state.cachedProjektWKT;
  }

  const projektGeometry = await fetchProjektGeometry(projektNr);
  if (!projektGeometry) return null;

  const wkt = geometryToWKT(projektGeometry);
  state.cachedProjektNr = projektNr;
  state.cachedProjektWKT = wkt;
  return wkt;
}

export async function fetchExtentByProjektNr(projektNr, state) {
  const typeName = `${CONFIG.WFS_WORKSPACE}:${CONFIG.WFS_TYPENAME}`;
  const url = buildWfsUrl(typeName, `${CONFIG.PROJEKT_ATTRS.projektNr}=${projektNr}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("WFS request failed: " + response.status);
  }

  const json = await response.json();
  if (!json.features || json.features.length === 0) return null;

  const geometry = json.features[0].geometry;

  // Populate the WKT cache while we already have the geometry, so
  // getProjektWKT() calls later in the same load cycle skip the re-fetch.
  if (state) {
    state.cachedProjektNr  = projektNr;
    state.cachedProjektWKT = geometryToWKT(geometry);
  }

  return computeGeoJSONExtent(geometry);
}

export async function fetchIntersectingFeatures(extent, layerName, projektNr, viewer, state) {
  try {
    const layer = viewer.getLayer(layerName);
    if (!layer) return [];

    if (layer.get('type') === 'WFS') {
      const wkt = await getProjektWKT(projektNr, state);
      if (!wkt) return [];

      const typeName = `${CONFIG.WFS_WORKSPACE}:${layerName}`;

      const posList = wkt
        .replace('POLYGON((', '').replace('))', '')
        .split(',')
        .map(p => {
          const [y, x] = p.trim().split(' ');
          return `${x} ${y}`;
        })
        .join(' ');

      const xml = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
        xmlns:wfs="http://www.opengis.net/wfs"
        xmlns:ogc="http://www.opengis.net/ogc"
        xmlns:gml="http://www.opengis.net/gml">
        <wfs:Query typeName="${typeName}" srsName="${CONFIG.WFS_SRS}">
          <ogc:Filter>
            <ogc:Intersects>
              <ogc:PropertyName>geom</ogc:PropertyName>
              <gml:Polygon srsName="${CONFIG.WFS_SRS}">
                <gml:exterior>
                  <gml:LinearRing>
                    <gml:posList>${posList}</gml:posList>
                  </gml:LinearRing>
                </gml:exterior>
              </gml:Polygon>
            </ogc:Intersects>
          </ogc:Filter>
        </wfs:Query>
      </wfs:GetFeature>`;

      const response = await fetch(CONFIG.WFS_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
      });

      if (!response.ok) return [];

      const json = await response.json();
      return json.features || [];
    }

    // Local vector fallback
    return layer.getSource()
      .getFeatures()
      .filter(f => extentsIntersect(extent, f.getGeometry().getExtent()));

  } catch (error) {
    console.error(`Error fetching ${layerName}:`, error);
    return [];
  }
}

export async function queryAllLayersInExtent(extent, projektNr, viewer, state) {
  const promises = CONFIG.QUERYABLE_LAYERS.map(layerName =>
    fetchIntersectingFeatures(extent, layerName, projektNr, viewer, state)
      .then(features => ({ layerName, features }))
  );

  const results = await Promise.all(promises);
  const output = {};
  results.forEach(({ layerName, features }) => {
    if (features.length) output[layerName] = features;
  });
  return output;
}

export async function fetchRelatedFeatures(layerName, featureProps, viewer) {
  const layerConfig = viewer.getLayer(layerName);
  if (!layerConfig) {
    console.warn('Layer not found for:', layerName);
    return [];
  }

  const layerValues = layerConfig.get ?
    layerConfig.getProperties() :
    layerConfig.values_ || layerConfig;

  if (!layerValues.relatedLayers) return [];

  const relatedData = [];

  for (const relatedConfig of layerValues.relatedLayers) {
    const { layerName: relatedLayerName, FK: fk, PK: pk } = relatedConfig;
    const foreignKeyValue = featureProps[pk];
    if (!foreignKeyValue) continue;

    try {
      const url = buildWfsUrl(
        `${CONFIG.WFS_WORKSPACE}:${relatedLayerName}`,
        `${fk}='${foreignKeyValue}'`
      );
      const response = await fetch(url);

      if (!response.ok) {
        console.error('WFS request failed:', response.status, response.statusText);
        continue;
      }

      const json = await response.json();
      if (json.features?.length > 0) {
        relatedData.push({ layerName: relatedLayerName, config: relatedConfig, features: json.features });
      }
    } catch (error) {
      console.error(`Error fetching related features from ${relatedLayerName}:`, error);
    }
  }

  return relatedData;
}

/**
 * Generic WFS intersect POST for any layer + geometry column.
 * Used by both the filer fetch and the draw-polygon search.
 */
export async function fetchFeaturesInPolygonWKT(wkt, typeName, geomColumn) {
  if (!wkt) return [];

  const posList = wkt
    .replace('POLYGON((', '').replace('))', '')
    .split(',')
    .map(p => {
      const [y, x] = p.trim().split(' ');
      return `${x} ${y}`;
    })
    .join(' ');

  const xml = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${typeName}" srsName="${CONFIG.WFS_SRS}">
      <ogc:Filter>
        <ogc:Intersects>
          <ogc:PropertyName>${geomColumn}</ogc:PropertyName>
          <gml:Polygon srsName="${CONFIG.WFS_SRS}">
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>${posList}</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </ogc:Intersects>
      </ogc:Filter>
    </wfs:Query>
  </wfs:GetFeature>`;

  try {
    const response = await fetch(CONFIG.WFS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml
    });
    if (!response.ok) return [];
    const json = await response.json();
    return json.features || [];
  } catch (e) {
    console.error(`fetchFeaturesInPolygonWKT error (${typeName}):`, e);
    return [];
  }
}

export async function fetchFilerForProjekt(projektNr, state) {
  try {
    const wkt = await getProjektWKT(projektNr, state);
    if (!wkt) return [];
    const typeName = `${CONFIG.WFS_WORKSPACE}:${CONFIG.FILER_LAYER}`;
    return await fetchFeaturesInPolygonWKT(wkt, typeName, 'projektomrade');
  } catch (error) {
    console.error('Error fetching filer:', error);
    return [];
  }
}

export async function fetchHandlingarForArenden(arendeFeatures) {
  if (!arendeFeatures.length) return [];

  const typeName = `${CONFIG.WFS_WORKSPACE}:${CONFIG.HANDLING_LAYER}`;
  const arendeIds = arendeFeatures.map(a => a.properties[CONFIG.ARENDE_ATTRS.id]).filter(Boolean);
  if (!arendeIds.length) return [];

  const arendeMap = new Map(
    arendeFeatures.map(a => [a.properties[CONFIG.ARENDE_ATTRS.id], a.properties])
  );

  const batchSize = 20;
  const batchPromises = [];

  for (let i = 0; i < arendeIds.length; i += batchSize) {
    const batch = arendeIds.slice(i, i + batchSize);
    const cql = batch.map(id => `${CONFIG.HANDLING_ATTRS.arendeId}='${id}'`).join(' OR ');
    batchPromises.push(
      fetch(buildWfsUrl(typeName, cql))
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );
  }

  const batchResults = await Promise.all(batchPromises);
  const allHandlingar = [];

  batchResults.forEach(json => {
    if (!json?.features?.length) return;
    json.features.forEach(f => {
      const parent = arendeMap.get(f.properties[CONFIG.HANDLING_ATTRS.arendeId]);
      allHandlingar.push({
        ...f.properties,
        arendeDiarie: parent?.[CONFIG.ARENDE_ATTRS.diarieNumber],
        arendeSkapad: parent?.[CONFIG.ARENDE_ATTRS.created],
        arendeFastighet: parent?.[CONFIG.ARENDE_ATTRS.property],
        arendeRubrik: parent?.[CONFIG.ARENDE_ATTRS.title],
        _parentProps: parent
      });
    });
  });

  return allHandlingar;
}