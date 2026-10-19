// Indonesia map from the local seed (ADR 0009, local seed preview). The page
// shows real FIRMS detections and Copernicus GLO-90 heights only when the local
// development server serves .data/seed. The static build has no seed data, so
// the page then shows that the data is unavailable.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import "./incident.css";
import "./indonesia.css";
import { formatWib } from "./fixture";
import {
  GROUPS,
  LANDCOVER_CLASSES,
  PREVIEW_BASE,
  SEED_CONFIDENCES,
  SEED_SATELLITES,
  WINDOW_CHOICES,
  dailyCounts,
  decodeDetections,
  groupCounts,
  selectDetections,
  type CountRow,
  type DetectionFilter,
  type Detections,
  type PreviewFeatures,
  type PreviewMeta,
  type SeedConfidence,
  type SeedSatellite,
} from "./indonesia-data";
import { SEED_PAINT, paintDetections, paintTerrain, type SeedLayers } from "./indonesia-paint";
import type { DetailState, SeedScene, SeedSceneView, SeedViewMode } from "./indonesia-scene";

const EXAGGERATIONS = [10, 20, 40, 80];
const NICE_KM = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const ROW_LIMIT = 100;
const CONFIDENCE_LABEL: Record<SeedConfidence, string> = {
  rendah: "Rendah",
  nominal: "Nominal",
  tinggi: "Tinggi",
};

const number = new Intl.NumberFormat("id-ID");
const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const wib = (time: number) => formatWib(new Date(time).toISOString()).replace(" WIB", "");
const dayLabel = (key: string) =>
  wib(Date.parse(`${key}T00:00:00Z`) - 7 * 3_600_000)
    .split(" ")
    .slice(0, 2)
    .join(" ");
const degrees = (value: number, positive: string, negative: string) =>
  `${formatNumber(Math.abs(value), 3)}° ${value < 0 ? negative : positive}`;

interface MapExtras {
  landcover: Uint8Array | null;
  features: PreviewFeatures | null;
}

type SeedData =
  | { state: "memuat" }
  | { state: "tidak-tersedia" }
  | {
      state: "siap";
      meta: PreviewMeta;
      heights: Int16Array | null;
      detections: Detections | null;
      extras: MapExtras;
    };

function useSeedPreview(): SeedData {
  const [data, setData] = useState<SeedData>({ state: "memuat" });
  useEffect(() => {
    let cancelled = false;
    const binary = async (path: string) => {
      const response = await fetch(`${PREVIEW_BASE}/${path}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response.arrayBuffer();
    };
    (async () => {
      const response = await fetch(`${PREVIEW_BASE}/meta.json`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("No local seed preview");
      }
      const meta = (await response.json()) as PreviewMeta;
      if (meta.schemaVersion !== 1) throw new Error("Unknown preview version");
      const [dem, firms, cover, features] = await Promise.all([
        meta.dem ? binary("dem.i16") : null,
        meta.firms ? binary("firms.bin") : null,
        meta.landcover ? binary("landcover.u8") : null,
        meta.features
          ? fetch(`${PREVIEW_BASE}/features.json`, { cache: "no-store" }).then((result) =>
              result.ok ? (result.json() as Promise<PreviewFeatures>) : null,
            )
          : null,
      ]);
      const landcover = cover ? new Uint8Array(cover) : null;
      if (landcover && meta.dem && landcover.length !== meta.dem.width * meta.dem.height) {
        throw new Error("The land cover grid has the wrong size");
      }
      const heights = dem && meta.dem ? new Int16Array(dem) : null;
      if (heights && meta.dem && heights.length !== meta.dem.width * meta.dem.height) {
        throw new Error("The DEM grid has the wrong size");
      }
      const detections =
        firms && meta.firms ? decodeDetections(firms, meta.firms.epochMinute) : null;
      if (!cancelled)
        setData(
          heights || detections
            ? { state: "siap", meta, heights, detections, extras: { landcover, features } }
            : { state: "tidak-tersedia" },
        );
    })().catch(() => {
      if (!cancelled) setData({ state: "tidak-tersedia" });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

export function IndonesiaSeedWorkspace() {
  const data = useSeedPreview();
  return (
    <>
      <SeedTitle data={data} />
      {data.state === "memuat" && (
        <section className="d-card d-seed-notice" aria-live="polite">
          <p>Memuat data seed lokal…</p>
        </section>
      )}
      {data.state === "tidak-tersedia" && <SeedUnavailable />}
      {data.state === "siap" && (
        <SeedReady
          meta={data.meta}
          heights={data.heights}
          detections={data.detections}
          extras={data.extras}
        />
      )}
      <SeedMethod meta={data.state === "siap" ? data.meta : null} />
    </>
  );
}

function windowText(meta: PreviewMeta, hours?: number) {
  if (!meta.firms) return "";
  const end = Date.parse(meta.firms.windowEnd);
  return `${wib(end - (hours ?? meta.firms.windowHours) * 3_600_000)} – ${wib(end)} WIB`;
}

function SeedTitle({ data }: { data: SeedData }) {
  return (
    <div className="d-title">
      <div>
        <p className="d-eyebrow">Peta Indonesia · prototipe 3D · seed lokal</p>
        <h1>Deteksi satelit 7 hari terakhir</h1>
      </div>
      <p className="d-meta">
        <span className="d-dashed">Seed lokal</span>
        <span>NASA FIRMS · Copernicus DEM · ESA WorldCover · Natural Earth</span>
        {data.state === "siap" && data.meta.firms && <span>{windowText(data.meta)}</span>}
      </p>
    </div>
  );
}

function SeedUnavailable() {
  return (
    <section className="d-card d-seed-notice is-missing" aria-labelledby="seed-kosong">
      <h2 id="seed-kosong">Data seed lokal tidak tersedia</h2>
      <p>
        Halaman ini memuat data nyata hanya dari server pengembangan lokal. Build statis dan situs
        publik tidak memuat data seed, jadi halaman ini tidak menampilkan peta di sana.
      </p>
      <ol>
        <li>
          Jalankan <code>pnpm seed:firms</code> dan <code>pnpm seed:dem</code> dengan Node.js 24.
          Untuk tutupan lahan, sungai, dan nama tempat, jalankan juga{" "}
          <code>pnpm seed:landcover</code> dan <code>pnpm seed:features</code>.
        </li>
        <li>
          Jalankan <code>pnpm dev</code>, lalu buka halaman ini lagi.
        </li>
      </ol>
    </section>
  );
}

function SeedReady({
  meta,
  heights,
  detections,
  extras,
}: {
  meta: PreviewMeta;
  heights: Int16Array | null;
  detections: Detections | null;
  extras: MapExtras;
}) {
  const [filter, setFilter] = useState<DetectionFilter>({
    hours: meta.firms?.windowHours ?? 168,
    confidences: [...SEED_CONFIDENCES],
    satellites: [...SEED_SATELLITES],
  });
  const [layers, setLayers] = useState<SeedLayers>({
    landcover: !!extras.landcover,
    terrain: true,
    shade: true,
    water: true,
    places: true,
    outline: true,
    detections: true,
  });
  const [mode, setMode] = useState<SeedViewMode>("3d");
  const [exaggeration, setExaggeration] = useState(40);
  const end = meta.firms ? Date.parse(meta.firms.windowEnd) : 0;
  const selection = useMemo(
    () => (detections ? selectDetections(detections, end, filter) : new Uint32Array()),
    [detections, end, filter],
  );
  const view = useMemo<SeedSceneView>(
    () => ({ mode, exaggeration, layers, selection }),
    [mode, exaggeration, layers, selection],
  );
  return (
    <>
      <SeedSummary meta={meta} detections={detections} selection={selection} hours={filter.hours} />
      <SeedFilters
        filter={filter}
        setFilter={setFilter}
        disabled={!detections}
        windowHours={meta.firms?.windowHours ?? 168}
      />
      {!meta.firms && (
        <p className="d-seed-inline">
          Seed FIRMS tidak tersedia. Jalankan <code>pnpm seed:firms</code> untuk menampilkan
          deteksi.
        </p>
      )}
      {meta.dem && heights ? (
        <SeedMapCard
          meta={meta}
          heights={heights}
          detections={detections}
          extras={extras}
          view={view}
          setLayers={setLayers}
          setMode={setMode}
          setExaggeration={setExaggeration}
          hours={filter.hours}
        />
      ) : (
        <p className="d-seed-inline">
          Seed DEM tidak tersedia. Jalankan <code>pnpm seed:dem</code> untuk menampilkan peta medan.
        </p>
      )}
      {detections && meta.firms && (
        <SeedTables detections={detections} selection={selection} end={end} hours={filter.hours} />
      )}
    </>
  );
}

// Summary and filters --------------------------------------------------------------

function SeedSummary({
  meta,
  detections,
  selection,
  hours,
}: {
  meta: PreviewMeta;
  detections: Detections | null;
  selection: Uint32Array;
  hours: number;
}) {
  const counts = useMemo(() => {
    const result = { high: 0, satellites: [0, 0] };
    if (!detections) return result;
    for (const i of selection) {
      if (detections.confidence[i] === 2) result.high++;
      result.satellites[detections.satellite[i]]++;
    }
    return result;
  }, [detections, selection]);
  const latest = detections && selection.length ? detections.time[selection[0]] : null;
  const retrieved = meta.firms
    ? Math.min(...meta.firms.sources.map((source) => Date.parse(source.retrievedAt)))
    : null;
  const share = selection.length ? Math.round((counts.high / selection.length) * 100) : 0;
  const kpis: { label: string; value: string; unit: string; note: string }[] = [
    {
      label: "Deteksi satelit",
      value: detections ? number.format(selection.length) : "—",
      unit: "titik",
      note: "Bukan jumlah kebakaran",
    },
    {
      label: "Keyakinan tinggi",
      value: detections ? number.format(counts.high) : "—",
      unit: "titik",
      note: detections ? `${share}% dari deteksi terpilih` : "Tidak tersedia",
    },
    {
      label: "NOAA-20 / NOAA-21",
      value: detections
        ? `${number.format(counts.satellites[0])} / ${number.format(counts.satellites[1])}`
        : "—",
      unit: "",
      note: "VIIRS 375 m, near real-time",
    },
    {
      label: "Pengamatan terbaru",
      value: latest ? wib(latest) : "—",
      unit: latest ? "WIB" : "",
      note: "Data NRT dapat tertunda sekitar 3 jam",
    },
    {
      label: "Seed diunduh",
      value: retrieved ? wib(retrieved) : "—",
      unit: retrieved ? "WIB" : "",
      note: "Tidak diperbarui otomatis",
    },
  ];
  const facts: [string, string][] = [
    ["Rentang", meta.firms ? windowText(meta, hours) : "—"],
    ["Deteksi", "NASA FIRMS VIIRS NRT, NOAA-20 dan NOAA-21"],
    [
      "Ketinggian",
      meta.dem
        ? `Copernicus DEM GLO-90 (model permukaan), sel ${meta.dem.cellArcSec}″ ≈ ${formatNumber(meta.dem.cell * 111.32, 1)} km${meta.detail ? "; 6″ ≈ 185 m saat diperbesar" : ""}`
        : "—",
    ],
    ["Tutupan lahan", meta.landcover ? "ESA WorldCover 2021, kelas terbanyak per sel" : "—"],
    [
      "Batas",
      `Natural Earth 1:50 m disederhanakan, buffer pantai ${meta.firms?.bufferKm ?? 10} km`,
    ],
    ["Status", "Pratinjau lokal untuk tinjauan desain"],
  ];
  return (
    <section className="d-card" aria-labelledby="ringkasan-judul" id="ringkasan">
      <div className="d-card-head">
        <h2 id="ringkasan-judul">Ringkasan</h2>
        <p className="d-sub">Wilayah Indonesia · seed lokal, bukan layanan informasi kebakaran</p>
      </div>
      <dl className="d-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label}>
            <dt>{kpi.label}</dt>
            <dd>
              <span className="d-kpi-value">
                {kpi.value}
                {kpi.unit && <span className="d-kpi-unit"> {kpi.unit}</span>}
              </span>
              <span className="d-kpi-note">{kpi.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="d-facts">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SeedFilters({
  filter,
  setFilter,
  disabled,
  windowHours,
}: {
  filter: DetectionFilter;
  setFilter: (update: (current: DetectionFilter) => DetectionFilter) => void;
  disabled: boolean;
  windowHours: number;
}) {
  const toggle = <T extends string>(list: readonly T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return (
    <section className="d-card d-seed-filters" aria-labelledby="saring-judul">
      <h2 id="saring-judul" className="sr-only">
        Saring deteksi
      </h2>
      <div className="controls">
        <fieldset className="segmented" disabled={disabled}>
          <legend>Rentang waktu</legend>
          {WINDOW_CHOICES.filter((hours) => hours <= windowHours).map((hours) => (
            <button
              key={hours}
              type="button"
              aria-pressed={filter.hours === hours}
              onClick={() => setFilter((current) => ({ ...current, hours }))}
            >
              {hours % 24 === 0 && hours > 72 ? `${hours / 24} hari` : `${hours} jam`}
            </button>
          ))}
        </fieldset>
        <fieldset className="segmented" disabled={disabled}>
          <legend>Tingkat keyakinan satelit</legend>
          {[...SEED_CONFIDENCES].reverse().map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter.confidences.includes(value)}
              onClick={() =>
                setFilter((current) => ({
                  ...current,
                  confidences: toggle(current.confidences, value),
                }))
              }
            >
              {CONFIDENCE_LABEL[value]}
            </button>
          ))}
        </fieldset>
        <fieldset className="segmented" disabled={disabled}>
          <legend>Satelit</legend>
          {SEED_SATELLITES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter.satellites.includes(value)}
              onClick={() =>
                setFilter((current) => ({
                  ...current,
                  satellites: toggle<SeedSatellite>(current.satellites, value),
                }))
              }
            >
              {value}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="d-sub">Saringan berlaku untuk ringkasan, peta, dan tabel.</p>
    </section>
  );
}

// Map ------------------------------------------------------------------------------

const LAYER_ITEMS: {
  id: keyof SeedLayers;
  label: string;
  note: string;
  needs?: keyof MapExtras;
}[] = [
  { id: "detections", label: "Deteksi satelit (VIIRS)", note: "Belum tentu kebakaran" },
  {
    id: "landcover",
    label: "Tutupan lahan",
    note: "ESA WorldCover 2021. Jika mati, warna ketinggian dipakai",
    needs: "landcover",
  },
  { id: "terrain", label: "Warna ketinggian", note: "Copernicus GLO-90, saat tutupan lahan mati" },
  { id: "shade", label: "Bayangan bukit", note: "Dihitung dari DEM" },
  { id: "water", label: "Sungai dan danau", note: "Natural Earth 1:10m", needs: "features" },
  { id: "places", label: "Nama tempat", note: "Natural Earth 1:10m", needs: "features" },
  { id: "outline", label: "Garis batas Indonesia", note: "Natural Earth, disederhanakan" },
];

function SeedMapCard({
  meta,
  heights,
  detections,
  extras,
  view,
  setLayers,
  setMode,
  setExaggeration,
  hours,
}: {
  meta: PreviewMeta;
  heights: Int16Array;
  detections: Detections | null;
  extras: MapExtras;
  view: SeedSceneView;
  setLayers: (update: (current: SeedLayers) => SeedLayers) => void;
  setMode: (mode: SeedViewMode) => void;
  setExaggeration: (value: number) => void;
  hours: number;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const items = LAYER_ITEMS.filter((item) => !item.needs || extras[item.needs]);
  const shown = items.filter((item) => view.layers[item.id]).length;
  return (
    <section className="d-card d-map-card d-seed-map" id="peta" aria-labelledby="peta-judul">
      <h2 id="peta-judul" className="sr-only">
        Peta 3D Indonesia dengan deteksi satelit
      </h2>
      <SeedMap
        meta={meta}
        heights={heights}
        detections={detections}
        extras={extras}
        view={view}
        setMode={setMode}
        setExaggeration={setExaggeration}
        panelOpen={layersOpen}
        hours={hours}
        toggles={
          <>
            <button
              type="button"
              aria-expanded={layersOpen}
              aria-controls="panel-lapisan"
              onClick={() => setLayersOpen(!layersOpen)}
            >
              Lapisan{" "}
              <span className="map3d-count">
                {shown}/{items.length}
              </span>
            </button>
            <button
              type="button"
              aria-expanded={legendOpen}
              aria-controls="legenda-peta"
              onClick={() => setLegendOpen(!legendOpen)}
            >
              Legenda
            </button>
          </>
        }
      >
        {layersOpen && (
          <div
            className="d-layers"
            id="panel-lapisan"
            role="group"
            aria-labelledby="lapisan-judul"
            onKeyDown={(event) => {
              if (event.key === "Escape") setLayersOpen(false);
            }}
          >
            <div className="d-layers-head">
              <h3 id="lapisan-judul">Lapisan</h3>
              <button type="button" onClick={() => setLayersOpen(false)}>
                Tutup
              </button>
            </div>
            <ul>
              {items.map((item) => (
                <li key={item.id} className={view.layers[item.id] ? undefined : "is-off"}>
                  <label>
                    <input
                      type="checkbox"
                      checked={view.layers[item.id]}
                      disabled={item.id === "detections" && !detections}
                      onChange={(event) =>
                        setLayers((current) => ({ ...current, [item.id]: event.target.checked }))
                      }
                    />
                    <span>
                      {item.label}
                      <small>{item.note}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SeedMap>
      {legendOpen && <SeedLegend meta={meta} layers={view.layers} extras={extras} />}
    </section>
  );
}

function SeedMap({
  meta,
  heights,
  detections,
  extras,
  view,
  setMode,
  setExaggeration,
  panelOpen,
  hours,
  toggles,
  children,
}: {
  meta: PreviewMeta;
  heights: Int16Array;
  detections: Detections | null;
  extras: MapExtras;
  view: SeedSceneView;
  setMode: (mode: SeedViewMode) => void;
  setExaggeration: (value: number) => void;
  panelOpen: boolean;
  hours: number;
  toggles: ReactNode;
  children: ReactNode;
}) {
  const dem = meta.dem;
  const figureRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const scaleBarRef = useRef<HTMLSpanElement>(null);
  const scaleTextRef = useRef<HTMLSpanElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const reliefRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<SeedScene | null>(null);
  const flatRef = useRef<{ terrain: HTMLCanvasElement; dots: HTMLCanvasElement } | null>(null);
  const viewRef = useRef(view);
  const [status, setStatus] = useState<"memuat" | "siap" | "datar">("memuat");
  const [fullscreen, setFullscreen] = useState(false);
  const [detail, setDetail] = useState<DetailState>("tidak-aktif");

  useEffect(() => {
    const host = hostRef.current;
    const labelHost = labelsRef.current;
    if (!host || !labelHost || !dem) return;
    let disposed = false;
    const flat = () => {
      if (disposed) return;
      // Without WebGL, show the same painted map from above.
      const terrain = document.createElement("canvas");
      const dots = document.createElement("canvas");
      for (const canvas of [dots, terrain]) {
        canvas.className = "map3d-flat";
        canvas.setAttribute("aria-hidden", "true");
        host.insertBefore(canvas, host.firstChild);
      }
      paintTerrain(terrain, dem, heights, viewRef.current.layers, extras);
      if (detections && viewRef.current.layers.detections) {
        paintDetections(dots, dem, detections, viewRef.current.selection);
      }
      flatRef.current = { terrain, dots };
      setStatus("datar");
    };
    import("./indonesia-scene")
      .then(({ createSeedScene }) => {
        if (disposed) return;
        try {
          sceneRef.current = createSeedScene(
            host,
            labelHost,
            { meta: dem, heights, detections, ...extras, detail: meta.detail },
            viewRef.current,
            {
              onCamera(heading, kmPerPixel, relief) {
                needleRef.current?.setAttribute(
                  "transform",
                  `rotate(${(-heading).toFixed(1)} 24 24)`,
                );
                const length = NICE_KM.find((value) => value / kmPerPixel >= 60) ?? 2000;
                if (scaleBarRef.current)
                  scaleBarRef.current.style.width = `${(length / kmPerPixel).toFixed(0)}px`;
                if (scaleTextRef.current)
                  scaleTextRef.current.textContent = `${number.format(length)} km`;
                if (reliefRef.current)
                  reliefRef.current.textContent = relief
                    ? ` · relief ${formatNumber(relief, relief < 10 ? 1 : 0)}×`
                    : "";
              },
              onDetail: setDetail,
              onPointer(reading) {
                const readout = readoutRef.current;
                if (!readout) return;
                readout.hidden = !reading;
                if (!reading) return;
                const place = `${degrees(reading.latitude, "LU", "LS")} · ${degrees(reading.longitude, "BT", "BB")}`;
                const height =
                  reading.elevation === null
                    ? "di luar data DEM"
                    : `${number.format(Math.round(reading.elevation))} m`;
                const i = reading.detection;
                readout.textContent =
                  i !== null && detections
                    ? `${detections.satellite[i] ? "NOAA-21" : "NOAA-20"} · ${wib(detections.time[i])} WIB · ${CONFIDENCE_LABEL[SEED_CONFIDENCES[detections.confidence[i]]]} · FRP ${formatNumber(detections.frp[i], 1)} MW · ${place}`
                    : `${place} · ${height}`;
              },
            },
          );
          setStatus("siap");
        } catch {
          flat();
        }
      })
      .catch(flat);
    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      flatRef.current?.terrain.remove();
      flatRef.current?.dots.remove();
      flatRef.current = null;
    };
  }, [dem, heights, detections, extras, meta.detail]);

  useEffect(() => {
    const previous = viewRef.current;
    viewRef.current = view;
    sceneRef.current?.update(view);
    const flat = flatRef.current;
    if (flat && dem) {
      const repaint = (["landcover", "terrain", "shade", "water", "outline"] as const).some(
        (key) => view.layers[key] !== previous.layers[key],
      );
      if (repaint) paintTerrain(flat.terrain, dem, heights, view.layers, extras);
      const ctx = flat.dots.getContext("2d");
      if (detections && view.layers.detections)
        paintDetections(flat.dots, dem, detections, view.selection);
      else ctx?.clearRect(0, 0, flat.dots.width, flat.dots.height);
    }
  }, [view, dem, heights, detections, extras]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === figureRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void figureRef.current?.requestFullscreen();
  };

  return (
    <figure ref={figureRef} className={`map3d is-${status}${panelOpen ? " has-panel" : ""}`}>
      <div
        ref={hostRef}
        className="map3d-stage"
        role="img"
        aria-label={`Peta ${view.mode === "3d" ? "3D" : "2D"} Indonesia dengan ${number.format(view.selection.length)} deteksi satelit. Tabel di bawah memuat data yang sama.`}
      >
        <div ref={labelsRef} className="map3d-labels" aria-hidden="true" />
      </div>
      {status === "memuat" && <p className="map3d-status">Memuat peta 3D…</p>}
      {status === "datar" && (
        <p className="map3d-status is-notice">
          Peramban ini tidak mendukung WebGL. Peta tampil datar dari atas.
        </p>
      )}
      <button
        type="button"
        className="map3d-compass"
        onClick={() => sceneRef.current?.resetView()}
        aria-label="Kembalikan arah utara dan tampilan awal"
        title="Kembalikan tampilan"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <g ref={needleRef}>
            <path d="M24 9 L29 25 L24 22 L19 25 Z" fill="currentColor" />
            <path
              d="M24 39 L29 25 L24 28 L19 25 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text
              x="24"
              y="7.5"
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="currentColor"
            >
              U
            </text>
          </g>
        </svg>
      </button>
      <div className="map3d-badges">
        <span className="map3d-badge">Seed lokal · hanya server dev</span>
        {meta.firms && <span className="map3d-time">{windowText(meta, hours)}</span>}
        {detail === "memuat" && <span className="map3d-time">Memuat medan detail…</span>}
        {detail === "siap" && <span className="map3d-time">Medan detail 6″ ≈ 185 m</span>}
        {detail === "galat" && <span className="map3d-time">Medan detail gagal dimuat</span>}
      </div>
      <div className="map3d-toggles">{toggles}</div>
      {children}
      <div className="map3d-foot" hidden={status !== "siap"}>
        <p className="map3d-scale">
          <span ref={scaleBarRef} className="map3d-scale-bar" />
          <span ref={scaleTextRef}>100 km</span>
          <span className="map3d-scale-note"> · di tengah tampilan</span>
          <span ref={reliefRef} />
        </p>
        <p ref={readoutRef} className="map3d-readout" aria-hidden="true" hidden />
      </div>
      <div className="map3d-tools">
        <fieldset className="map3d-modes" disabled={status !== "siap"}>
          <legend className="sr-only">Mode peta</legend>
          {(["2d", "3d"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view.mode === value}
              onClick={() => setMode(value)}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </fieldset>
        <label className="map3d-select">
          <span className="sr-only">Pembesaran relief pada tampilan nasional</span>
          <select
            value={view.exaggeration}
            disabled={status !== "siap" || view.mode === "2d"}
            onChange={(event) => setExaggeration(Number(event.target.value))}
          >
            {EXAGGERATIONS.map((value) => (
              <option key={value} value={value}>
                Relief {value}× (nasional)
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
          title={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d={
                fullscreen
                  ? "M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5"
                  : "M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5"
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </button>
      </div>
    </figure>
  );
}

function SeedLegend({
  meta,
  layers,
  extras,
}: {
  meta: PreviewMeta;
  layers: SeedLayers;
  extras: MapExtras;
}) {
  const maximum = meta.dem?.maximum ?? 4500;
  const cover = layers.landcover && extras.landcover;
  const swatch = (fill: string, stroke = "rgba(38, 32, 26, 0.45)") => (
    <svg className="d-swatch" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="3" width="16" height="12" fill={fill} stroke={stroke} />
    </svg>
  );
  return (
    <div className="d-legend" id="legenda-peta">
      <ul aria-label="Keterangan peta">
        {[2, 1, 0].map((level) => (
          <li key={level}>
            <svg className="d-swatch" viewBox="0 0 18 18" aria-hidden="true">
              <circle
                cx="9"
                cy="9"
                r="6"
                fill={SEED_PAINT.detect[level]}
                stroke={SEED_PAINT.detectStroke}
                strokeWidth="2"
              />
            </svg>
            Deteksi keyakinan {CONFIDENCE_LABEL[SEED_CONFIDENCES[level]].toLowerCase()}
          </li>
        ))}
        {!cover && layers.terrain && (
          <li>
            <span className="d-seed-ramp" aria-hidden="true" />
            Ketinggian 0 – {number.format(maximum)} m (rata-rata sel)
          </li>
        )}
        {layers.water && extras.features && (
          <li>
            <svg className="d-swatch" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M1 13 Q6 4 10 9 T17 5"
                fill="none"
                stroke={SEED_PAINT.river}
                strokeWidth="2.5"
              />
            </svg>
            Sungai dan danau
          </li>
        )}
        <li>
          {swatch(SEED_PAINT.neighbour, SEED_PAINT.neighbourEdge)}
          Di luar Indonesia, tanpa data
        </li>
      </ul>
      {cover && (
        <ul className="d-seed-classes" aria-label="Kelas tutupan lahan">
          {LANDCOVER_CLASSES.filter(({ value }) => value !== 70 && value !== 100).map(
            ({ value, label, colour }) => (
              <li key={value}>
                {swatch(`rgb(${colour.join(" ")})`)}
                {label}
              </li>
            ),
          )}
        </ul>
      )}
      <p>
        Seret untuk menggeser peta. Gulir untuk memperbesar ke arah penunjuk. Klik kanan, atau tahan
        Ctrl sambil menyeret, untuk memutar dan memiringkan peta 3D. Di layar sentuh, satu jari
        menggeser dan dua jari memperbesar atau memutar. Arahkan penunjuk ke titik untuk melihat
        waktu, satelit, dan keyakinan. Relief yang dipilih berlaku pada tampilan nasional dan
        berkurang saat diperbesar, sampai 1,5× pada tampilan lokal.
        {meta.detail &&
          " Perbesar sampai lebar tampilan kurang dari sekitar 450 km untuk memuat medan dan tutupan lahan yang lebih rinci."}{" "}
        Tidak ada tile peta dari server lain.
      </p>
    </div>
  );
}

// Tables ---------------------------------------------------------------------------

function CountTable({
  caption,
  head,
  rows,
  label,
}: {
  caption: string;
  head: string;
  rows: CountRow[];
  label: (key: string) => string;
}) {
  const total: CountRow = { key: "Jumlah", counts: [0, 0, 0], total: 0 };
  for (const row of rows) {
    row.counts.forEach((value, i) => (total.counts[i] += value));
    total.total += row.total;
  }
  return (
    <div className="table-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head}</th>
            {SEED_CONFIDENCES.map((value) => (
              <th key={value} scope="col" className="num">
                {CONFIDENCE_LABEL[value]}
              </th>
            ))}
            <th scope="col" className="num">
              Jumlah
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{label(row.key)}</th>
              {row.counts.map((value, i) => (
                <td key={SEED_CONFIDENCES[i]} className="num">
                  {number.format(value)}
                </td>
              ))}
              <td className="num">{number.format(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Jumlah</th>
            {total.counts.map((value, i) => (
              <td key={SEED_CONFIDENCES[i]} className="num">
                {number.format(value)}
              </td>
            ))}
            <td className="num">{number.format(total.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SeedTables({
  detections,
  selection,
  end,
  hours,
}: {
  detections: Detections;
  selection: Uint32Array;
  end: number;
  hours: number;
}) {
  const daily = useMemo(
    () => dailyCounts(detections, selection, end, hours),
    [detections, selection, end, hours],
  );
  const groups = useMemo(() => groupCounts(detections, selection), [detections, selection]);
  const latest = Array.from(selection.subarray(0, ROW_LIMIT));
  return (
    <section className="d-card d-tables" id="tabel" aria-labelledby="tabel-judul">
      <details open>
        <summary>
          <span className="d-heading">
            <span className="d-eyebrow">Tabel</span>
            <h2 id="tabel-judul">Data yang sama tanpa peta</h2>
          </span>
          <span className="d-toggle" aria-hidden="true">
            <span className="when-closed">▸ Tampilkan tabel</span>
            <span className="when-open">▾ Sembunyikan tabel</span>
          </span>
        </summary>
        <div className="d-table-grid">
          <CountTable
            caption="Deteksi per hari (WIB). Hari pertama dan terakhir dalam rentang tidak penuh."
            head="Tanggal"
            rows={daily}
            label={dayLabel}
          />
          <CountTable
            caption={`Deteksi per pulau, urut abjad (bukan peringkat). ${GROUPS.at(-1)} mencakup semua pulau di luar lima pulau terbesar.`}
            head="Pulau"
            rows={groups}
            label={(key) => key}
          />
        </div>
        <details className="d-more">
          <summary>
            {number.format(Math.min(ROW_LIMIT, selection.length))} deteksi terbaru dari{" "}
            {number.format(selection.length)}
          </summary>
          <div className="table-scroll d-long">
            <table>
              <caption className="sr-only">Deteksi satelit terbaru</caption>
              <thead>
                <tr>
                  <th scope="col">Waktu (WIB)</th>
                  <th scope="col">Satelit</th>
                  <th scope="col">Lintang, bujur</th>
                  <th scope="col">Keyakinan</th>
                  <th scope="col" className="num">
                    FRP (MW)
                  </th>
                  <th scope="col">Waktu lintasan</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((i) => (
                  <tr key={i}>
                    <td>{wib(detections.time[i])}</td>
                    <td>{detections.satellite[i] ? "NOAA-21" : "NOAA-20"}</td>
                    <td className="mono">
                      {formatNumber(detections.latitude[i], 4)},{" "}
                      {formatNumber(detections.longitude[i], 4)}
                    </td>
                    <td>{CONFIDENCE_LABEL[SEED_CONFIDENCES[detections.confidence[i]]]}</td>
                    <td className="num">{formatNumber(detections.frp[i], 1)}</td>
                    <td>{detections.night[i] ? "Malam" : "Siang"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="d-sub">
            Semua deteksi ada di <code>.data/seed/firms/viirs-indonesia-7d.json</code>.
          </p>
        </details>
      </details>
    </section>
  );
}

// Method ---------------------------------------------------------------------------

function SeedMethod({ meta }: { meta: PreviewMeta | null }) {
  const sources = meta?.firms?.sources ?? [];
  return (
    <section className="d-card d-method" id="metode" aria-labelledby="metode-judul">
      <div className="d-heading">
        <span className="d-eyebrow">Metode</span>
        <h2 id="metode-judul">Cara membaca peta ini</h2>
      </div>
      <div className="d-method-grid">
        <div>
          <h3>Yang tidak bisa ditunjukkan</h3>
          <ul>
            <li>
              Deteksi satelit menandai panas di permukaan. Deteksi belum tentu kebakaran, dan satu
              kebakaran dapat tampil sebagai beberapa deteksi.
            </li>
            <li>
              Tanpa deteksi tidak berarti tanpa api. Awan, asap tebal, tajuk hutan, dan waktu
              lintasan satelit dapat menyembunyikan api.
            </li>
            <li>
              Batas wilayah memakai garis Natural Earth yang disederhanakan, dengan buffer pantai.
              Titik dekat pantai atau perbatasan dapat masuk ke negara yang salah. Belum ada batas
              provinsi yang disetujui.
            </li>
            <li>
              Ketinggian berasal dari model permukaan. Di hutan, ketinggian dapat menunjukkan puncak
              pohon. Setiap sel adalah rata-rata, jadi puncak gunung tampak lebih rendah. Relief
              diperbesar.
            </li>
            <li>
              Tutupan lahan adalah klasifikasi citra tahun 2021, bukan peta terkini atau batas
              resmi. Kebun sawit dan hutan tanaman umumnya masuk kelas pohon, jadi peta ini tidak
              membedakan hutan alam dan kebun. Kelas gambut tidak ada.
            </li>
            <li>
              Sungai, danau, dan nama tempat dari Natural Earth 1:10m disederhanakan untuk peta
              nasional. Saat diperbesar, garis sungai dapat bergeser beberapa kilometer dari sungai
              sebenarnya.
            </li>
            <li>Halaman ini bukan alat operasi pemadaman, peringatan, atau evakuasi.</li>
          </ul>
        </div>
        <div>
          <h3>Sumber</h3>
          <ul>
            <li>
              NASA FIRMS, VIIRS 375 m near real-time dari NOAA-20 dan NOAA-21, berkas 7 hari wilayah
              Asia Tenggara.
              {sources.map((source) => (
                <span key={source.sourceId} className="d-seed-source">
                  {source.sourceId}: diunduh {wib(Date.parse(source.retrievedAt))} WIB
                  {source.lastModified
                    ? `, berkas ${wib(Date.parse(source.lastModified))} WIB`
                    : ""}
                  , SHA-256 <code>{source.sha256.slice(0, 12)}</code>
                </span>
              ))}
            </li>
            <li>
              Copernicus DEM GLO-90{meta?.dem ? ` (${number.format(meta.dem.tiles)} tile)` : ""},
              dirata-ratakan menjadi sel {meta?.dem ? `${meta.dem.cellArcSec}″` : "30″"}
              {meta?.detail ? ", dan 6″ untuk area 2° × 2° saat peta diperbesar" : ""}. Tinggi
              terhadap geoid EGM2008.
            </li>
            {meta?.landcover && (
              <li>
                ESA WorldCover 2021 v200 ({number.format(meta.landcover.tiles)} tile), dibaca dari
                overview sekitar 150 m. Peta nasional memakai kelas terbanyak per sel 30″.
              </li>
            )}
            {meta?.features && (
              <li>
                Natural Earth 1:10m: {number.format(meta.features.rivers)} garis sungai,{" "}
                {number.format(meta.features.lakes)} danau, {number.format(meta.features.places)}{" "}
                tempat.
              </li>
            )}
            <li>
              Data hanya dimuat oleh server pengembangan lokal dari <code>.data/seed</code>. Build
              statis tidak memuatnya.
            </li>
            {meta?.firms && <li lang="en">{meta.firms.attribution}</li>}
            {meta?.dem && <li lang="en">{meta.dem.licenceNotice}</li>}
            {meta?.landcover && <li lang="en">{meta.landcover.licenceNotice}</li>}
            {meta?.features && <li lang="en">{meta.features.attribution}</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
