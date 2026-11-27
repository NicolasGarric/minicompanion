import { useId } from 'react';
import { cleanCrest, type CrestSpec } from '../lib/companies';

/**
 * Company crest drawn from a few numbers (no uploaded image, so no trademark logo can appear):
 * a shape, a division of the field in two inks, a pattern, a symbol in the third ink.
 * Riso palette of the app plus three neighbours.
 */
export const INKS = ['#1d2a5b', '#ff4f7b', '#ffd23f', '#f4ecdc', '#2f8f83', '#16161a'];

// Outlines on a 100 × 120 box
const SHAPES = [
  'M10 8h80v52c0 30-22 46-40 54C32 106 10 90 10 60z', // heater shield
  'M10 8h80v70c0 14-10 22-20 26l-20 10-20-10c-10-4-20-12-20-26z', // rounded shield
  'M50 4l42 20v40c0 26-20 42-42 52C28 106 8 90 8 64V24z', // pointed top
  'M50 14a46 46 0 1 1 0 92a46 46 0 1 1 0-92z', // roundel
  'M14 6h72v108L50 92 14 114z', // banner
  'M50 4l44 28v56L50 116 6 88V32z', // hexagon
];

// Second-ink half of the field, clipped by the shape
const DIVISIONS = [
  '',
  'M0 0h50v120H0z', // per pale
  'M0 60h100v60H0z', // per fess
  'M0 0h100L0 120z', // per bend
  'M0 0h50v60H0zM50 60h50v60H50z', // quarterly
  'M0 40h100v40H0z', // fess
];

function Pattern({ kind, color }: { kind: number; color: string }) {
  const lines: JSX.Element[] = [];
  if (kind === 1) for (let i = -120; i < 120; i += 14) lines.push(<path key={i} d={`M${i} 0l120 120`} stroke={color} strokeWidth="3" />);
  if (kind === 2) for (let y = 8; y < 120; y += 12) for (let x = 8 + ((y / 12) % 2) * 6; x < 100; x += 12) lines.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill={color} />);
  if (kind === 3) for (let y = 10; y < 120; y += 14) lines.push(<path key={y} d={`M0 ${y}h100`} stroke={color} strokeWidth="2.5" />);
  if (kind === 4) for (let y = 0; y < 120; y += 16) lines.push(<path key={y} d={`M0 ${y + 8}l12.5-8 12.5 8 12.5-8 12.5 8 12.5-8 12.5 8 12.5-8 12.5 8`} fill="none" stroke={color} strokeWidth="2.5" />);
  if (kind === 5) lines.push(<path key="b" d="M0 0h100v120H0z" fill="none" stroke={color} strokeWidth="14" />);
  return <g opacity="0.55">{lines}</g>;
}

// Symbols centred on (50, 56), about 44 units wide
const SYMBOLS = [
  'M50 30l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z', // star
  'M38 32h24l-4 8v18l6 6v8H36v-8l6-6V40z', // paint pot
  'M36 36h28v28H36zM44 44a2 2 0 1 0 0.1 0M56 56a2 2 0 1 0 0.1 0M50 50a2 2 0 1 0 0.1 0', // die
  'M50 28l20 28-20 28-20-28z', // lozenge
  'M30 40h40v6l-6 4v22H36V50l-6-4z', // tower
  'M50 30c10 8 18 16 18 28a18 18 0 0 1-36 0c0-12 8-20 18-28z', // drop
  'M34 76l32-44M66 76L34 32', // crossed swords
  'M50 30a24 24 0 1 0 0 48a18 18 0 1 1 0-48z', // moon
  'M30 62l10-24 10 14 10-14 10 24z', // crown
  'M50 30v44M30 50h40', // cross
  'M40 30h20v12l10 6-10 6v20H40V54l-10-6 10-6z', // banner pole / helm
  'M50 32a20 20 0 1 1 0 40a20 20 0 1 1 0-40zM50 44a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', // ring
];
const STROKED = new Set([6, 9]);

export function Crest({ crest, size = 48, title }: { crest: unknown; size?: number; title?: string }) {
  const c: CrestSpec = cleanCrest(crest);
  const id = useId().replace(/:/g, '');
  const [a, b, s] = c.inks.map((i) => INKS[i]);
  const shape = SHAPES[c.shape];
  const sym = SYMBOLS[c.symbol];
  return (
    <svg className="crest" width={size} height={size * 1.2} viewBox="0 0 100 120" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <clipPath id={`crest-${id}`}><path d={shape} /></clipPath>
      </defs>
      <g clipPath={`url(#crest-${id})`}>
        <rect width="100" height="120" fill={a} />
        {DIVISIONS[c.division] && <path d={DIVISIONS[c.division]} fill={b} />}
        <Pattern kind={c.pattern} color={c.division ? s : b} />
      </g>
      {STROKED.has(c.symbol)
        ? <path d={sym} fill="none" stroke={s} strokeWidth="8" strokeLinecap="round" />
        : <path d={sym} fill={s} stroke={INKS[0] === s ? INKS[3] : INKS[0]} strokeWidth="2" fillRule="evenodd" />}
      <path d={shape} fill="none" stroke="#1d2a5b" strokeWidth="4" />
    </svg>
  );
}
