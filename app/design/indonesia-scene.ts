// Client-only 3D view of the local Indonesia seed. The page loads this module
// with a dynamic import, so prerendering never touches WebGL or three.js.
// World units are degrees: x = longitude, -z = latitude, y = height.
import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";

import {
  DETAIL_DEGREES,
  PREVIEW_BASE,
  decodeDetail,
  detailGrid,
  heightAt,
  type DemPreviewMeta,
  type Detections,
  type PreviewFeatures,
  type RasterGrid,
} from "./indonesia-data";
import { SEED_PAINT, type SeedLayers, paintTerrain } from "./indonesia-paint";

export type SeedViewMode = "2d" | "3d";
export type DetailState = "tidak-aktif" | "memuat" | "siap" | "galat";

export interface SeedSceneView {
  mode: SeedViewMode;
  exaggeration: number;
  layers: SeedLayers;
  selection: Uint32Array;
}

export interface SeedPointer {
  longitude: number;
  latitude: number;
  elevation: number | null;
  detection: number | null;
}

export interface SeedSceneCallbacks {
  /**
   * Heading in degrees clockwise from north, kilometres per CSS pixel at the
   * view centre, and the relief exaggeration in use at this zoom.
   */
  onCamera(heading: number, kmPerPixel: number, relief: number): void;
  onPointer(reading: SeedPointer | null): void;
  onDetail(state: DetailState): void;
}

export interface SeedScene {
  update(view: SeedSceneView): void;
  resetView(): void;
  dispose(): void;
}

export interface SeedSceneData {
  meta: DemPreviewMeta;
  heights: Int16Array;
  detections: Detections | null;
  landcover: Uint8Array | null;
  features: PreviewFeatures | null;
  /** True when the development server can make detail patches. */
  detail: boolean;
}

const METRES_PER_DEGREE = 111_320;
const KM_PER_DEGREE = 111.32;
const BASE_DEPTH = 0.45; // degrees below sea level, for the diorama sides
const POINT_LIFT = 0.012;
const DETAIL_SHOW = 4.5; // load a detail patch when the view is narrower, in degrees
const DETAIL_HIDE = 7;
// The selected relief applies to the national view. It falls in step with the
// view width, to 1.5x at a local view, so close terrain keeps real proportions.
const RELIEF_FULL_WIDTH = 30;
const RELIEF_MINIMUM = 1.5;
const ISLANDS: [string, number, number][] = [
  ["Sumatra", 101.6, -0.2],
  ["Kalimantan", 113.6, -0.6],
  ["Jawa", 110.4, -7.25],
  ["Sulawesi", 120.15, -1.9],
  ["Papua", 138.6, -4.2],
];

function circleSprite() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = SEED_PAINT.detectStroke;
    ctx.beginPath();
    ctx.arc(16, 16, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(16, 16, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A canvas texture, scaled down when the GPU cannot hold it at full size. */
function canvasTexture(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement) {
  const limit = renderer.capabilities.maxTextureSize;
  let source = canvas;
  if (canvas.width > limit || canvas.height > limit) {
    const ratio = Math.min(limit / canvas.width, limit / canvas.height);
    source = document.createElement("canvas");
    source.width = Math.floor(canvas.width * ratio);
    source.height = Math.floor(canvas.height * ratio);
    source.getContext("2d")?.drawImage(canvas, 0, 0, source.width, source.height);
  }
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/** Grid mesh vertices for every `step`-th cell centre, with UVs over the whole grid. */
function gridMesh(
  grid: RasterGrid,
  values: Int16Array,
  step: number,
  toX: (longitude: number) => number,
  toZ: (latitude: number) => number,
) {
  const columns = Math.floor((grid.width - 1) / step) + 1;
  const rows = Math.floor((grid.height - 1) / step) + 1;
  const heights = new Float32Array(columns * rows);
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const x = column * step;
      const y = row * step;
      const value = values[y * grid.width + x];
      heights[index] = value === grid.nodata || value < 0 ? 0 : value;
      positions[index * 3] = toX(grid.west + (x + 0.5) * grid.cell);
      positions[index * 3 + 2] = toZ(grid.north - (y + 0.5) * grid.cell);
      uvs[index * 2] = (x + 0.5) / grid.width;
      uvs[index * 2 + 1] = 1 - (y + 0.5) / grid.height;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return { geometry, heights, positions, columns, rows };
}

/** Triangle indices for a grid mesh, without the quads that `skip` returns true for. */
function gridIndex(columns: number, rows: number, skip?: (column: number, row: number) => boolean) {
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let n = 0;
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      if (skip?.(column, row)) continue;
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], n);
      n += 6;
    }
  }
  return new THREE.BufferAttribute(indices.slice(0, n), 1);
}

interface Patch {
  key: string;
  grid: RasterGrid;
  heights: Int16Array;
  landcover: Uint8Array;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  vertexHeights: Float32Array;
  positions: Float32Array;
}

interface Label {
  element: HTMLElement;
  longitude: number;
  latitude: number;
  width: number;
}

export function createSeedScene(
  host: HTMLElement,
  labelHost: HTMLElement,
  data: SeedSceneData,
  initial: SeedSceneView,
  callbacks: SeedSceneCallbacks,
): SeedScene {
  const { meta, heights: grid, detections } = data;
  const extras = { landcover: data.landcover, features: data.features };
  const worldWidth = meta.width * meta.cell;
  const worldDepth = meta.height * meta.cell;
  const centreLongitude = meta.west + worldWidth / 2;
  const centreLatitude = meta.north - worldDepth / 2;
  const toX = (longitude: number) => longitude - centreLongitude;
  const toZ = (latitude: number) => centreLatitude - latitude;
  let patch: Patch | null = null;
  const inPatch = (longitude: number, latitude: number) =>
    !!patch?.mesh.visible &&
    longitude >= patch.grid.west &&
    longitude <= patch.grid.west + DETAIL_DEGREES &&
    latitude <= patch.grid.north &&
    latitude >= patch.grid.north - DETAIL_DEGREES;
  const elevation = (longitude: number, latitude: number) =>
    patch && inPatch(longitude, latitude)
      ? heightAt(patch.grid, patch.heights, longitude, latitude)
      : heightAt(meta, grid, longitude, latitude);
  const ground = (longitude: number, latitude: number) =>
    Math.max(0, elevation(longitude, latitude) ?? 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "map3d-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.insertBefore(renderer.domElement, host.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 600);
  // Map behaviour, as in web maps: drag to pan along the ground, scroll to zoom
  // towards the pointer, right-drag or Ctrl/Shift-drag to rotate and tilt.
  // On touch screens, one finger pans and two fingers zoom and rotate.
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.15;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;

  // National terrain mesh with about 700 vertices across.
  const step = Math.max(1, Math.round(meta.width / 700));
  const { geometry, heights, positions, columns, rows } = gridMesh(meta, grid, step, toX, toZ);
  geometry.setIndex(gridIndex(columns, rows));
  const paintNational = (layers: SeedLayers) => {
    const canvas = document.createElement("canvas");
    paintTerrain(canvas, meta, grid, layers, extras);
    return canvasTexture(renderer, canvas);
  };
  let texture = paintNational(initial.layers);
  const terrainMaterial = new THREE.MeshBasicMaterial({ map: texture });
  const terrain = new THREE.Mesh(geometry, terrainMaterial);
  scene.add(terrain);

  // Diorama sides along the four edges.
  const edge: number[] = [];
  for (let column = 0; column < columns; column++) edge.push(column);
  for (let row = 1; row < rows; row++) edge.push(row * columns + columns - 1);
  for (let column = columns - 2; column >= 0; column--) edge.push((rows - 1) * columns + column);
  for (let row = rows - 2; row > 0; row--) edge.push(row * columns);
  edge.push(0);
  const skirtPositions = new Float32Array(edge.length * 2 * 3);
  const skirtColors = new Float32Array(edge.length * 2 * 3);
  const skirtIndices: number[] = [];
  const top = new THREE.Color(0x6f8f98);
  const bottom = new THREE.Color(0x2c3a3f);
  edge.forEach((vertex, i) => {
    skirtPositions.set([positions[vertex * 3], 0, positions[vertex * 3 + 2]], i * 6);
    skirtPositions.set([positions[vertex * 3], 0, positions[vertex * 3 + 2]], i * 6 + 3);
    skirtColors.set([top.r, top.g, top.b, bottom.r, bottom.g, bottom.b], i * 6);
    if (i < edge.length - 1)
      skirtIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute("position", new THREE.BufferAttribute(skirtPositions, 3));
  skirtGeometry.setAttribute("color", new THREE.BufferAttribute(skirtColors, 3));
  skirtGeometry.setIndex(skirtIndices);
  const skirt = new THREE.Mesh(
    skirtGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  scene.add(skirt);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldDepth),
    new THREE.MeshBasicMaterial({ color: 0x26201a, transparent: true, opacity: 0.25 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // Detections as screen-sized points, drawn low to high confidence.
  const total = detections?.count ?? 0;
  const pointPositions = new Float32Array(Math.max(1, total) * 3);
  const pointColors = new Float32Array(Math.max(1, total) * 3);
  const drawn = new Uint32Array(Math.max(1, total));
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(pointColors, 3));
  pointGeometry.setDrawRange(0, 0);
  const sprite = circleSprite();
  const pointMaterial = new THREE.PointsMaterial({
    size: 6,
    sizeAttenuation: false,
    vertexColors: true,
    map: sprite,
    alphaTest: 0.5,
  });
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  scene.add(points);
  const colours = SEED_PAINT.detect.map((value) => new THREE.Color(value));
  let drawnCount = 0;

  let scale = 0; // world height per metre, times the exaggeration
  const placePoints = () => {
    if (!detections) return;
    for (let k = 0; k < drawnCount; k++) {
      const i = drawn[k];
      pointPositions[k * 3 + 1] =
        ground(detections.longitude[i], detections.latitude[i]) * scale + POINT_LIFT;
    }
    pointGeometry.attributes.position.needsUpdate = true;
  };
  const selectPoints = (selection: Uint32Array, visible: boolean) => {
    drawnCount = 0;
    if (detections && visible) {
      for (let level = 0; level < 3; level++) {
        const colour = colours[level];
        for (const i of selection) {
          if (detections.confidence[i] !== level) continue;
          drawn[drawnCount] = i;
          pointPositions[drawnCount * 3] = toX(detections.longitude[i]);
          pointPositions[drawnCount * 3 + 2] = toZ(detections.latitude[i]);
          pointColors.set([colour.r, colour.g, colour.b], drawnCount * 3);
          drawnCount++;
        }
      }
    }
    pointGeometry.setDrawRange(0, drawnCount);
    pointGeometry.attributes.color.needsUpdate = true;
    placePoints();
  };

  const applyPatchHeights = () => {
    if (!patch) return;
    for (let i = 0; i < patch.vertexHeights.length; i++) {
      patch.positions[i * 3 + 1] = patch.vertexHeights[i] * scale + 0.0006;
    }
    patch.mesh.geometry.attributes.position.needsUpdate = true;
    patch.mesh.geometry.computeBoundingSphere();
  };
  const applyHeights = (exaggeration: number) => {
    scale = exaggeration / METRES_PER_DEGREE;
    const floor = -BASE_DEPTH;
    for (let i = 0; i < heights.length; i++) positions[i * 3 + 1] = heights[i] * scale;
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
    edge.forEach((vertex, i) => {
      skirtPositions[i * 6 + 1] = heights[vertex] * scale;
      skirtPositions[i * 6 + 4] = floor;
    });
    skirtGeometry.attributes.position.needsUpdate = true;
    skirtGeometry.computeBoundingSphere();
    shadow.position.set(0.6, floor - 0.004, 0.6);
    applyPatchHeights();
    placePoints();
  };

  // HTML labels: the five largest islands, then Natural Earth places by rank.
  const label = (className: string, name: string, longitude: number, latitude: number): Label => {
    const element = document.createElement("div");
    element.className = `map3d-label ${className}`;
    element.textContent = name;
    labelHost.appendChild(element);
    return { element, longitude, latitude, width: name.length * 6.5 + 14 };
  };
  const islands = ISLANDS.map(([name, longitude, latitude]) =>
    label("is-place", name, longitude, latitude),
  );
  const places = (data.features?.places ?? []).map((place) =>
    label(
      `is-town${place.capital ? " is-capital" : ""}`,
      place.name,
      place.longitude,
      place.latitude,
    ),
  );

  let view = initial;
  let dirty = true;
  let labelsDirty = true;
  const projected = new THREE.Vector3();
  const unitsPerPixel = () => {
    const distance = camera.position.distanceTo(controls.target);
    return (
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
      Math.max(1, host.clientHeight)
    );
  };
  const viewWidth = () => unitsPerPixel() * host.clientWidth;
  const projectLabels = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const boxes: [number, number, number, number][] = [];
    const show = (item: Label, allowed: boolean) => {
      if (!allowed) {
        item.element.hidden = true;
        return;
      }
      projected
        .set(
          toX(item.longitude),
          ground(item.longitude, item.latitude) * scale + 0.01,
          toZ(item.latitude),
        )
        .project(camera);
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      const box: [number, number, number, number] = [
        x - item.width / 2,
        y - 18,
        x + item.width / 2,
        y,
      ];
      const overlaps = boxes.some(
        (b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1],
      );
      const visible =
        projected.z < 1 &&
        Math.abs(projected.x) < 1.02 &&
        Math.abs(projected.y) < 1.02 &&
        !overlaps;
      item.element.hidden = !visible;
      if (!visible) return;
      boxes.push(box);
      item.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    const span = viewWidth();
    for (const item of islands) show(item, span > 3);
    // More places appear as the view narrows. Overlapping labels are hidden.
    const count = view.layers.places
      ? Math.round(Math.min(places.length, Math.max(6, 700 / span)))
      : 0;
    places.forEach((item, i) => show(item, i < count));
  };

  // Camera presets fit the whole grid to the stage.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tween: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    start: number;
  } | null = null;
  const fitDistance = () => {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    return (
      Math.max(worldWidth / 2 / Math.tan(horizontal), worldDepth / 2 / Math.tan(vertical)) * 1.04
    );
  };
  let relief = 0;
  const targetRelief = () =>
    view.mode === "3d"
      ? Math.max(
          Math.min(RELIEF_MINIMUM, view.exaggeration),
          view.exaggeration * Math.min(1, viewWidth() / RELIEF_FULL_WIDTH),
        )
      : 0;
  const updateRelief = (force = false) => {
    const next = targetRelief();
    if (force || Math.abs(next - relief) > Math.max(0.05, relief * 0.08)) {
      relief = next;
      applyHeights(relief);
    }
  };
  const reportCamera = () => {
    const heading = (-THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) + 360) % 360;
    updateRelief();
    callbacks.onCamera(heading, unitsPerPixel() * KM_PER_DEGREE, relief);
    // Points grow when the view moves closer, so dense areas separate.
    const distance = camera.position.distanceTo(controls.target);
    pointMaterial.size = Math.min(7, Math.max(2.5, 2.5 * Math.sqrt(fitDistance() / distance)));
  };
  // Fit the four map corners to the stage, then centre them vertically. A
  // copy of the camera does the trial projections.
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => new THREE.Vector3((sx * worldWidth) / 2, 0, (sz * worldDepth) / 2)),
  );
  const preset = (mode: SeedViewMode) => {
    const probe = camera.clone();
    const tilt = THREE.MathUtils.degToRad(mode === "3d" ? 63 : 89.99);
    const direction = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const target = new THREE.Vector3(0, 0, 0);
    const point = new THREE.Vector3();
    const bounds = (distance: number) => {
      probe.position.copy(target).addScaledVector(direction, distance);
      probe.lookAt(target);
      probe.updateMatrixWorld();
      let low = Infinity;
      let high = -Infinity;
      let fits = true;
      for (const corner of corners) {
        point.copy(corner).project(probe);
        low = Math.min(low, point.y);
        high = Math.max(high, point.y);
        if (Math.abs(point.x) > 1.01 || Math.abs(point.y) > 0.86 || point.z >= 1) fits = false;
      }
      return { fits, centre: (low + high) / 2 };
    };
    let distance = fitDistance();
    for (let pass = 0; pass < 6; pass++) {
      let near = 0.5;
      let far = fitDistance() * 3;
      for (let i = 0; i < 24; i++) {
        const middle = (near + far) / 2;
        if (bounds(middle).fits) far = middle;
        else near = middle;
      }
      distance = far;
      const { centre } = bounds(distance);
      if (Math.abs(centre) < 0.01) break;
      target.z -= centre * worldDepth * 0.35;
    }
    return { target, position: target.clone().addScaledVector(direction, distance) };
  };
  const moveCamera = (mode: SeedViewMode, animate: boolean) => {
    const { position, target } = preset(mode);
    controls.maxDistance = fitDistance() * 2.5;
    if (!animate || reducedMotion) {
      camera.position.copy(position);
      controls.target.copy(target);
      tween = null;
    } else {
      tween = {
        from: camera.position.clone(),
        to: position,
        fromTarget: controls.target.clone(),
        toTarget: target,
        start: performance.now(),
      };
    }
    controls.update();
    dirty = labelsDirty = true;
  };
  const applyMode = (mode: SeedViewMode) => {
    controls.enableRotate = mode === "3d";
    controls.maxPolarAngle = mode === "3d" ? 1.3 : 0.001;
  };

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(0xe6e1d6, fitDistance() * 1.4, fitDistance() * 3.2);
    dirty = labelsDirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  selectPoints(initial.selection, initial.layers.detections);
  applyMode(initial.mode);
  moveCamera(initial.mode, false);
  updateRelief(true);

  // Detail patches: when the view is narrow, load DETAIL_DEGREES x DETAIL_DEGREES
  // of finer heights and land cover around the view centre, and hide the
  // national mesh under it.
  let request: AbortController | null = null;
  let requested = "";
  let detailState: DetailState = "tidak-aktif";
  const setDetail = (state: DetailState) => {
    if (state === detailState) return;
    detailState = state;
    callbacks.onDetail(state);
  };
  const showPatch = (visible: boolean) => {
    if (!patch || patch.mesh.visible === visible) return;
    patch.mesh.visible = visible;
    const area = patch.grid;
    geometry.setIndex(
      visible
        ? gridIndex(columns, rows, (column, row) => {
            const west = meta.west + (column * step + 0.5) * meta.cell;
            const east = meta.west + ((column + 1) * step + 0.5) * meta.cell;
            const north = meta.north - (row * step + 0.5) * meta.cell;
            const south = meta.north - ((row + 1) * step + 0.5) * meta.cell;
            return (
              west >= area.west &&
              east <= area.west + DETAIL_DEGREES &&
              north <= area.north &&
              south >= area.north - DETAIL_DEGREES
            );
          })
        : gridIndex(columns, rows),
    );
    placePoints();
    dirty = labelsDirty = true;
  };
  const disposePatch = () => {
    if (!patch) return;
    showPatch(false);
    scene.remove(patch.mesh);
    patch.mesh.geometry.dispose();
    patch.mesh.material.dispose();
    patch.texture.dispose();
    patch = null;
  };
  const loadPatch = async (west: number, north: number, key: string) => {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    requested = key;
    setDetail("memuat");
    try {
      const response = await fetch(`${PREVIEW_BASE}/detail.bin?west=${west}&north=${north}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { heights: patchHeights, landcover } = decodeDetail(await response.arrayBuffer());
      if (controller.signal.aborted) return;
      const area = detailGrid(west, north);
      const mesh = gridMesh(area, patchHeights, 2, toX, toZ);
      mesh.geometry.setIndex(gridIndex(mesh.columns, mesh.rows));
      const patchCanvas = document.createElement("canvas");
      paintTerrain(patchCanvas, area, patchHeights, view.layers, {
        landcover,
        features: data.features,
      });
      const patchTexture = canvasTexture(renderer, patchCanvas);
      const material = new THREE.MeshBasicMaterial({
        map: patchTexture,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -8,
      });
      disposePatch();
      const object = new THREE.Mesh(mesh.geometry, material);
      object.visible = false;
      scene.add(object);
      patch = {
        key,
        grid: area,
        heights: patchHeights,
        landcover,
        canvas: patchCanvas,
        texture: patchTexture,
        mesh: object,
        vertexHeights: mesh.heights,
        positions: mesh.positions,
      };
      applyPatchHeights();
      showPatch(true);
      setDetail("siap");
    } catch {
      if (!controller.signal.aborted) {
        requested = "";
        setDetail("galat");
      }
    }
  };
  let detailTimer = 0;
  const checkDetail = () => {
    if (!data.detail) return;
    const span = viewWidth();
    if (span > DETAIL_HIDE) {
      request?.abort();
      requested = "";
      showPatch(false);
      setDetail("tidak-aktif");
      return;
    }
    if (span > DETAIL_SHOW && !patch?.mesh.visible) return;
    const longitude = controls.target.x + centreLongitude;
    const latitude = centreLatitude - controls.target.z;
    const west = Math.min(
      Math.floor(meta.west + worldWidth) - DETAIL_DEGREES,
      Math.max(Math.ceil(meta.west), Math.round(longitude) - DETAIL_DEGREES / 2),
    );
    const north = Math.max(
      Math.ceil(meta.north - worldDepth) + DETAIL_DEGREES,
      Math.min(Math.floor(meta.north), Math.round(latitude) + DETAIL_DEGREES / 2),
    );
    const key = `${west},${north}`;
    if (patch?.key === key) {
      showPatch(true);
      setDetail("siap");
    } else if (requested !== key) {
      void loadPatch(west, north, key);
    }
  };
  controls.addEventListener("change", () => {
    // Keep the view centre on the map.
    const { target } = controls;
    target.x = Math.max(-worldWidth / 2, Math.min(worldWidth / 2, target.x));
    target.z = Math.max(-worldDepth / 2, Math.min(worldDepth / 2, target.z));
    target.y = 0;
    dirty = labelsDirty = true;
    window.clearTimeout(detailTimer);
    detailTimer = window.setTimeout(checkDetail, 300);
  });

  // Pointer reading: the nearest drawn detection within 6 px, and the ground under the ray.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerFrame = 0;
  const groundUnderRay = () => {
    const { origin, direction } = raycaster.ray;
    const probe = new THREE.Vector3();
    const stride = Math.max(0.002, unitsPerPixel() * 2);
    let previous = 0;
    for (let t = 0; t < camera.far; t += stride) {
      probe.copy(origin).addScaledVector(direction, t);
      const longitude = probe.x + centreLongitude;
      const latitude = centreLatitude - probe.z;
      if (probe.y <= ground(longitude, latitude) * scale + 1e-5) {
        let low = previous;
        let high = t;
        for (let i = 0; i < 12; i++) {
          const middle = (low + high) / 2;
          probe.copy(origin).addScaledVector(direction, middle);
          if (probe.y <= ground(probe.x + centreLongitude, centreLatitude - probe.z) * scale)
            high = middle;
          else low = middle;
        }
        probe.copy(origin).addScaledVector(direction, high);
        return { longitude: probe.x + centreLongitude, latitude: centreLatitude - probe.z };
      }
      previous = t;
    }
    return null;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      let detection: number | null = null;
      if (drawnCount) {
        raycaster.params.Points = { threshold: unitsPerPixel() * 6 };
        let best = Infinity;
        for (const hit of raycaster.intersectObject(points)) {
          if (hit.index !== undefined && (hit.distanceToRay ?? Infinity) < best) {
            best = hit.distanceToRay ?? Infinity;
            detection = drawn[hit.index];
          }
        }
      }
      const spot = groundUnderRay();
      const longitude =
        detection !== null && detections ? detections.longitude[detection] : spot?.longitude;
      const latitude =
        detection !== null && detections ? detections.latitude[detection] : spot?.latitude;
      if (longitude === undefined || latitude === undefined) {
        callbacks.onPointer(null);
        return;
      }
      const inGrid =
        longitude >= meta.west &&
        longitude <= meta.west + worldWidth &&
        latitude <= meta.north &&
        latitude >= meta.north - worldDepth;
      callbacks.onPointer(
        inGrid
          ? { longitude, latitude, elevation: elevation(longitude, latitude), detection }
          : null,
      );
    });
  };
  const onPointerLeave = () => callbacks.onPointer(null);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);

  let frame = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / 700);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      dirty = labelsDirty = true;
      if (t === 1) tween = null;
    }
    if (controls.update()) dirty = labelsDirty = true;
    if (!dirty) return;
    renderer.render(scene, camera);
    if (labelsDirty) {
      projectLabels();
      reportCamera();
      labelsDirty = false;
    }
    dirty = false;
  };
  frame = requestAnimationFrame(loop);

  return {
    update(next) {
      const previous = view;
      view = next;
      const repaint = (["landcover", "terrain", "shade", "water", "outline"] as const).some(
        (key) => next.layers[key] !== previous.layers[key],
      );
      if (repaint) {
        const replaced = paintNational(next.layers);
        terrainMaterial.map = replaced;
        texture.dispose();
        texture = replaced;
        if (patch) {
          paintTerrain(patch.canvas, patch.grid, patch.heights, next.layers, {
            landcover: patch.landcover,
            features: data.features,
          });
          const patchTexture = canvasTexture(renderer, patch.canvas);
          patch.mesh.material.map = patchTexture;
          patch.texture.dispose();
          patch.texture = patchTexture;
        }
      }
      if (
        next.selection !== previous.selection ||
        next.layers.detections !== previous.layers.detections
      ) {
        selectPoints(next.selection, next.layers.detections);
      }
      if (next.mode !== previous.mode) {
        applyMode(next.mode);
        moveCamera(next.mode, true);
        updateRelief(true);
      } else if (next.exaggeration !== previous.exaggeration) {
        updateRelief(true);
      }
      labelsDirty = dirty = true;
    },
    resetView() {
      moveCamera(view.mode, true);
    },
    dispose() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pointerFrame);
      window.clearTimeout(detailTimer);
      request?.abort();
      disposePatch();
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      for (const item of [...islands, ...places]) item.element.remove();
      for (const item of [geometry, skirtGeometry, shadow.geometry, pointGeometry]) item.dispose();
      for (const mesh of [terrain, skirt, shadow]) (mesh.material as THREE.Material).dispose();
      pointMaterial.dispose();
      sprite.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
