// Character style catalog (BREAKOUT paintball players). Everything a player can look like: skin tones, hair styles
// (built by character-geo.js getHairStyle(i)), outfits, eye colours, headgear, brows and named preset looks. The
// Character constructor resolves a style through resolveStyle(); the locker menu lists the same tables.
//
// APPEND-ONLY: never reorder, remove or restyle an existing entry — saved profiles and bots store indices.
// Every table has a parallel *_NAMES list (same length, same order) for the locker UI.
//
// A style is { hair, skin, outfit, eyes, hat, brows }, all integer indices. Missing fields: the original four derive
// from the character's name seed (so rolled bots vary); the newer optional ones (hat, brows) default to 0 = none /
// classic, so looks saved before those fields existed never change. `randomStyle(rng)` rolls a complete look.

// ---- skin: natural tones with deliberate undertones (the skin shader adds warmth/sheen from the base colour) --------
export const SKIN_TONES = [
  '#ffd9c2', // 0 fair, rosy
  '#eab48e', // 1 light warm (freckled)
  '#b37a52', // 2 tan
  '#6e4429', // 3 deep brown
  '#f9e1d3', // 4 porcelain, cool pink undertone
  '#d9a577', // 5 honey, golden undertone
  '#c29a72', // 6 olive, green-gold undertone
  '#8f5a3a', // 7 chestnut, warm red undertone
  '#4a2c20', // 8 ebony, deep cool undertone
];
export const SKIN_NAMES = ['Rosy', 'Peach', 'Tan', 'Cocoa', 'Porcelain', 'Honey', 'Olive', 'Chestnut', 'Ebony'];

// ---- outfits: BREAKOUT paintball kits. `shirt` = padded jersey (torso + long sleeves), `shorts` = padded pants, `shoe`
// = cleats, `sock` = the elastic pant cuff over the cleat collar, `strap` = harness / pod-pack webbing. `pattern` picks
// the jersey design in the cloth + skin shaders (0 Pro side panels · 1 Sash · 2 Shoulder yoke · 3 Splat camo); the team
// colour is always the accent. Indices are stable (saved profiles store them) — the old tee looks map onto kits.
export const OUTFITS = [
  { shirt: '#f2f2ef', shorts: '#23262d', shoe: '#1d1f24', sole: '#e9e9e6', sock: '#23262d', strap: '#1b1d22', pattern: 0 },
  { shirt: '#24272e', shorts: '#1b1d22', shoe: '#1b1d22', sole: '#2c2f36', sock: '#1b1d22', strap: '#141519', pattern: 1 },
  { shirt: '#bfc5cf', shorts: '#2a2e36', shoe: '#1d1f24', sole: '#d8dade', sock: '#2a2e36', strap: '#1b1d22', pattern: 2 },
  { shirt: '#5c6147', shorts: '#3e4232', shoe: '#2b2622', sole: '#1c1a17', sock: '#3e4232', strap: '#23241c', pattern: 3 },
  { shirt: '#f3efe4', shorts: '#2c3038', shoe: '#f0efea', sole: '#2c3038', sock: '#2c3038', strap: '#1b1d22', pattern: 1 },
  { shirt: '#1f2a44', shorts: '#161b29', shoe: '#161b29', sole: '#f0efea', sock: '#161b29', strap: '#10131c', pattern: 0 },
  { shirt: '#6e6a58', shorts: '#4a4638', shoe: '#3a3226', sole: '#1c1a17', sock: '#4a4638', strap: '#2a281f', pattern: 3 },
  { shirt: '#ebe4d6', shorts: '#41608f', shoe: '#1d1f24', sole: '#ebe4d6', sock: '#41608f', strap: '#1b1d22', pattern: 2 },
  { shirt: '#2b2e36', shorts: '#2b2e36', shoe: '#f0efea', sole: '#1b1d22', sock: '#2b2e36', strap: '#141519', pattern: 2 },
  { shirt: '#e9eaec', shorts: '#8a8f99', shoe: '#23262d', sole: '#f0efea', sock: '#8a8f99', strap: '#23262d', pattern: 0 },
];
export const OUTFIT_NAMES = ['Pro Kit', 'Blackout Sash', 'Steel Yoke', 'Woodland Camo', 'Ivory Sash', 'Navy Pro', 'Desert Camo', 'Harbor Yoke', 'Night Yoke', 'Chalk Pro'];

// ---- natural hair colours (hair / scalp / hairline; the tips carry a little team dye). Picked per look in
// hairColor() — there is no saved field for it, so a look always keeps the same colour.
export const HAIR_COLORS = ['#1c1512', '#3a2417', '#5e3a22', '#8e5429', '#b88b52', '#d9bd84', '#2a2b30', '#6b2f22'];

// ---- eyes: iris gradient [top, bottom] ---------------------------------------------------------------------------
export const IRIS = [
  ['#ffcf3a', '#ff7a00'], // 0 amber
  ['#4ff0dc', '#0b7fb0'], // 1 lagoon
  ['#c9a2ff', '#5b2ad6'], // 2 violet
  ['#a8f56a', '#1d9a4a'], // 3 lime
  ['#ffa3cf', '#d0246e'], // 4 rose
  ['#e6b36a', '#6b3a14'], // 5 hazel
  ['#e4f4ff', '#4f7fc4'], // 6 frost
  ['#ff8f6b', '#b3121c'], // 7 ember
];
export const IRIS_NAMES = ['Amber', 'Lagoon', 'Violet', 'Lime', 'Rose', 'Hazel', 'Frost', 'Ember'];

// ---- hair: built by character-geo.js (STYLES, same order). Natural colour (hairColor), team-dyed tips. Under a
// paintball mask the hair is hidden by the headwrap / beanie / crop (the style still sets the portrait without one). ----
export const HAIR_STYLE_NAMES = ['Swept', 'Spiky', 'Twin Tails', 'Bob', 'Ponytail', 'Mohawk', 'Bun', 'Side Swoop'];
export const HAIR_STYLES = HAIR_STYLE_NAMES.length;

// ---- headgear (optional, `hat`): built into the hair mesh by character-geo.js (HAT_KINDS, same order). Every style's
// hair is re-rooted under the rim so nothing clips; styles whose shape sits on top switch to a hat variant
// (low ponytail, low bun, lower twin ties, back flicks). 0 = none. 4–6 = full paintball masks (goggle + thermal lens,
// vented jaw guard, ear pieces, strap) over a headwrap / beanie / short crop — the BREAKOUT default (MASK_HATS).
export const HATS = ['none', 'cap', 'beanie', 'bucket', 'mask', 'maskBeanie', 'maskCrop'];
export const HAT_NAMES = ['None', 'Snapback', 'Beanie', 'Bucket Hat', 'Pro Mask · Headwrap', 'Team Mask · Beanie', 'White Mask · Crop'];
export const MASK_HATS = [4, 5, 6];
/** true when a (resolved) style wears a paintball mask. */
export const isMasked = (st) => !!st && MASK_HATS.includes(st.hat);

// ---- brows (optional, `brows`): shape of the painted-ink brow strokes. 0 = classic.
export const BROWS = ['classic', 'bold', 'arched', 'straight'];
export const BROW_NAMES = ['Classic', 'Bold', 'Arched', 'Straight'];

// ---- named full looks ("characters") the locker can offer one-click -----------------------------------------------
export const PRESETS = [
  { id: 'rookie', name: 'Rookie', blurb: 'First day on the field. Rental kit, borrowed mask, big grin under it.', style: { hair: 0, skin: 0, outfit: 0, eyes: 0, hat: 4, brows: 0 } },
  { id: 'dash', name: 'Dash', blurb: 'Snap-shooting front player in a blackout sash.', style: { hair: 1, skin: 5, outfit: 1, eyes: 1, hat: 6, brows: 1 } },
  { id: 'pip', name: 'Pip', blurb: 'First to the snake, every single round.', style: { hair: 2, skin: 4, outfit: 4, eyes: 4, hat: 5, brows: 2 } },
  { id: 'coral', name: 'Coral', blurb: 'Back-center anchor. Unbothered.', style: { hair: 3, skin: 3, outfit: 7, eyes: 5, hat: 4, brows: 0 } },
  { id: 'marlo', name: 'Marlo', blurb: 'Pro kit, game face, counts every ball.', style: { hair: 4, skin: 1, outfit: 5, eyes: 7, hat: 6, brows: 1 } },
  { id: 'riptide', name: 'Riptide', blurb: 'Loud, fast, and always on the wire.', style: { hair: 5, skin: 7, outfit: 8, eyes: 3, hat: 4, brows: 3 } },
  { id: 'nori', name: 'Nori', blurb: 'Woodland camo, very patient sniper.', style: { hair: 6, skin: 6, outfit: 3, eyes: 2, hat: 5, brows: 3 } },
  { id: 'suki', name: 'Suki', blurb: 'Too cool for the staging area.', style: { hair: 7, skin: 8, outfit: 2, eyes: 6, hat: 4, brows: 2 } },
  { id: 'kelp', name: 'Kelp', blurb: 'Beanie season, all season, desert camo.', style: { hair: 3, skin: 2, outfit: 6, eyes: 3, hat: 5, brows: 0 } },
  { id: 'skipper', name: 'Skipper', blurb: 'Chalk-white kit, team shell mask.', style: { hair: 0, skin: 5, outfit: 9, eyes: 0, hat: 6, brows: 1 } },
];

const wrap = (v, n) => ((Math.round(v) % n) + n) % n;
/** Normalise a (possibly partial / out-of-range) style to valid indices; unspecified fields derive from the seed. */
export function resolveStyle(st = {}, seed = 0) {
  const hair = wrap(st.hair ?? seed % HAIR_STYLES, HAIR_STYLES);
  const skin = wrap(st.skin ?? (seed >> 3) % SKIN_TONES.length, SKIN_TONES.length);
  const outfit = wrap(st.outfit ?? (hair + skin + (seed >> 6)) % OUTFITS.length, OUTFITS.length);
  const eyes = wrap(st.eyes ?? (seed >> 9) % IRIS.length, IRIS.length);
  // headgear: saved looks keep theirs; a look that never chose one (new profiles, name-seeded bots) wears a mask
  const hat = wrap(st.hat ?? MASK_HATS[(seed >> 12) % MASK_HATS.length], HATS.length);
  const brows = wrap(st.brows ?? 0, BROWS.length);
  return { ...st, hair, skin, outfit, eyes, hat, brows };
}

/** A complete random look (bots, "shuffle" in the locker). rng() → [0, 1). Always a paintball mask (BREAKOUT). */
export function randomStyle(rng = Math.random) {
  const pick = (n) => Math.min(n - 1, (rng() * n) | 0);
  return {
    hair: pick(HAIR_STYLES), skin: pick(SKIN_TONES.length), outfit: pick(OUTFITS.length), eyes: pick(IRIS.length),
    hat: MASK_HATS[pick(MASK_HATS.length)], brows: pick(BROWS.length),
  };
}

/** Natural hair colour of a (resolved) look: stable per look, darker tones more likely on deeper skin. */
export function hairColor(st) {
  const s = resolveStyle(st);
  const lum = new Set([3, 7, 8]).has(s.skin) ? 1 : 0;
  const h = (s.hair * 7 + s.skin * 13 + s.eyes * 5 + s.brows * 3) % 11;
  const pool = lum ? [0, 1, 6, 0, 1, 2, 6, 0, 7, 1, 2] : [0, 1, 2, 3, 4, 5, 6, 2, 7, 3, 1];
  return HAIR_COLORS[pool[h]];
}

/** Swatch colours for UI chips: { skin, eyes: [a, b], shirt, shorts, ... } of a (resolved) style. */
export function styleSwatch(st) {
  const s = resolveStyle(st);
  const o = OUTFITS[s.outfit];
  return { skin: SKIN_TONES[s.skin], eyes: IRIS[s.eyes], shirt: o.shirt, shorts: o.shorts, shoe: o.shoe, sock: o.sock, strap: o.strap };
}

/**
 * Write a resolved style's colours into a character uniform bundle (makeCharUniforms()): outfit colourway + pattern,
 * iris gradient, and the optional face uniforms. The Character constructor calls this.
 */
export function applyStyleUniforms(u, st) {
  const o = OUTFITS[st.outfit] || OUTFITS[0];
  u.uShirt.value.set(o.shirt); u.uShorts.value.set(o.shorts); u.uShoe.value.set(o.shoe);
  u.uSole.value.set(o.sole); u.uSock.value.set(o.sock); u.uStrap.value.set(o.strap); u.uPattern.value = o.pattern;
  const ir = IRIS[st.eyes] || IRIS[0];
  u.uIris.value.set(ir[0]); u.uIris2.value.set(ir[1]);
  if (u.uHairCol) u.uHairCol.value.set(hairColor(st));
}
