import { memo } from 'react';
import { cn } from '@/lib/utils';

/** 9×9 monochrome pixel glyphs that match ObjectPad's ASCII / point-cloud language. `#` = on, `.` = off. */
const GLYPHS = {
  create: ['....#....', '....#....', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '....#....', '....#....'],
  market: ['........#', '.......##', '......#.#', '.#...#...', '#.#.#....', '...#.....', '.........', '#.#.#.#.#', '#########'],
  earn: ['..#####..', '.#.....#.', '#...#...#', '#..###..#', '#...#...#', '#..###..#', '#...#...#', '.#.....#.', '..#####..'],
  burn: ['....#....', '...##....', '...###...', '..####.#.', '.#######.', '.###.###.', '.##...##.', '..##.##..', '...###...'],
  treasury: ['#########', '#.......#', '#.#####.#', '#.#...#.#', '#.#.#.#.#', '#.#...#.#', '#.#####.#', '#.......#', '#########'],
  docs: ['.#######.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.##..#.', '.#.....#.', '.#######.'],
  pair: ['###...###', '#.#...#.#', '###...###', '...#.#...', '....#....', '...#.#...', '###...###', '#.#...#.#', '###...###'],
  log: ['#########', '#.......#', '#.##.##.#', '#.......#', '#.####..#', '#.......#', '#.###...#', '#.......#', '#########'],
} as const;
export type PixelName = keyof typeof GLYPHS;

/** A crisp pixel glyph drawn as SVG squares (scales cleanly, inherits text colour). */
export const PixelIcon = memo(function PixelIcon({ name, size = 16, className }: { name: PixelName; size?: number; className?: string }) {
  const rows = GLYPHS[name];
  return <svg width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true" className={cn('shrink-0', className)} fill="currentColor">
    {rows.flatMap((row, y) => [...row].map((c, x) => c === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1"/> : null))}
  </svg>;
});
