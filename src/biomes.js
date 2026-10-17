// Depth biomes: the cavern's colours shift as you go deeper, so progress is
// visible. They blend into each other and cycle after the last one.

import { CONFIG } from './config.js';

const ART = CONFIG.art;

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// Biome index (can exceed the list; it cycles) and blend progress at depth y.
function locate(y) {
  const meters = Math.max(0, y / CONFIG.world.unitsPerMeter);
  const i = Math.floor(meters / ART.biomeLength);
  const into = meters - i * ART.biomeLength;
  const t = Math.max(0, Math.min(1, (into - (ART.biomeLength - ART.biomeBlend)) / ART.biomeBlend));
  return { i, t };
}

const at = (i) => ART.biomes[i % ART.biomes.length];

export function biomeColors(y) {
  const { i, t } = locate(y);
  const a = at(i);
  const b = at(i + 1);
  return { air: mix(a.air, b.air, t), wall: mix(a.wall, b.wall, t), rock: mix(a.rock, b.rock, t) };
}

export function biomeName(y) {
  return at(locate(y).i).name;
}

export const rgb = (c, alpha = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
