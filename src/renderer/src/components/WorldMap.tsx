import { WORLD_H, WORLD_LAND_PATH, WORLD_W } from '../assets/worldLand'

export interface MapMarker {
  lat: number
  lon: number
  color: string
  label: string // native tooltip on hover
  glyph?: string // rendered as rotated text when set; a dot otherwise
  rotation?: number // degrees, 0 = north
}

export interface MapRegion {
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

const px = (lon: number): number => ((lon + 180) / 360) * WORLD_W
const py = (lat: number): number => ((90 - lat) / 180) * WORLD_H

/**
 * Dependency-free dark world map: equirectangular SVG with the committed
 * Natural Earth outline. `region` crops the viewBox (e.g. continental US);
 * marker sizes scale with the crop so glyphs stay readable.
 */
export default function WorldMap({ markers, region }: { markers: MapMarker[]; region?: MapRegion }): JSX.Element {
  const x = region ? px(region.lonMin) : 0
  const y = region ? py(region.latMax) : 0
  const w = region ? px(region.lonMax) - x : WORLD_W
  const h = region ? py(region.latMin) - y : WORLD_H
  const glyphSize = w / 55
  const dotR = w / 220
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img">
      <rect x={x} y={y} width={w} height={h} fill="#050505" />
      <path d={WORLD_LAND_PATH} fill="#101010" stroke="#2a2a2a" strokeWidth={w / 1000} />
      {markers.map((m, i) =>
        m.glyph ? (
          <text
            key={i}
            x={px(m.lon)}
            y={py(m.lat)}
            fill={m.color}
            fontSize={glyphSize}
            textAnchor="middle"
            dominantBaseline="central"
            // ✈ (U+2708) points east in common fonts → offset heading by −90°.
            transform={`rotate(${(m.rotation ?? 90) - 90} ${px(m.lon)} ${py(m.lat)})`}
          >
            {m.glyph}
            <title>{m.label}</title>
          </text>
        ) : (
          <circle key={i} cx={px(m.lon)} cy={py(m.lat)} r={dotR} fill={m.color}>
            <title>{m.label}</title>
          </circle>
        )
      )}
    </svg>
  )
}
