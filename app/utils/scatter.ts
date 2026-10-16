// Activity icons scattered behind an event hero without banner art (docs/design.md, Imagery).
const ICONS = ['i-lucide-dices', 'i-lucide-gamepad-2', 'i-lucide-calendar'];

export interface ScatteredIcon {
  name: string;
  style: {
    left: string;
    top: string;
    width: string;
    height: string;
    opacity: number;
    rotate: string;
  };
}

/** Mulberry32: a small seeded generator, so the server and the browser draw the same layout. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One icon in about half the cells of a `cols` × `rows` grid, at a random spot inside its cell,
 * so icons never overlap, with a random size (14 to 36 px), angle and strength.
 */
export function scatterIcons(cols: number, rows: number, seed: number): ScatteredIcon[] {
  const next = random(seed);
  const icons: ScatteredIcon[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (next() < 0.5) continue;
      const size = 14 + Math.round(next() * 22);
      const opacity = 0.14 + next() * 0.2;
      const angle = Math.round((next() - 0.5) * 40);
      const left = ((x + 0.08 + next() * 0.42) / cols) * 100;
      const top = ((y + 0.08 + next() * 0.4) / rows) * 100;
      icons.push({
        name: ICONS[Math.floor(next() * ICONS.length)]!,
        style: {
          left: `${left.toFixed(1)}%`,
          top: `${top.toFixed(1)}%`,
          width: `${String(size)}px`,
          height: `${String(size)}px`,
          opacity: Number(opacity.toFixed(2)),
          rotate: `${String(angle)}deg`,
        },
      });
    }
  }
  return icons;
}
