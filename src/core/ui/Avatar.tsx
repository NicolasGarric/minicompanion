/** Initials avatar with a colour derived from the name (no upload needed). */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hash % 360} 45% 38%)` }}
    >
      {initials || '?'}
    </span>
  );
}
