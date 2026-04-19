export type UnitType = 'tank' | 'drone' | 'jet' | 'inf';

interface UnitSilhouetteProps {
  type: UnitType;
  color: string;
  x: number;
  y: number;
  size?: number;
}

/**
 * Four SVG silhouettes ported from the mockup: tank / drone / jet / inf.
 * Rendered as small icons above the troop count in territory nodes.
 */
export function UnitSilhouette({ type, color, x, y, size = 10 }: UnitSilhouetteProps) {
  const half = size / 2;
  return (
    <g transform={`translate(${x - half}, ${y - half})`} opacity="0.85">
      {type === 'tank' && <TankIcon size={size} color={color} />}
      {type === 'drone' && <DroneIcon size={size} color={color} />}
      {type === 'jet' && <JetIcon size={size} color={color} />}
      {type === 'inf' && <InfIcon size={size} color={color} />}
    </g>
  );
}

function TankIcon({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <g fill={color} stroke="none">
      <rect x={s * 0.1} y={s * 0.5} width={s * 0.8} height={s * 0.35} rx="1" />
      <rect x={s * 0.2} y={s * 0.3} width={s * 0.5} height={s * 0.25} rx="1" />
      <rect x={s * 0.55} y={s * 0.2} width={s * 0.35} height={s * 0.12} rx="0.5" />
    </g>
  );
}

function DroneIcon({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <g fill="none" stroke={color} strokeWidth="0.8">
      <circle cx={s * 0.5} cy={s * 0.5} r={s * 0.18} fill={color} />
      <line x1={s * 0.5} y1={s * 0.5} x2={s * 0.1} y2={s * 0.2} />
      <line x1={s * 0.5} y1={s * 0.5} x2={s * 0.9} y2={s * 0.2} />
      <line x1={s * 0.5} y1={s * 0.5} x2={s * 0.1} y2={s * 0.8} />
      <line x1={s * 0.5} y1={s * 0.5} x2={s * 0.9} y2={s * 0.8} />
    </g>
  );
}

function JetIcon({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <polygon
      points={`${s * 0.5},${s * 0.05} ${s * 0.9},${s * 0.85} ${s * 0.5},${s * 0.65} ${s * 0.1},${s * 0.85}`}
      fill={color}
    />
  );
}

function InfIcon({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <g fill={color}>
      <circle cx={s * 0.5} cy={s * 0.22} r={s * 0.18} />
      <path
        d={`M${s * 0.28},${s * 0.9} L${s * 0.35},${s * 0.55} Q${s * 0.5},${s * 0.42} ${s * 0.65},${s * 0.55} L${s * 0.72},${s * 0.9}`}
      />
    </g>
  );
}

/** Deterministic unit type for a territory based on its name hash */
const UNIT_TYPES: UnitType[] = ['tank', 'drone', 'jet', 'inf'];

export function unitTypeForTerritory(name: string): UnitType {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return UNIT_TYPES[h % 4] ?? 'tank';
}
