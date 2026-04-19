import type { TerritoryState } from '@riskrask/engine';
import type { TerritoryName } from '@riskrask/engine';
import { UnitSilhouette, unitTypeForTerritory } from './UnitSilhouette';

interface NodeProps {
  name: TerritoryName;
  territory: TerritoryState;
  /** Color string (hex) for the owner's faction */
  ownerColor: string;
  owned: boolean;
  selected: boolean;
  targetable: boolean;
  onSelect: (name: TerritoryName) => void;
  onHover: (name: TerritoryName | null) => void;
}

const HEX_W = 22;
const HEX_H = 22;

/**
 * One territory marker: hex shell, unit silhouette, count, name label.
 * Props in, JSX out — no global store reads.
 */
export function Node({
  name,
  territory,
  ownerColor,
  owned,
  selected,
  targetable,
  onSelect,
  onHover,
}: NodeProps) {
  const { x, y } = territory;
  const unitType = unitTypeForTerritory(name);

  const strokeColor = selected
    ? 'var(--hot)'
    : targetable
      ? 'rgba(255,255,100,0.7)'
      : ownerColor;

  const strokeWidth = selected ? 2 : targetable ? 1.5 : 1;
  const fillColor = owned ? `${ownerColor}22` : 'rgba(10,15,20,0.7)';

  return (
    <g
      data-territory={name}
      onClick={() => onSelect(name)}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* Hex outline shell */}
      <HexPath
        cx={x}
        cy={y}
        w={HEX_W}
        h={HEX_H}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />

      {/* Unit silhouette — top half of hex */}
      {territory.armies > 0 && (
        <UnitSilhouette
          type={unitType}
          color={ownerColor}
          x={x}
          y={y - 4}
          size={9}
        />
      )}

      {/* Underline divider */}
      <line
        x1={x - HEX_W / 2 + 4}
        y1={y + 1}
        x2={x + HEX_W / 2 - 4}
        y2={y + 1}
        stroke={strokeColor}
        strokeWidth="0.5"
        opacity="0.5"
      />

      {/* Troop count */}
      <text
        x={x}
        y={y + 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="7"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="500"
        fill={selected ? 'var(--hot)' : ownerColor}
      >
        {territory.armies > 0 ? territory.armies : '·'}
      </text>

      {/* Territory name label (below hex) */}
      <text
        x={x}
        y={y + HEX_H / 2 + 7}
        textAnchor="middle"
        fontSize="6"
        fontFamily="'JetBrains Mono', monospace"
        fill="rgba(140,155,175,0.7)"
        letterSpacing="0.04em"
      >
        {abbreviate(name)}
      </text>

      {/* Hot accent ring if selected */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={HEX_W / 2 + 5}
          fill="none"
          stroke="var(--hot)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.6"
        />
      )}
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

  return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

function abbreviate(name: string): string {
  if (name.length <= 8) return name;
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
