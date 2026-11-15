// The look plan for KELAPA YARD, in one place. A dusk yard in the tropics:
// warm sand underfoot, deep kelapa green, terracotta stalls, one sunset
// orange accent. Lighting makes every shade the game needs, so no other
// colour appears in the code. The same names are the CSS custom properties
// in index.html.
export const PALETTE = {
  canvas: '#20303a', // dusk sky / fog
  surface: '#2e4a3f', // deep kelapa green (walls, stalls)
  hairline: '#5a6b52', // moss green (crates, trim)
  ink: '#f2ead8', // warm cream (HUD text, bot shirts)
  muted: '#9aa88f', // pale leaf (secondary text)
  accent: '#ff8c42', // sunset orange (sites, tracers, CTAs)
  leaf: '#3f7a4e', // coconut canopy
  terracotta: '#c96f4a', // stall roofs, awnings
  sand: '#c9a86a', // yard ground
  bark: '#6b4a2f', // coconut trunks, posts
};

export function shade(name) {
  return PALETTE[name];
}
