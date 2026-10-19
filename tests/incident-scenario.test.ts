import { expect, test } from "vite-plus/test";
import {
  CONTAINED_AT,
  IGNITION_AT,
  PATH_LENGTH_KM,
  PLACES,
  TIMELINE_END,
  TIMELINE_START,
  WORLD_DEPTH,
  WORLD_WIDTH,
  areaSeries,
  formatNumber,
  headDistance,
  incidentEvents,
  perimeterAt,
  satellitePasses,
  sceneDetections,
  timeAtDistance,
} from "../app/design/scenario";

const inside = (point: { x: number; y: number }) =>
  point.x >= 0 && point.x <= WORLD_WIDTH && point.y >= 0 && point.y <= WORLD_DEPTH;

test("show no modelled fire before the estimated ignition", () => {
  expect(perimeterAt(IGNITION_AT - 60_000)).toBeNull();
  expect(headDistance(IGNITION_AT)).toBe(0);
  expect(areaSeries()[0].y).toBe(0);
});

test("grow the modelled area without shrinking, then stop at containment", () => {
  const series = areaSeries();
  for (let i = 1; i < series.length; i++) expect(series[i].y).toBeGreaterThanOrEqual(series[i - 1].y - 1e-6);
  const contained = series.filter((point) => point.x >= CONTAINED_AT).map((point) => point.y);
  expect(new Set(contained.map((value) => value.toFixed(6))).size).toBe(1);
  expect(headDistance(TIMELINE_END)).toBeLessThanOrEqual(PATH_LENGTH_KM);
});

test("map head distance and time in both directions", () => {
  for (const hours of [1, 6, 20, 40]) {
    const time = IGNITION_AT + hours * 3_600_000;
    expect(Math.abs(timeAtDistance(headDistance(time)) - time)).toBeLessThan(120_000);
  }
});

test("keep all synthetic geometry inside the fictional map", () => {
  for (const place of PLACES) expect(inside(place.point)).toBe(true);
  for (const point of perimeterAt(CONTAINED_AT) ?? []) expect(inside(point)).toBe(true);
  for (const detection of sceneDetections()) expect(inside(detection.point)).toBe(true);
});

test("tie detections to discrete passes and never report a covered pass as zero", () => {
  const passes = satellitePasses();
  const byId = new Map(passes.map((pass) => [pass.id, pass]));
  for (const detection of sceneDetections()) {
    const pass = byId.get(detection.passId);
    expect(pass).toBeDefined();
    expect(detection.at).toBe(pass?.at);
    expect(detection.at).toBeGreaterThan(IGNITION_AT);
    expect(pass?.obscured).toBe(false);
  }
  const covered = passes.filter((pass) => pass.obscured);
  expect(covered).toHaveLength(1);
  for (const pass of passes) {
    expect(pass.at).toBeGreaterThan(IGNITION_AT);
    expect(pass.at).toBeLessThanOrEqual(TIMELINE_END);
  }
});

test("order events inside the timeline and keep cause undetermined", () => {
  const events = incidentEvents();
  expect(events.map((event) => event.at)).toEqual([...events].map((event) => event.at).sort((a, b) => a - b));
  for (const event of events) {
    expect(event.at).toBeGreaterThanOrEqual(TIMELINE_START);
    expect(event.at).toBeLessThanOrEqual(TIMELINE_END);
  }
  expect(events.find((event) => event.kind === "ignition")?.detail).toMatch(/Bukan penentuan penyebab/);
});

test("produce the same seeded records on every run", () => {
  const detections = sceneDetections();
  expect(detections).toHaveLength(343);
  expect(new Set(detections.map((detection) => detection.id)).size).toBe(detections.length);
  expect(satellitePasses()).toHaveLength(15);
});

test("format numbers in Indonesian style without locale data", () => {
  expect(formatNumber(12480.46, 1)).toBe("12.480,5");
  expect(formatNumber(3)).toBe("3");
  expect(formatNumber(-0.01, 1)).toBe("0,0");
  expect(formatNumber(-2.5, 1)).toBe("−2,5");
});
