// Client-only 3D view of the synthetic incident. The page loads this module with a
// dynamic import, so prerendering never touches WebGL or three.js.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { formatWib } from "./fixture";
import { createPainter, type LayerSettings } from "./incident-paint";
import {
  IGNITION_AT,
  IGNITION_POINT,
  PATH_MARKS,
  PLACES,
  WORLD_DEPTH,
  WORLD_WIDTH,
  headPoint,
  heightGrid,
  incidentEvents,
  sampleHeight,
  type EventKind,
  type Point,
} from "./scenario";

export type ViewMode = "2d" | "3d";

export interface SceneView {
  time: number;
  layers: LayerSettings;
  mode: ViewMode;
  exaggeration: number;
}

export interface SceneCallbacks {
  /** Heading in degrees clockwise from north, and kilometres per CSS pixel at the view centre. */
  onCamera(heading: number, kmPerPixel: number): void;
  onPointer(reading: { x: number; y: number; elevation: number } | null): void;
}

export interface IncidentScene {
  update(view: SceneView): void;
  resetView(): void;
  dispose(): void;
}

const MESH_STEP = 2; // use every second height sample: 62.5 m between vertices
const BASE_DEPTH = 0.18; // km below the lowest point, for the diorama sides
const wib = (time: number) => formatWib(new Date(time).toISOString()).replace(" WIB", "");

interface Label {
  element: HTMLElement;
  point: Point;
  lift: number;
  visible: (view: SceneView) => boolean;
}

const EVENT_LAYER: Partial<Record<EventKind, keyof LayerSettings>> = {
  growth: "spread",
  spot: "spread",
  ridge: "spread",
  water: "suppression",
  firebreak: "suppression",
};

export function createIncidentScene(
  host: HTMLElement,
  labelHost: HTMLElement,
  initial: SceneView,
  callbacks: SceneCallbacks,
): IncidentScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "map3d-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.insertBefore(renderer.domElement, host.firstChild);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe6e1d6, 16, 46);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 2.5;
  controls.maxDistance = 34;
  controls.maxPolarAngle = 1.38;
  controls.screenSpacePanning = false;

  // Terrain mesh and the painted texture.
  const grid = heightGrid();
  const columns = Math.floor((grid.columns - 1) / MESH_STEP) + 1;
  const rows = Math.floor((grid.rows - 1) / MESH_STEP) + 1;
  const heights = new Float32Array(columns * rows);
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const x = column * MESH_STEP * grid.spacing;
      const y = row * MESH_STEP * grid.spacing;
      heights[index] = grid.values[row * MESH_STEP * grid.columns + column * MESH_STEP];
      positions[index * 3] = x - WORLD_WIDTH / 2;
      positions[index * 3 + 2] = WORLD_DEPTH / 2 - y;
      uvs[index * 2] = x / WORLD_WIDTH;
      uvs[index * 2 + 1] = y / WORLD_DEPTH;
    }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++)
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const painter = createPainter();
  const texture = new THREE.CanvasTexture(painter.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const terrain = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
  scene.add(terrain);

  // Diorama sides along the four edges, in the paper-and-ink style.
  const edge: number[] = [];
  for (let column = 0; column < columns; column++) edge.push(column);
  for (let row = 1; row < rows; row++) edge.push(row * columns + columns - 1);
  for (let column = columns - 2; column >= 0; column--) edge.push((rows - 1) * columns + column);
  for (let row = rows - 2; row > 0; row--) edge.push(row * columns);
  edge.push(0);
  const skirtPositions = new Float32Array(edge.length * 2 * 3);
  const skirtColors = new Float32Array(edge.length * 2 * 3);
  const skirtIndices: number[] = [];
  const top = new THREE.Color(0x8a6a48);
  const bottom = new THREE.Color(0x3b2b1d);
  edge.forEach((vertex, i) => {
    skirtPositions.set([positions[vertex * 3], 0, positions[vertex * 3 + 2]], i * 6);
    skirtPositions.set([positions[vertex * 3], 0, positions[vertex * 3 + 2]], i * 6 + 3);
    skirtColors.set([top.r, top.g, top.b, bottom.r, bottom.g, bottom.b], i * 6);
    if (i < edge.length - 1) skirtIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
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
    new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH),
    new THREE.MeshBasicMaterial({ color: 0x26201a, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  let scale = 0; // km of map height per metre of terrain, times the exaggeration
  const applyHeights = (exaggeration: number) => {
    scale = exaggeration / 1000;
    const floor = (grid.min * scale) - BASE_DEPTH;
    for (let i = 0; i < heights.length; i++) positions[i * 3 + 1] = heights[i] * scale;
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();
    edge.forEach((vertex, i) => {
      skirtPositions[i * 6 + 1] = heights[vertex] * scale;
      skirtPositions[i * 6 + 4] = floor;
    });
    skirtGeometry.attributes.position.needsUpdate = true;
    skirtGeometry.computeBoundingSphere();
    shadow.position.set(0.35, floor - 0.002, 0.35);
  };

  const worldPoint = (point: Point, lift = 0) =>
    new THREE.Vector3(
      point.x - WORLD_WIDTH / 2,
      sampleHeight(grid, point.x, point.y) * scale + lift,
      WORLD_DEPTH / 2 - point.y,
    );

  // HTML labels projected from map points.
  const labels: Label[] = [];
  const addLabel = (
    className: string,
    html: string,
    point: Point,
    visible: Label["visible"] = () => true,
    lift = 0.04,
  ) => {
    const element = document.createElement("div");
    element.className = `map3d-label ${className}`;
    element.innerHTML = html;
    labelHost.appendChild(element);
    const label = { element, point, lift, visible };
    labels.push(label);
    return label;
  };
  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  for (const place of PLACES) {
    const elevation = Math.round(sampleHeight(grid, place.point.x, place.point.y));
    if (place.kind === "peak")
      addLabel("is-peak", `<span aria-hidden="true">▲</span> ${escape(place.name)}<small>${elevation} m</small>`, place.point);
    else if (place.kind === "water") addLabel("is-water", escape(place.name), place.point);
    else addLabel("is-place", escape(place.name), place.point);
  }
  const fireVisible = (view: SceneView) => view.layers.spread.visible;
  for (const mark of PATH_MARKS) {
    const label = addLabel(
      "is-mark",
      `<span class="map3d-ring" aria-hidden="true"></span><span class="map3d-chip">${wib(mark)}</span>`,
      headPoint(mark),
      (view) => fireVisible(view) && view.time >= IGNITION_AT,
    );
    label.element.dataset.time = String(mark);
  }
  addLabel(
    "is-ignition",
    `<span class="map3d-dot" aria-hidden="true"></span><span class="map3d-chip">Titik awal (perkiraan)<small>${wib(IGNITION_AT)}</small></span>`,
    IGNITION_POINT,
    (view) => view.layers.spread.visible || view.layers.ignition.visible,
  );
  for (const event of incidentEvents()) {
    const layer = EVENT_LAYER[event.kind];
    if (!event.point || !layer) continue;
    addLabel(
      `is-event is-event-${event.kind}`,
      `<span class="map3d-chip">${escape(event.title)}</span>`,
      event.point,
      (view) => view.layers[layer].visible && view.time >= event.at,
      0.08,
    );
  }
  const headLabel = addLabel(
    "is-head",
    `<span class="map3d-chip"></span>`,
    IGNITION_POINT,
    (view) => fireVisible(view) && view.time > IGNITION_AT,
    0.06,
  );

  let view = initial;
  let dirty = true;
  let labelsDirty = true;
  let paintPending = true;
  let lastPaint = 0;
  const projected = new THREE.Vector3();

  const projectLabels = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    for (const label of labels) {
      if (!label.visible(view)) {
        label.element.hidden = true;
        continue;
      }
      projected.copy(worldPoint(label.point, label.lift)).project(camera);
      const inside = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      label.element.hidden = !inside;
      if (!inside) continue;
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      label.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  };

  const reportCamera = () => {
    const heading = (-THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) + 360) % 360;
    const distance = camera.position.distanceTo(controls.target);
    const visible = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    callbacks.onCamera(heading, visible / Math.max(1, host.clientHeight));
  };

  // Camera presets and transitions.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tween: { from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number } | null = null;
  const preset = (mode: ViewMode) => {
    const target = worldPoint({ x: 9.0, y: 6.4 });
    target.y = mode === "3d" ? target.y * 0.6 : 0;
    // Move back on narrow screens so the whole burnt area stays in view.
    const fit = Math.min(1.8, Math.max(1, 1.1 / camera.aspect));
    const position =
      mode === "3d"
        ? new THREE.Vector3(target.x - 2.2 * fit, target.y + 7.4 * fit, target.z + 10.2 * fit)
        : new THREE.Vector3(target.x, 17.5 * fit, target.z + 0.001);
    return { position, target };
  };
  const moveCamera = (mode: ViewMode, animate: boolean) => {
    const { position, target } = preset(mode);
    if (!animate || reducedMotion) {
      camera.position.copy(position);
      controls.target.copy(target);
      tween = null;
    } else
      tween = {
        from: camera.position.clone(),
        to: position,
        fromTarget: controls.target.clone(),
        toTarget: target,
        start: performance.now(),
      };
    controls.update();
    dirty = labelsDirty = true;
  };

  const applyMode = (mode: ViewMode) => {
    controls.enableRotate = mode === "3d";
    controls.screenSpacePanning = mode === "2d";
    controls.maxPolarAngle = mode === "3d" ? 1.38 : 0.001;
  };

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dirty = labelsDirty = true;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  applyHeights(initial.mode === "3d" ? initial.exaggeration : 0);
  applyMode(initial.mode);
  moveCamera(initial.mode, false);

  controls.addEventListener("change", () => {
    dirty = labelsDirty = true;
  });

  // Pointer reading: march the view ray until it meets the height field.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerFrame = 0;
  const onPointerMove = (event: PointerEvent) => {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const { origin, direction } = raycaster.ray;
      const probe = new THREE.Vector3();
      let previous = 0;
      for (let t = 0; t < 80; t += 0.03) {
        probe.copy(origin).addScaledVector(direction, t);
        const x = probe.x + WORLD_WIDTH / 2;
        const y = WORLD_DEPTH / 2 - probe.z;
        if (x < 0 || y < 0 || x > WORLD_WIDTH || y > WORLD_DEPTH) {
          previous = t;
          continue;
        }
        if (probe.y <= sampleHeight(grid, x, y) * scale + 1e-4) {
          let low = previous;
          let high = t;
          for (let i = 0; i < 10; i++) {
            const middle = (low + high) / 2;
            probe.copy(origin).addScaledVector(direction, middle);
            const ground = sampleHeight(grid, probe.x + WORLD_WIDTH / 2, WORLD_DEPTH / 2 - probe.z) * scale;
            if (probe.y <= ground) high = middle;
            else low = middle;
          }
          probe.copy(origin).addScaledVector(direction, high);
          const mapX = probe.x + WORLD_WIDTH / 2;
          const mapY = WORLD_DEPTH / 2 - probe.z;
          callbacks.onPointer({ x: mapX, y: mapY, elevation: sampleHeight(grid, mapX, mapY) });
          return;
        }
        previous = t;
      }
      callbacks.onPointer(null);
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
    if (paintPending && now - lastPaint > 66) {
      painter.paint(view.time, view.layers);
      texture.needsUpdate = true;
      paintPending = false;
      lastPaint = now;
      dirty = true;
    }
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

  const updateHead = () => {
    const chip = headLabel.element.querySelector(".map3d-chip");
    if (chip) chip.textContent = `Kepala api (model) · ${wib(view.time)}`;
    headLabel.point = headPoint(view.time);
    for (const label of labels) {
      const time = Number(label.element.dataset.time);
      if (time) label.element.classList.toggle("is-future", time > view.time);
    }
  };
  updateHead();

  return {
    update(next) {
      const previous = view;
      view = next;
      if (next.time !== previous.time || next.layers !== previous.layers) {
        paintPending = true;
        updateHead();
      }
      if (next.mode !== previous.mode) {
        applyHeights(next.mode === "3d" ? next.exaggeration : 0);
        applyMode(next.mode);
        moveCamera(next.mode, true);
      } else if (next.exaggeration !== previous.exaggeration && next.mode === "3d") {
        applyHeights(next.exaggeration);
      }
      labelsDirty = dirty = true;
    },
    resetView() {
      moveCamera(view.mode, true);
    },
    dispose() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pointerFrame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      for (const label of labels) label.element.remove();
      geometry.dispose();
      skirtGeometry.dispose();
      shadow.geometry.dispose();
      for (const mesh of [terrain, skirt, shadow]) (mesh.material as THREE.Material).dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
