import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, LineString } from 'geojson';
import { buildStyle, BLUE as OX, INK } from './mapStyle';
import { cumulative, dist, inRing, pointAt, smooth, type LngLat } from './geo';
import arrondissements from '../data/arrondissements.json';
import quartiers from '../data/quartiers.json';
import parisOutline from '../data/paris-outline.json';

const PARIS_BOUNDS: [LngLat, LngLat] = [[2.224, 48.8156], [2.4697, 48.9022]];
const line = (c: LngLat[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: c } });
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export type Waypoint = { lng: number; lat: number; n: number; located: boolean };

// A paper-and-ink plan of Paris whose camera walks the snail route as the page scrolls.
export class InkMap {
  map: maplibregl.Map;
  private route: LngLat[];
  private cum: number[];
  private waypoints: Waypoint[];
  private bearing = 0;
  private walker: maplibregl.Marker;
  private pin: maplibregl.Marker;
  private card: HTMLDivElement | null = null;
  private cardImg: HTMLImageElement | null = null;
  private q = { at: [0, 0] as LngLat, name: '' };

  private constructor(map: maplibregl.Map, route: LngLat[], waypoints: Waypoint[]) {
    this.map = map;
    this.route = route;
    this.cum = cumulative(route);
    this.waypoints = waypoints;
    const el = document.createElement('div');
    el.className = 'walker';
    this.walker = new maplibregl.Marker({ element: el });
    const pin = document.createElement('div');
    pin.className = 'dest-pin';
    this.pin = new maplibregl.Marker({ element: pin });
  }

  static async create(container: HTMLElement, route: LngLat[], waypoints: Waypoint[]) {
    const map = new maplibregl.Map({
      container, style: await buildStyle(), bounds: PARIS_BOUNDS, interactive: false, maxPitch: 70,
      attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
    });
    await map.once('load');
    const outline = (parisOutline as unknown as LngLat[][][]).flat();
    map.addSource('mask', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-10, 40], [15, 40], [15, 58], [-10, 58], [-10, 40]], ...outline] } } });
    map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#efe7d6', 'fill-opacity': 0.88 } });
    map.addSource('outline', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: outline } } });
    map.addLayer({ id: 'outline', type: 'line', source: 'outline', paint: { 'line-color': INK, 'line-width': 1.4 } });
    map.addSource('arr', { type: 'geojson', data: arrondissements as unknown as FeatureCollection });
    map.addLayer({ id: 'arr', type: 'line', source: 'arr', paint: { 'line-color': '#8c7e66', 'line-width': 0.9, 'line-dasharray': [3, 2] } });
    const centers = [...arrondissements.features].sort((a, b) => a.properties.number - b.properties.number)
      .map((f) => ({ n: f.properties.number, at: [f.properties.centerLng, f.properties.centerLat] as LngLat }));
    map.addSource('snail', { type: 'geojson', data: line(smooth(centers.map((c) => c.at))) });
    map.addLayer({ id: 'snail', type: 'line', source: 'snail', maxzoom: 14.5, layout: { 'line-cap': 'round' }, paint: { 'line-color': '#c99a52', 'line-width': 1.2, 'line-opacity': 0.55, 'line-dasharray': [0.5, 3] } });
    map.addSource('arr-n', { type: 'geojson', data: { type: 'FeatureCollection', features: centers.map((c) => ({ type: 'Feature' as const, properties: { t: c.n === 1 ? '1er' : `${c.n}e` }, geometry: { type: 'Point' as const, coordinates: c.at } })) } });
    map.addLayer({
      id: 'arr-n', type: 'symbol', source: 'arr-n', maxzoom: 14,
      layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 13.5, 24] },
      paint: { 'text-color': '#a07a42', 'text-opacity': 0.75, 'text-halo-color': 'rgba(239,231,214,0.8)', 'text-halo-width': 1 },
    });
    map.addSource('quartiers', { type: 'geojson', data: quartiers as unknown as FeatureCollection });
    map.addLayer({ id: 'quartiers', type: 'line', source: 'quartiers', paint: { 'line-color': '#a99c83', 'line-width': 0.5, 'line-opacity': 0.6 } });
    map.addSource('q-labels', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: quartiers.features.map((f) => ({ type: 'Feature' as const, properties: { name: f.properties.name }, geometry: { type: 'Point' as const, coordinates: [f.properties.lng, f.properties.lat] } })) },
    });
    map.addLayer({
      id: 'q-labels', type: 'symbol', source: 'q-labels', minzoom: 13.2,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-max-width': 7 },
      paint: { 'text-color': '#6d604c', 'text-halo-color': 'rgba(239,231,214,0.9)', 'text-halo-width': 1.4 },
    });
    map.addSource('route', { type: 'geojson', data: line(route) });
    map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': OX, 'line-width': 1.6, 'line-opacity': 0.4, 'line-dasharray': [1, 2.5] } });
    map.addSource('walked', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as FeatureCollection<LineString> });
    map.addLayer({ id: 'walked', type: 'line', source: 'walked', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': OX, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.4, 16, 4.5] } });
    map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const visited: maplibregl.ExpressionSpecification = ['==', ['get', 'v'], 1];
    map.addLayer({
      id: 'stops', type: 'circle', source: 'stops',
      paint: {
        'circle-radius': ['case', ['==', ['get', 'located'], 1], 10, 7],
        'circle-color': ['case', visited, OX, '#f6efe1'],
        'circle-stroke-color': OX, 'circle-stroke-width': ['case', ['==', ['get', 'located'], 1], 1.6, 1],
      },
    });
    map.addLayer({
      id: 'stops-n', type: 'symbol', source: 'stops',
      layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': ['case', ['==', ['get', 'located'], 1], 11, 8.5], 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': ['case', visited, '#f6efe1', OX] },
    });
    const m = new InkMap(map, route, waypoints);
    m.visit(-1);
    return m;
  }

  // Waypoints up to index k are drawn as visited.
  visit(k: number) {
    (this.map.getSource('stops') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: this.waypoints.map((w) => ({ type: 'Feature', properties: { n: String(w.n), located: w.located ? 1 : 0, v: w.n - 1 <= k ? 1 : 0 }, geometry: { type: 'Point', coordinates: [w.lng, w.lat] } })),
    });
  }

  overview(walkedTo = 0) {
    this.walker.remove();
    this.pin.remove();
    this.card?.classList.remove('is-on');
    (this.map.getSource('walked') as maplibregl.GeoJSONSource).setData(walkedTo > 0 ? line([...this.route.slice(0, pointAt(this.route, this.cum, walkedTo).i + 1), pointAt(this.route, this.cum, walkedTo).here]) : { type: 'FeatureCollection', features: [] });
    const cam = this.map.cameraForBounds([[2.255, 48.8156], [2.44, 48.9022]], { padding: 24 });
    this.map.easeTo({ center: cam?.center, zoom: cam?.zoom ?? 11.5, pitch: 0, bearing: 0, duration: 1600 });
    this.bearing = 0;
  }

  // Walker at d metres along the whole snail; p is the progress of the current approach (drives the camera dive).
  walk(d: number, p: number, dest?: { img: string; at: LngLat }) {
    const { here, i } = pointAt(this.route, this.cum, d);
    const ahead = this.route[Math.min(this.route.length - 1, i + 4)];
    const k = Math.cos((here[1] * Math.PI) / 180);
    if (dist(here, ahead) > 1) {
      const heading = (Math.atan2((ahead[0] - here[0]) * k, ahead[1] - here[1]) * 180) / Math.PI;
      this.bearing += (((heading - this.bearing + 540) % 360) - 180) * 0.035;
    }
    (this.map.getSource('walked') as maplibregl.GeoJSONSource).setData(line([...this.route.slice(0, i + 1), here]));
    this.walker.setLngLat(here).addTo(this.map);
    const dive = ease(p / 0.28), arrive = ease((p - 0.74) / 0.26);
    // The destination photo is pinned to the frame, not to the street, so it stays still while the camera turns.
    if (dest) {
      if (!this.card) {
        this.card = document.createElement('div');
        this.card.className = 'postcard';
        this.cardImg = document.createElement('img');
        this.cardImg.alt = '';
        this.card.appendChild(this.cardImg);
        this.map.getContainer().appendChild(this.card);
      }
      if (this.cardImg && !this.cardImg.src.endsWith(dest.img)) this.cardImg.src = dest.img;
      this.pin.setLngLat(dest.at).addTo(this.map);
      this.card.classList.toggle('is-on', p > 0.55);
      this.card.style.setProperty('--arrive', String(arrive));
    }
    this.map.jumpTo({ center: here, zoom: 13.4 + dive * 2.9 + arrive * 1.0, pitch: 15 + dive * 50 + arrive * 5, bearing: this.bearing * dive, padding: { left: 0, right: 0, top: 0, bottom: 0 } });
    if (dist(here, this.q.at) > 40) {
      const f = quartiers.features.find((f) => {
        const g = f.geometry as { type: string; coordinates: unknown };
        const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as LngLat[][][];
        return polys.some((poly) => inRing(here, poly[0]));
      });
      this.q = { at: here, name: f?.properties.name ?? '' };
    }
    return this.q.name;
  }
}
