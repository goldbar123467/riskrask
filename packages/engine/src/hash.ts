function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export function hashState(s: unknown): string {
  const str = canonical(s);
  let h1 = 0xcbf29ce4n;
  let h2 = 0x84222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    const c = BigInt(str.charCodeAt(i));
    h1 = ((h1 ^ c) * prime) & 0xffffffffffffffffn;
    h2 = ((h2 ^ (c << 7n)) * prime) & 0xffffffffffffffffn;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}
