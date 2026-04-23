import type { TerritoryState } from '@riskrask/engine';
import type { TerritoryName } from '@riskrask/engine';
import { memo, useMemo } from 'react';
import { UnitSilhouette, unitTypeForTerritory } from './UnitSilhouette';

interface NodeProps {
  name: TerritoryName;
  territory: TerritoryState;
  /** Color string (hex) for the owner's faction */
  ownerColor: string;
  owned: boolean;
  selected: boolean;
  targetable: boolean;
  /** Human-readable continent name for the tooltip, e.g. "North America". */
  continent: string;
  onSelect: (name: TerritoryName) => void;
  onHover: (name: TerritoryName | null) => void;
}

const HEX_W = 32;
const HEX_H = 32;

/**
 * One territory marker: hex shell, centered unit silhouette, pointer arrow,
 * and a name label below. Troop count rides as a small badge on the lower
 * edge of the hex so the silhouette stays the dominant glyph.
 */
function NodeImpl({
  name,
  territory,
  ownerColor,
  owned,
  selected,
  targetable,
  continent,
  onSelect,
  onHover,
}: NodeProps) {
  const { x, y } = territory;
  const unitType = unitTypeForTerritory(name);

  // Stable per-(x,y) string outputs so the <g> transform and pointer arrow
  // don't re-fire CSS keyframes / re-alloc path data on every tick.
  const transformOrigin = useMemo(() => `${x}px ${y}px`, [x, y]);
  const pointerPath = useMemo(
    () => `M ${x - 3},${y + 8} L ${x + 3},${y + 8} L ${x},${y + 11} Z`,
    [x, y],
  );

  const strokeColor = selected ? 'var(--hot)' : targetable ? 'var(--warn)' : ownerColor;
  const strokeWidth = selected ? 2 : targetable ? 1.6 : 1.2;
  const fillColor = owned ? `${ownerColor}1f` : 'rgba(10,15,20,0.55)';

  const armyWord = territory.armies === 1 ? 'army' : 'armies';
  const tooltipText =
    territory.adj.length > 0
      ? `${name}: ${territory.armies} ${armyWord} · ${continent} · adjacent to ${territory.adj.join(', ')}`
      : `${name}: ${territory.armies} ${armyWord} · ${continent}`;

  const label = displayName(name);

  // Unique per-node filter id so multiple glow filters never collide.
  const glowId = `node-glow-${name.replace(/\s+/g, '-')}`;

  return (
    <g
      data-territory={name}
      onClick={() => onSelect(name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(name);
      }}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
      style={{
        cursor: 'pointer',
        transformOrigin,
        transformBox: 'fill-box',
        transition: 'transform 160ms var(--ease-out-fast)',
      }}
      className="rr-node"
      tabIndex={0}
      aria-label={name}
    >
      <title>{tooltipText}</title>

      {selected && (
        <defs>
          <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      {/* Soft pulsing ring around selected node. */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={HEX_W / 2 + 3}
          fill="none"
          stroke="var(--hot)"
          strokeWidth="0.9"
          opacity="0.55"
          style={{ animation: 'pulseGlow 1600ms ease-in-out infinite' }}
          className="rr-anim-pulseGlow"
        />
      )}

      {/* Hex outline shell */}
      <g
        style={{
          filter: selected ? `url(#${glowId})` : undefined,
          transition: 'filter 180ms var(--ease-out-fast)',
        }}
      >
        <HexPath
          cx={x}
          cy={y}
          w={HEX_W}
          h={HEX_H}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      </g>

      {/* Unit silhouette — centered in hex */}
      {territory.armies > 0 && (
        <UnitSilhouette type={unitType} color={ownerColor} x={x} y={y - 2} size={14} />
      )}

      {/* Pointer arrow below icon */}
      <path d={pointerPath} fill={strokeColor} opacity={selected ? 1 : 0.7} />

      {/* Troop count — small badge centered under the hex body */}
      <text
        x={x}
        y={y + HEX_H / 2 - 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="6.5"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="600"
        fill={selected ? 'var(--hot)' : ownerColor}
        opacity="0.95"
      >
        {territory.armies > 0 ? territory.armies : ''}
      </text>

      {/* Territory name label (below hex) */}
      <text
        x={x}
        y={y + HEX_H / 2 + 9}
        textAnchor="middle"
        fontSize="6.5"
        fontFamily="'JetBrains Mono', monospace"
        fill="rgba(180,190,210,0.72)"
        letterSpacing="0.12em"
        fontWeight="500"
      >
        {label}
      </text>
    </g>
  );
}

function HexPath({
  cx,
  cy,
  w,
  h,
  fill,
  stroke,
  strokeWidth,
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const hw = w / 2;
  const hh = h / 2;
  const q = hw * 0.4;
  // Clipped hexagon path
  const d = [
    `M ${cx - hw + q},${cy - hh}`,
    `L ${cx + hw - q},${cy - hh}`,
    `L ${cx + hw},${cy}`,
    `L ${cx + hw - q},${cy + hh}`,
    `L ${cx - hw + q},${cy + hh}`,
    `L ${cx - hw},${cy}`,
    'Z',
  ].join(' ');

  return (
    <path
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      style={{ transition: 'stroke 180ms var(--ease-out-fast), stroke-width 180ms linear' }}
    />
  );
}

/** Short-form territory label used below the hex — matches screenshot style. */
const ABBREV: Readonly<Record<string, string>> = Object.freeze({
  Alaska: 'ALASKA',
  'Northwest Territory': 'N. TERRITORY',
  Greenland: 'GREENLAND',
  Alberta: 'ALBERTA',
  Ontario: 'ONTARIO',
  Quebec: 'QUEBEC',
  'Western US': 'WESTERN US',
  'Eastern US': 'EASTERN US',
  'Central America': 'C. AMERICA',
  Venezuela: 'VENEZUELA',
  Brazil: 'BRAZIL',
  Peru: 'PERU',
  Argentina: 'ARGENTINA',
  Iceland: 'ICELAND',
  Scandinavia: 'SCANDINAVIA',
  'Great Britain': 'GREAT BRITAIN',
  'Northern Europe': 'N. EUROPE',
  Ukraine: 'UKRAINE',
  'Southern Europe': 'S. EUROPE',
  'Western Europe': 'W. EUROPE',
  'North Africa': 'N. AFRICA',
  Egypt: 'EGYPT',
  'East Africa': 'E. AFRICA',
  Congo: 'CONGO',
  'South Africa': 'S. AFRICA',
  Madagascar: 'MADAGASCAR',
  Ural: 'URAL',
  Siberia: 'SIBERIA',
  Yakutsk: 'YAKUTSK',
  Kamchatka: 'KAMCHATKA',
  Irkutsk: 'IRKUTSK',
  Mongolia: 'MONGOLIA',
  Japan: 'JAPAN',
  Afghanistan: 'AFGHANISTAN',
  China: 'CHINA',
  'Middle East': 'MIDDLE EAST',
  India: 'INDIA',
  Siam: 'SIAM',
  Indonesia: 'INDONESIA',
  'New Guinea': 'NEW GUINEA',
  'Western Australia': 'W. AUSTRALIA',
  'Eastern Australia': 'E. AUSTRALIA',
});

function displayName(name: string): string {
  return ABBREV[name] ?? name.toUpperCase();
}

export const Node = memo(NodeImpl);
