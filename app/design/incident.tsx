// 3D incident review page (ADR 0009), laid out after templates/Kawal Asap Analisis.dc.html.
// Synthetic data only: the place, fire, model, and records are invented.
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import "./incident.css";
import { formatWib } from "./fixture";
import {
  LAYERS,
  PAINT,
  createPainter,
  defaultLayers,
  type LayerId,
  type LayerSettings,
  type Painter,
} from "./incident-paint";
import type { IncidentScene, SceneView, ViewMode } from "./incident-scene";
import {
  CONTAINED_AT,
  INCIDENT,
  INITIAL_TIME,
  IGNITION_AT,
  PATH_LENGTH_KM,
  TIMELINE_END,
  TIMELINE_START,
  areaHectares,
  areaSeries,
  elevationProfile,
  formatNumber,
  headDistance,
  incidentEvents,
  rateOfSpread,
  rateSeries,
  satellitePasses,
  sceneDetections,
  timeAtDistance,
  weatherAt,
  type EventKind,
  type IncidentEvent,
  type SeriesPoint,
} from "./scenario";

const HOUR = 3_600_000;
const PLAY_HOURS_PER_SECOND = 1;
const EXAGGERATIONS = [1, 1.5, 2.5, 4];
const DANGER_MAX = 40;

/** "9 Sep 16.00" in WIB. */
export const wib = (time: number) => formatWib(new Date(time).toISOString()).replace(" WIB", "");
const dayLabel = (time: number) => wib(time).split(" ").slice(0, 2).join(" ");
const tickLabel = (time: number) => {
  const [day, , clock] = wib(time).split(" ");
  return `${day} · ${clock}`;
};

export function IncidentWorkspace() {
  const [time, setTime] = useState(INITIAL_TIME);
  const [playing, setPlaying] = useState(false);
  const [layers, setLayers] = useState<LayerSettings>(defaultLayers);
  const [mode, setMode] = useState<ViewMode>("3d");
  const [exaggeration, setExaggeration] = useState(2.5);
  const timeRef = useRef(time);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let committed = last;
    let current = timeRef.current;
    const tick = (now: number) => {
      current = Math.min(TIMELINE_END, current + ((now - last) * PLAY_HOURS_PER_SECOND * HOUR) / 1000);
      last = now;
      if (now - committed > 50 || current >= TIMELINE_END) {
        committed = now;
        setTime(current);
      }
      if (current >= TIMELINE_END) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const view = useMemo<SceneView>(
    () => ({ time, layers, mode, exaggeration }),
    [time, layers, mode, exaggeration],
  );
  const pick = (next: number) => {
    setPlaying(false);
    setTime(Math.min(TIMELINE_END, Math.max(TIMELINE_START, next)));
  };
  const togglePlay = () => {
    if (!playing && timeRef.current >= TIMELINE_END) setTime(TIMELINE_START);
    setPlaying(!playing);
  };

  return (
    <>
      <IncidentTitle />
      <IncidentSummary />
      <div className="d-row" id="peta">
        <MapCard
          view={view}
          layers={layers}
          setLayers={setLayers}
          setMode={setMode}
          exaggeration={exaggeration}
          setExaggeration={setExaggeration}
        />
        <WeatherPanel time={time} />
      </div>
      <Timeline time={time} playing={playing} togglePlay={togglePlay} pick={pick} />
      <Charts time={time} pick={pick} />
      <DataTables />
      <ModelLimits />
    </>
  );
}

// Title and summary ----------------------------------------------------------------

function IncidentTitle() {
  return (
    <div className="d-title">
      <div>
        <p className="d-eyebrow">Analisis kejadian · prototipe 3D</p>
        <h1>{INCIDENT.name}</h1>
      </div>
      <p className="d-meta">
        <span className="d-dashed">Data sintetis</span>
        <span>{INCIDENT.id}</span>
        <span>
          {wib(TIMELINE_START)} – {wib(TIMELINE_END)} WIB
        </span>
      </p>
    </div>
  );
}

const IncidentSummary = memo(function IncidentSummary() {
  const passes = satellitePasses();
  const covered = passes.filter((pass) => pass.obscured).length;
  const kpis: { label: string; value: string; unit: string; note: string }[] = [
    {
      label: "Luas akhir (model)",
      value: formatNumber(areaHectares(CONTAINED_AT)),
      unit: "ha",
      note: "Model, bukan batas resmi",
    },
    { label: "Mulai (perkiraan)", value: wib(IGNITION_AT), unit: "WIB", note: "Area titik awal perkiraan" },
    {
      label: "Terkendali",
      value: wib(CONTAINED_AT),
      unit: "WIB",
      note: `Durasi ±${Math.round((CONTAINED_AT - IGNITION_AT) / HOUR)} jam`,
    },
    {
      label: "Deteksi satelit",
      value: formatNumber(sceneDetections().length),
      unit: `dari ${passes.length} lintasan`,
      note: `${covered} lintasan tertutup awan`,
    },
    { label: "Penyebab", value: INCIDENT.cause, unit: "", note: "Di luar cakupan Kawal Asap" },
  ];
  const facts: [string, string][] = [
    ["Nama", INCIDENT.name],
    ["ID", INCIDENT.id],
    ["Lokasi", INCIDENT.location],
    ["Status", "Contoh untuk tinjauan desain"],
  ];
  return (
    <section className="d-card" aria-labelledby="ringkasan-judul">
      <div className="d-card-head">
        <h2 id="ringkasan-judul">Ringkasan kejadian</h2>
        <p className="d-sub">{INCIDENT.location} · Contoh untuk tinjauan desain</p>
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
});

// Map ------------------------------------------------------------------------------

const NICE_SCALES = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];

function MapCard({
  view,
  layers,
  setLayers,
  setMode,
  exaggeration,
  setExaggeration,
}: {
  view: SceneView;
  layers: LayerSettings;
  setLayers: (update: (current: LayerSettings) => LayerSettings) => void;
  setMode: (mode: ViewMode) => void;
  exaggeration: number;
  setExaggeration: (value: number) => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const shown = LAYERS.filter((layer) => layers[layer.id].visible).length;
  return (
    <section className="d-card d-map-card" aria-labelledby="peta-judul">
      <h2 id="peta-judul" className="sr-only">
        Peta 3D kejadian
      </h2>
      <IncidentMap
        view={view}
        setMode={setMode}
        exaggeration={exaggeration}
        setExaggeration={setExaggeration}
        panelOpen={layersOpen}
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
                {shown}/{LAYERS.length}
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
        {layersOpen && <LayerPanel layers={layers} setLayers={setLayers} close={() => setLayersOpen(false)} />}
      </IncidentMap>
      {legendOpen && <MapKey layers={layers} />}
    </section>
  );
}

function IncidentMap({
  view,
  setMode,
  exaggeration,
  setExaggeration,
  panelOpen,
  toggles,
  children,
}: {
  view: SceneView;
  setMode: (mode: ViewMode) => void;
  exaggeration: number;
  setExaggeration: (value: number) => void;
  panelOpen: boolean;
  toggles: ReactNode;
  children: ReactNode;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const scaleBarRef = useRef<HTMLSpanElement>(null);
  const scaleTextRef = useRef<HTMLSpanElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const sceneRef = useRef<IncidentScene | null>(null);
  const painterRef = useRef<Painter | null>(null);
  const viewRef = useRef(view);
  const [status, setStatus] = useState<"memuat" | "siap" | "datar">("memuat");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const labelHost = labelsRef.current;
    if (!host || !labelHost) return;
    let disposed = false;
    const flat = () => {
      if (disposed) return;
      // Without WebGL, show the same painted map from above.
      const painter = createPainter();
      painter.canvas.className = "map3d-flat";
      painter.canvas.setAttribute("aria-hidden", "true");
      host.insertBefore(painter.canvas, host.firstChild);
      painter.paint(viewRef.current.time, viewRef.current.layers);
      painterRef.current = painter;
      setStatus("datar");
    };
    import("./incident-scene")
      .then(({ createIncidentScene }) => {
        if (disposed) return;
        try {
          sceneRef.current = createIncidentScene(host, labelHost, viewRef.current, {
            onCamera(heading, kmPerPixel) {
              needleRef.current?.setAttribute("transform", `rotate(${(-heading).toFixed(1)} 24 24)`);
              const length = NICE_SCALES.find((value) => value / kmPerPixel >= 60) ?? 10;
              if (scaleBarRef.current) scaleBarRef.current.style.width = `${(length / kmPerPixel).toFixed(0)}px`;
              if (scaleTextRef.current)
                scaleTextRef.current.textContent =
                  length < 1 ? `${length * 1000} m` : `${formatNumber(length, length % 1 ? 1 : 0)} km`;
            },
            onPointer(reading) {
              const readout = readoutRef.current;
              if (!readout) return;
              readout.hidden = !reading;
              if (reading)
                readout.textContent = `x ${formatNumber(reading.x, 2)} km · y ${formatNumber(reading.y, 2)} km · ${formatNumber(reading.elevation)} m`;
            },
          });
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
      painterRef.current?.canvas.remove();
      painterRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current = view;
    sceneRef.current?.update(view);
    painterRef.current?.paint(view.time, view.layers);
  }, [view]);

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
        aria-label={`Peta ${view.mode === "3d" ? "3D" : "2D"} kejadian sintetis pada ${wib(view.time)} WIB. Tabel di bawah memuat data yang sama.`}
      >
        <div ref={labelsRef} className="map3d-labels" aria-hidden="true" />
      </div>
      {status === "memuat" && <p className="map3d-status">Memuat peta 3D…</p>}
      {status === "datar" && (
        <p className="map3d-status is-notice">Peramban ini tidak mendukung WebGL. Peta tampil datar dari atas.</p>
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
            <path d="M24 39 L29 25 L24 28 L19 25 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <text x="24" y="7.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor">
              U
            </text>
          </g>
        </svg>
      </button>
      <div className="map3d-badges">
        <span className="map3d-badge">Data sintetis · lokasi fiktif</span>
        <span className="map3d-time">{wib(view.time)} WIB</span>
      </div>
      <div className="map3d-toggles">{toggles}</div>
      {children}
      <div className="map3d-foot" hidden={status !== "siap"}>
        <p className="map3d-scale">
          <span ref={scaleBarRef} className="map3d-scale-bar" />
          <span ref={scaleTextRef}>1 km</span>
          <span className="map3d-scale-note"> · di tengah tampilan</span>
        </p>
        <p ref={readoutRef} className="map3d-readout" aria-hidden="true" hidden />
      </div>
      <div className="map3d-tools">
        <fieldset className="map3d-modes" disabled={status !== "siap"}>
          <legend className="sr-only">Mode peta</legend>
          {(["2d", "3d"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={view.mode === value} onClick={() => setMode(value)}>
              {value.toUpperCase()}
            </button>
          ))}
        </fieldset>
        <label className="map3d-select">
          <span className="sr-only">Pembesaran relief</span>
          <select
            value={exaggeration}
            disabled={status !== "siap" || view.mode === "2d"}
            onChange={(event) => setExaggeration(Number(event.target.value))}
          >
            {EXAGGERATIONS.map((value) => (
              <option key={value} value={value}>
                Relief {formatNumber(value, value % 1 ? 1 : 0)}×
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
              d={fullscreen ? "M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" : "M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5"}
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

function LayerPanel({
  layers,
  setLayers,
  close,
}: {
  layers: LayerSettings;
  setLayers: (update: (current: LayerSettings) => LayerSettings) => void;
  close: () => void;
}) {
  const change = (id: LayerId, patch: Partial<LayerSettings[LayerId]>) =>
    setLayers((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  return (
    <div
      className="d-layers"
      id="panel-lapisan"
      role="group"
      aria-labelledby="lapisan-judul"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="d-layers-head">
        <h3 id="lapisan-judul">Lapisan</h3>
        <button type="button" onClick={close}>
          Tutup
        </button>
      </div>
      <ul>
        {LAYERS.map((layer) => {
          const setting = layers[layer.id];
          const percent = Math.round(setting.opacity * 100);
          return (
            <li key={layer.id} className={setting.visible ? undefined : "is-off"}>
              <label>
                <input
                  type="checkbox"
                  checked={setting.visible}
                  onChange={(event) => change(layer.id, { visible: event.target.checked })}
                />
                <span>
                  {layer.label}
                  <small>{layer.note}</small>
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={percent}
                disabled={!setting.visible}
                aria-label={`Kepekatan ${layer.label}`}
                aria-valuetext={`${percent} persen`}
                onChange={(event) => change(layer.id, { opacity: Number(event.target.value) / 100 })}
              />
              <span className="d-layer-value" aria-hidden="true">
                {percent}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Swatch({ kind }: { kind: string }) {
  const shapes: Record<string, ReactNode> = {
    detection: <circle cx="9" cy="9" r="6" fill={PAINT.detectFill} stroke={PAINT.detectStroke} strokeWidth="2" />,
    "detection-low": (
      <circle cx="9" cy="9" r="6" fill="none" stroke={PAINT.detectStroke} strokeWidth="2" strokeDasharray="2.5 2" />
    ),
    front: <path d="M2 12 Q9 3 16 10" fill="none" stroke={PAINT.front} strokeWidth="4" strokeLinecap="round" />,
    perimeter: (
      <rect x="2" y="3" width="14" height="12" rx="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2.5" />
    ),
    path: (
      <>
        <path d="M2 14 L16 4" stroke={PAINT.ink} strokeWidth="5" strokeLinecap="round" />
        <path d="M2 14 L16 4" stroke={PAINT.path} strokeWidth="2.5" strokeLinecap="round" />
      </>
    ),
    burn: (
      <>
        <rect x="1" y="1" width="4" height="16" fill={PAINT.severity[0]} />
        <rect x="5" y="1" width="4" height="16" fill={PAINT.severity[1]} />
        <rect x="9" y="1" width="4" height="16" fill={PAINT.severity[2]} />
        <rect x="13" y="1" width="4" height="16" fill={PAINT.severity[3]} />
      </>
    ),
    ignition: <circle cx="9" cy="9" r="7" fill={PAINT.ignition} opacity="0.6" stroke="#481278" strokeWidth="1.5" />,
    water: <ellipse cx="9" cy="9" rx="7" ry="4.5" fill="rgba(47, 127, 191, 0.55)" stroke={PAINT.drop} strokeWidth="1.5" />,
    firebreak: <path d="M1 9 H17" stroke={PAINT.firebreak} strokeWidth="4" strokeDasharray="5 3" />,
    wind: <path d="M2 13 L13 5 M13 5 L8 5 M13 5 L13 10" stroke="currentColor" strokeWidth="2.2" fill="none" />,
  };
  return (
    <svg className="d-swatch" viewBox="0 0 18 18" aria-hidden="true">
      {shapes[kind]}
    </svg>
  );
}

function MapKey({ layers }: { layers: LayerSettings }) {
  const items: { layer: LayerId; kind: string; text: string }[] = [
    { layer: "detections", kind: "detection", text: "Deteksi satelit, belum tentu kebakaran" },
    { layer: "detections", kind: "detection-low", text: "Deteksi keyakinan rendah" },
    { layer: "spread", kind: "front", text: "Front aktif (model)" },
    { layer: "spread", kind: "perimeter", text: "Perimeter (model)" },
    { layer: "spread", kind: "path", text: "Lintasan kepala api (model)" },
    { layer: "burn", kind: "burn", text: "Keparahan terbakar: rendah → tinggi" },
    { layer: "ignition", kind: "ignition", text: "Area titik awal (perkiraan)" },
    { layer: "suppression", kind: "water", text: "Water bombing" },
    { layer: "suppression", kind: "firebreak", text: "Sekat bakar" },
    { layer: "wind", kind: "wind", text: "Arah angin" },
  ];
  return (
    <div className="d-legend" id="legenda-peta">
      <ul aria-label="Keterangan peta">
        {items
          .filter((item) => layers[item.layer].visible)
          .map((item) => (
            <li key={item.kind}>
              <Swatch kind={item.kind} />
              {item.text}
            </li>
          ))}
      </ul>
      <p>
        Seret untuk memutar, gulir untuk memperbesar, klik kanan atau dua jari untuk menggeser. Medan dibuat di
        peramban; tidak ada tile peta dari server lain.
      </p>
    </div>
  );
}

// Weather ------------------------------------------------------------------------

function WeatherPanel({ time }: { time: number }) {
  const weather = weatherAt(time);
  const before = time < IGNITION_AT;
  const danger = Math.round(weather.dangerIndex);
  const tiles: [string, string, string][] = [
    ["Angin", `${formatNumber(weather.windKmh)} km/jam`, `dari ${weather.windLabel} (${formatNumber(weather.windFrom)}°)`],
    ["Suhu", `${formatNumber(weather.temperatureC)} °C`, "udara"],
    ["Kelembapan", `${formatNumber(weather.humidity)}%`, "relatif"],
    ["Kadar air bahan bakar", `${formatNumber(weather.fuelMoisture)}%`, "bahan bakar halus"],
    ["Laju sebaran", before ? "—" : `${formatNumber(weather.rate)} m/jam`, "kepala api"],
    ["Panjang nyala", before || !weather.flameLengthM ? "—" : `${formatNumber(weather.flameLengthM, 1)} m`, "perkiraan"],
  ];
  return (
    <section className="d-card d-weather" aria-labelledby="cuaca-judul">
      <div>
        <h2 id="cuaca-judul">Cuaca dan perilaku api</h2>
        <p className="d-sub">Model di kepala api · {wib(time)} WIB</p>
      </div>
      <dl className="d-wx">
        <div className="d-wx-index">
          <div>
            <dt>Indeks bahaya</dt>
            <dd>
              <strong>{danger}</strong>
              <small>skala contoh 0–{DANGER_MAX}</small>
            </dd>
          </div>
          <span className="d-wx-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (danger / DANGER_MAX) * 100).toFixed(0)}%` }} />
          </span>
        </div>
        {tiles.map(([term, value, note]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>
              <strong>{value}</strong>
              <small>{note}</small>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Timeline and events ---------------------------------------------------------

const position = (time: number) => (time - TIMELINE_START) / (TIMELINE_END - TIMELINE_START);
const onTrack = (fraction: number) =>
  `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${Math.min(1, Math.max(0, fraction)).toFixed(4)})`;

function EventIcon({ kind }: { kind: EventKind }) {
  const shapes: Record<EventKind, ReactNode> = {
    ignition: <circle cx="8" cy="8" r="5.5" fill={PAINT.front} stroke={PAINT.ink} strokeWidth="1.5" />,
    growth: (
      <path
        d="M8 1.5 C11 5 13 7 13 10 A5 5 0 0 1 3 10 C3 7.5 5 6.5 5.5 4 C6.5 5.5 7 6 8 6.5 Z"
        fill="#d6304a"
        stroke={PAINT.ink}
        strokeWidth="1.2"
      />
    ),
    detection: <circle cx="8" cy="8" r="5.5" fill={PAINT.detectFill} stroke={PAINT.detectStroke} strokeWidth="2" />,
    spot: <path d="M8 2 L14 13.5 H2 Z" fill="#f08aa8" stroke={PAINT.ink} strokeWidth="1.5" strokeLinejoin="round" />,
    water: (
      <path
        d="M8 1.5 C10.5 5.5 13 8 13 10.5 A5 5 0 0 1 3 10.5 C3 8 5.5 5.5 8 1.5 Z"
        fill="#5aa8e6"
        stroke={PAINT.ink}
        strokeWidth="1.2"
      />
    ),
    ridge: <path d="M1 14 L6 5 L9 9 L11 6 L15 14 Z" fill="#c9b48a" stroke={PAINT.ink} strokeWidth="1.4" strokeLinejoin="round" />,
    cloud: (
      <path
        d="M4.5 12.5 A3 3 0 0 1 4.5 6.5 A4 4 0 0 1 12 6 A3.2 3.2 0 0 1 12 12.5 Z"
        fill="#8a8070"
        stroke={PAINT.ink}
        strokeWidth="1.2"
      />
    ),
    firebreak: <rect x="1" y="6" width="14" height="4" rx="1" fill="#c98a4a" stroke={PAINT.ink} strokeWidth="1.2" />,
    contained: (
      <>
        <rect x="2" y="2" width="12" height="12" rx="2" fill="#6cc070" stroke={PAINT.ink} strokeWidth="1.4" />
        <path d="M5 8.5 L7.2 10.5 L11 5.5" fill="none" stroke={PAINT.ink} strokeWidth="1.8" />
      </>
    ),
  };
  return (
    <svg className="d-event-icon" viewBox="0 0 16 16" aria-hidden="true">
      {shapes[kind]}
    </svg>
  );
}

function Timeline({
  time,
  playing,
  togglePlay,
  pick,
}: {
  time: number;
  playing: boolean;
  togglePlay: () => void;
  pick: (time: number) => void;
}) {
  const [eventsOpen, setEventsOpen] = useState(false);
  const events = incidentEvents();
  const passes = satellitePasses();
  const ticks: number[] = [];
  for (let at = TIMELINE_START + 4 * HOUR; at <= TIMELINE_END; at += 12 * HOUR) ticks.push(at);
  const current: IncidentEvent | undefined = [...events].reverse().find((event) => event.at <= time);
  const previous = [...events].reverse().find((event) => event.at < time - 60_000);
  const next = events.find((event) => event.at > time + 60_000);
  return (
    <section className="d-card d-timeline" id="linimasa" aria-labelledby="linimasa-judul">
      <div className="d-card-head">
        <h2 id="linimasa-judul">Linimasa</h2>
        <p className="d-range">
          {wib(TIMELINE_START)} – {wib(TIMELINE_END)} WIB
        </p>
      </div>
      <div className="d-tl-row">
        <div className="d-tl-buttons">
          <button type="button" onClick={() => pick(previous ? previous.at : TIMELINE_START)} aria-label="Ke peristiwa sebelumnya">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M3 2 V14 M14 2 L5 8 L14 14 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <button type="button" className="d-play" onClick={togglePlay} aria-pressed={playing}>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d={playing ? "M3 2 H6.5 V14 H3 Z M9.5 2 H13 V14 H9.5 Z" : "M4 2 L14 8 L4 14 Z"} fill="currentColor" />
            </svg>
            <span className="sr-only">{playing ? "Jeda" : "Putar"}</span>
          </button>
          <button type="button" onClick={() => pick(next ? next.at : TIMELINE_END)} aria-label="Ke peristiwa berikutnya">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M13 2 V14 M2 2 L11 8 L2 14 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <div className="d-track">
          <div className="d-track-events" aria-hidden="true">
            {events.map((event) => (
              <span
                key={event.id}
                className={event === current ? "is-current" : undefined}
                style={{ left: onTrack(position(event.at)) }}
              >
                <EventIcon kind={event.kind} />
              </span>
            ))}
          </div>
          <span className="d-track-line" aria-hidden="true" />
          <span className="d-track-progress" aria-hidden="true" style={{ width: onTrack(position(time)) }} />
          <div className="d-track-passes" aria-hidden="true">
            {passes.map((pass) => (
              <span
                key={pass.id}
                className={pass.obscured ? "is-obscured" : undefined}
                style={{ left: onTrack(position(pass.at)) }}
              />
            ))}
          </div>
          <input
            type="range"
            min={TIMELINE_START}
            max={TIMELINE_END}
            step={10 * 60_000}
            value={Math.round(time / 60_000) * 60_000}
            aria-label="Waktu peta"
            aria-valuetext={`${wib(time)} WIB`}
            onChange={(event) => pick(Number(event.target.value))}
          />
          <div className="d-track-ticks" aria-hidden="true">
            {ticks.map((at, index) => (
              <span key={at} className={index % 2 ? "is-minor" : undefined} style={{ left: onTrack(position(at)) }}>
                {tickLabel(at)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="d-tl-foot">
        <p className="d-last" aria-live="polite">
          <span className="d-eyebrow">Peristiwa terakhir</span>
          {current ? (
            <>
              <EventIcon kind={current.kind} />
              <strong>{current.title}</strong>
              <span className="d-last-time">{wib(current.at)}</span>
              <span className="d-last-desc">{current.detail}</span>
            </>
          ) : (
            <strong>Belum ada</strong>
          )}
        </p>
        <button
          type="button"
          className="d-toggle"
          aria-expanded={eventsOpen}
          aria-controls="semua-peristiwa"
          onClick={() => setEventsOpen(!eventsOpen)}
        >
          {eventsOpen ? "▾" : "▸"} Semua peristiwa ({events.length})
        </button>
      </div>
      {eventsOpen && (
        <ol className="d-events" id="semua-peristiwa">
          {events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                aria-current={event === current ? "true" : undefined}
                onClick={() => pick(event.at)}
              >
                <span className="d-event-head">
                  <span>
                    <EventIcon kind={event.kind} />
                    {event.title}
                  </span>
                  <time dateTime={new Date(event.at).toISOString()}>{wib(event.at)}</time>
                </span>
                <span className="d-event-desc">{event.detail}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="d-note">
        <span className="d-pass-key" aria-hidden="true" /> Lintasan satelit.{" "}
        <span className="d-pass-key is-obscured" aria-hidden="true" /> Tertutup awan: tanpa deteksi bukan berarti api
        padam. Satelit tidak mengamati terus-menerus.
      </p>
    </section>
  );
}

// Charts -----------------------------------------------------------------------

function niceMax(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value || 1));
  return [1, 2, 2.5, 5, 10].map((step) => step * magnitude).find((step) => step >= value) ?? value;
}

const PLOT = { width: 400, height: 180 };

function MetricChart({
  id,
  title,
  unit,
  now,
  points,
  domain,
  ticks,
  formatX,
  formatY,
  marker,
  onPick,
  summary,
}: {
  id: string;
  title: string;
  unit: string;
  now: string;
  points: SeriesPoint[];
  domain: [number, number];
  ticks: { value: number; label: string }[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  marker: number | null;
  onPick?: (x: number) => void;
  summary: string;
}) {
  const [hover, setHover] = useState<SeriesPoint | null>(null);
  const yMax = niceMax(Math.max(...points.map((point) => point.y)));
  const fx = (x: number) => (x - domain[0]) / (domain[1] - domain[0]);
  const fy = (y: number) => 1 - y / yMax;
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${(fx(point.x) * PLOT.width).toFixed(1)} ${(fy(point.y) * PLOT.height).toFixed(1)}`)
    .join("");
  const area = `${line}L${(fx(points[points.length - 1].x) * PLOT.width).toFixed(1)} ${PLOT.height}L${(fx(points[0].x) * PLOT.width).toFixed(1)} ${PLOT.height}Z`;
  const nearest = (x: number) =>
    points.reduce((best, point) => (Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best), points[0]);
  const markerPoint = marker === null ? null : nearest(marker);
  const fromEvent = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return nearest(domain[0] + ((event.clientX - rect.left) / rect.width) * (domain[1] - domain[0]));
  };
  const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
  return (
    <figure className="d-chart">
      <figcaption id={`${id}-judul`}>
        <span>
          <strong>{title}</strong> <span className="d-chart-unit">({unit})</span>
        </span>
        <span className="d-chart-now">{now}</span>
      </figcaption>
      <div className="d-chart-body">
        <div className="d-chart-y" aria-hidden="true">
          <span>{formatNumber(yMax)}</span>
          <span>{formatNumber(yMax / 2)}</span>
          <span>0</span>
        </div>
        <div
          className={`d-chart-plot${onPick ? " is-pickable" : ""}`}
          role="img"
          aria-labelledby={`${id}-judul`}
          aria-describedby={`${id}-ringkas`}
          onPointerMove={(event) => setHover(fromEvent(event))}
          onPointerLeave={() => setHover(null)}
          onClick={(event) => onPick?.(fromEvent(event).x)}
        >
          <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} preserveAspectRatio="none" aria-hidden="true">
            <line className="d-chart-mid" x1="0" x2={PLOT.width} y1={PLOT.height / 2} y2={PLOT.height / 2} />
            <path className="d-chart-area" d={area} />
            <path className="d-chart-line" d={line} />
          </svg>
          {hover && (
            <>
              <span className="d-chart-hover" style={{ left: percent(fx(hover.x)) }} />
              <span
                className="d-chart-tip"
                aria-hidden="true"
                style={{ left: percent(fx(hover.x)), top: percent(fy(hover.y)) }}
              >
                <span>{formatX(hover.x)}</span>
                <strong>{formatY(hover.y)}</strong>
              </span>
            </>
          )}
          {markerPoint && (
            <>
              <span className="d-chart-cursor" style={{ left: percent(fx(markerPoint.x)) }} />
              <span
                className="d-chart-dot"
                style={{ left: percent(fx(markerPoint.x)), top: percent(fy(markerPoint.y)) }}
              />
            </>
          )}
        </div>
      </div>
      <div className="d-chart-x" aria-hidden="true">
        {ticks.map((tick) => {
          const at = fx(tick.value);
          return (
            <span
              key={tick.value}
              className={at < 0.05 ? "is-start" : at > 0.95 ? "is-end" : undefined}
              style={{ left: percent(at) }}
            >
              {tick.label}
            </span>
          );
        })}
      </div>
      <p id={`${id}-ringkas`} className="sr-only">
        {summary}
      </p>
    </figure>
  );
}

function Charts({ time, pick }: { time: number; pick: (time: number) => void }) {
  const timeTicks: { value: number; label: string }[] = [];
  for (let at = TIMELINE_START + 10 * HOUR; at <= TIMELINE_END; at += 24 * HOUR)
    timeTicks.push({ value: at, label: dayLabel(at) });
  const profile = elevationProfile();
  const elevations = profile.map((point) => point.y);
  const head = Math.min(PATH_LENGTH_KM, headDistance(time));
  const started = time > IGNITION_AT;
  const headElevation = profile.reduce(
    (best, point) => (Math.abs(point.x - head) < Math.abs(best.x - head) ? point : best),
    profile[0],
  ).y;
  const area = areaSeries();
  const rate = rateSeries();
  return (
    <section className="d-card" id="grafik" aria-labelledby="grafik-judul">
      <div className="d-card-head">
        <h2 id="grafik-judul">Grafik model</h2>
        <p className="d-sub">Klik grafik waktu untuk memindahkan linimasa.</p>
      </div>
      <div className="d-charts">
        <MetricChart
          id="grafik-luas"
          title="Luas terbakar"
          unit="ha, model"
          now={`${formatNumber(areaHectares(time))} ha`}
          points={area}
          domain={[TIMELINE_START, TIMELINE_END]}
          ticks={timeTicks}
          formatX={(x) => `${wib(x)} WIB`}
          formatY={(y) => `${formatNumber(y)} ha`}
          marker={time}
          onPick={pick}
          summary={`Luas model naik dari 0 menjadi ${formatNumber(area[area.length - 1].y)} hektare. Saat ini ${formatNumber(areaHectares(time))} hektare.`}
        />
        <MetricChart
          id="grafik-laju"
          title="Laju sebaran kepala api"
          unit="m/jam, model"
          now={started ? `${formatNumber(rateOfSpread(time))} m/jam` : "—"}
          points={rate}
          domain={[TIMELINE_START, TIMELINE_END]}
          ticks={timeTicks}
          formatX={(x) => `${wib(x)} WIB`}
          formatY={(y) => `${formatNumber(y)} m/jam`}
          marker={time}
          onPick={pick}
          summary={`Laju model tertinggi pada sore hari dan turun pada malam hari. Saat ini ${formatNumber(rateOfSpread(time))} meter per jam.`}
        />
        <MetricChart
          id="grafik-profil"
          title="Profil ketinggian lintasan"
          unit="m"
          now={started ? `${formatNumber(headElevation)} m · ${formatNumber(head, 1)} km` : "—"}
          points={profile}
          domain={[0, PATH_LENGTH_KM]}
          ticks={[0, 2, 4, 6, 8, 10].map((value) => ({ value, label: value === 0 || value === 10 ? `${value} km` : String(value) }))}
          formatX={(x) => `${formatNumber(x, 1)} km dari titik awal`}
          formatY={(y) => `${formatNumber(y)} m`}
          marker={started ? head : null}
          onPick={(distance) => pick(timeAtDistance(Math.max(0, Math.min(PATH_LENGTH_KM, distance))))}
          summary={`Lintasan kepala api sepanjang ${formatNumber(PATH_LENGTH_KM, 1)} km naik dari ${formatNumber(Math.min(...elevations))} m ke ${formatNumber(Math.max(...elevations))} m.`}
        />
      </div>
    </section>
  );
}

// Tables and method ----------------------------------------------------------

const DataTables = memo(function DataTables() {
  const passes = satellitePasses();
  const detections = sceneDetections();
  const events = incidentEvents();
  const steps: number[] = [];
  for (let at = TIMELINE_START + 4 * HOUR; at <= TIMELINE_END; at += 6 * HOUR) steps.push(at);
  return (
    <section className="d-card d-tables" id="tabel" aria-labelledby="tabel-judul">
      <details>
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
          <div className="table-scroll">
            <table>
              <caption>Lintasan satelit</caption>
              <thead>
                <tr>
                  <th scope="col">Waktu (WIB)</th>
                  <th scope="col">Satelit</th>
                  <th scope="col" className="num">
                    Deteksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {passes.map((pass) => (
                  <tr key={pass.id}>
                    <td>{wib(pass.at)}</td>
                    <td>{pass.satellite}</td>
                    <td className="num">
                      {pass.obscured ? "— tertutup awan" : detections.filter((item) => item.passId === pass.id).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll">
            <table>
              <caption>Luas dan laju model per 6 jam</caption>
              <thead>
                <tr>
                  <th scope="col">Waktu (WIB)</th>
                  <th scope="col" className="num">
                    Luas (ha)
                  </th>
                  <th scope="col" className="num">
                    Laju (m/jam)
                  </th>
                </tr>
              </thead>
              <tbody>
                {steps.map((at) => (
                  <tr key={at}>
                    <td>{wib(at)}</td>
                    <td className="num">{formatNumber(areaHectares(at))}</td>
                    <td className="num">{at < IGNITION_AT ? "—" : formatNumber(rateOfSpread(at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <details className="d-more">
          <summary>Peristiwa penting ({events.length})</summary>
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Peristiwa penting</caption>
              <thead>
                <tr>
                  <th scope="col">Waktu (WIB)</th>
                  <th scope="col">Peristiwa</th>
                  <th scope="col">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{wib(event.at)}</td>
                    <td>{event.title}</td>
                    <td>{event.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className="d-more">
          <summary>Semua deteksi satelit ({detections.length})</summary>
          <div className="table-scroll d-long">
            <table>
              <caption className="sr-only">Deteksi satelit sintetis</caption>
              <thead>
                <tr>
                  <th scope="col">Waktu (WIB)</th>
                  <th scope="col">Satelit</th>
                  <th scope="col">Koordinat lokal (km)</th>
                  <th scope="col">Keyakinan</th>
                </tr>
              </thead>
              <tbody>
                {detections.map((detection) => (
                  <tr key={detection.id}>
                    <td>{wib(detection.at)}</td>
                    <td>{detection.satellite}</td>
                    <td className="mono">
                      {formatNumber(detection.point.x, 2)}, {formatNumber(detection.point.y, 2)}
                    </td>
                    <td>{detection.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </details>
    </section>
  );
});

export function ModelLimits() {
  return (
    <section className="d-card d-method" id="metode" aria-labelledby="metode-judul">
      <div className="d-heading">
        <span className="d-eyebrow">Metode</span>
        <h2 id="metode-judul">Cara membaca prototipe ini</h2>
      </div>
      <div className="d-method-grid">
        <div>
          <h3>Yang tidak bisa ditunjukkan</h3>
          <ul>
            <li>Semua data di halaman ini sintetis. Tempat, nama, dan peristiwa adalah rekaan.</li>
            <li>Sebaran api, perimeter, dan laju adalah gambar model sederhana. Ini bukan pengamatan dan bukan batas resmi.</li>
            <li>
              Deteksi satelit menandai panas di permukaan. Deteksi belum tentu kebakaran, dan satu kebakaran dapat tampil
              sebagai beberapa deteksi.
            </li>
            <li>Area titik awal adalah perkiraan. Prototipe ini tidak menentukan penyebab atau pelaku.</li>
            <li>Halaman ini bukan alat operasi pemadaman, peringatan, atau evakuasi.</li>
          </ul>
        </div>
        <div>
          <h3>Yang ditampilkan</h3>
          <ul>
            <li>Waktu pengamatan satelit dalam WIB, termasuk lintasan yang tertutup awan.</li>
            <li>Label yang memisahkan pengamatan, model, dan catatan pemadaman.</li>
            <li>Tabel yang memuat data peta, untuk pembaca tanpa peta 3D.</li>
            <li>Medan yang dibuat di peramban, tanpa tile peta, citra, atau font dari server lain.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
