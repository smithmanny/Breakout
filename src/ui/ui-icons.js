// BREAKOUT UI — inline SVG icon set, input glyphs, logo and illustrations.
// Everything is a markup string (cheap to clone via innerHTML) using currentColor / CSS classes for team ink:
//   .iw-fa = accent/team A ink, .iw-fb = accent/team B ink (see ui.css).
import { esc, splatShape, blobPath } from './ui-util.js';

const K = '#15121c';        // outline ink
const DK = '#2b2735';       // dark plastic
const LT = '#e4e8ef';       // light metal/plastic
const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const svg = (body, vb = '0 0 64 64', cls = '') => `<svg class="iw-ico ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

// ------------------------------------------------------------------ weapons / subs / specials (two-tone, ink = currentColor)
export const WEAPON_ICONS = {
  shooter: svg(`<g ${O}>
      <path d="M17 37 L13.5 53.5 Q13 57 16.5 57 L22.5 57 Q25.5 57 26 54 L29 38 Z" fill="${DK}"/>
      <rect x="17.5" y="7.5" width="18" height="17" rx="7" fill="#f4f8ff"/>
      <path d="M8 26.5 Q8 22 12.5 22 L44 22 Q48.5 22 48.5 26.5 L48.5 35.5 Q48.5 40 44 40 L12.5 40 Q8 40 8 35.5 Z" fill="currentColor"/>
      <rect x="47" y="25.5" width="9" height="11" rx="2.5" fill="${LT}"/>
      <rect x="54.5" y="23" width="5.5" height="16" rx="2" fill="${DK}"/>
      <path d="M29.5 40.5 Q31 47 36.5 47" fill="none"/>
    </g>
    <rect x="20.5" y="14.5" width="12" height="8" rx="3.5" fill="currentColor"/>
    <path d="M13.5 27 L39 27" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    <circle cx="22.5" cy="12" r="1.9" fill="#fff"/>`),
  roller: svg(`<path d="M31 33 L51 6" stroke="${K}" stroke-width="9" stroke-linecap="round"/>
    <path d="M31 33 L51 6" stroke="${LT}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M44 15.5 L51 6" stroke="${K}" stroke-width="10" stroke-linecap="round"/>
    <path d="M44 15.5 L51 6" stroke="${DK}" stroke-width="4.2" stroke-linecap="round"/>
    <g ${O}>
      <path d="M18 38 L18 31 Q18 29 20 29 L42 29 Q44 29 44 31 L44 38" fill="none" stroke-width="3.4"/>
      <rect x="8" y="35" width="48" height="19" rx="8" fill="currentColor"/>
      <rect x="4" y="37" width="7" height="15" rx="2.5" fill="${DK}"/>
      <rect x="53" y="37" width="7" height="15" rx="2.5" fill="${DK}"/>
      <path d="M22 53.5 Q22 60 25 60 Q28 60 28 53.5" fill="currentColor"/>
      <path d="M40 53.5 Q40 57 42 57 Q44 57 44 53.5" fill="currentColor"/>
    </g>
    <path d="M14 40.5 L50 40.5" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  charger: svg(`<g ${O}>
      <path d="M3.5 29 L15 26 L16.5 40 L7 46.5 Q3.5 47 3.5 43.5 Z" fill="${DK}"/>
      <path d="M22 37.5 L19 50.5 Q18.5 53.5 21.5 53.5 L26.5 53.5 L30 37.5 Z" fill="${DK}"/>
      <rect x="35" y="28" width="23" height="6.5" rx="2" fill="${LT}"/>
      <rect x="56" y="26" width="5.5" height="10.5" rx="1.8" fill="${DK}"/>
      <rect x="12.5" y="24.5" width="25" height="14" rx="4.5" fill="currentColor"/>
      <rect x="23" y="20.5" width="5" height="5" fill="${DK}"/>
      <rect x="15" y="12.5" width="22" height="9" rx="3.5" fill="${DK}"/>
      <rect x="40" y="25.5" width="3.6" height="11.5" rx="1.6" fill="currentColor"/>
      <rect x="46" y="25.5" width="3.6" height="11.5" rx="1.6" fill="currentColor"/>
    </g>
    <circle cx="34" cy="17" r="2.6" fill="currentColor"/>
    <path d="M17 29 L33 29" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  blaster: svg(`<g ${O}>
      <path d="M17 41 L13.5 55 Q13 58.5 16.5 58.5 L22.5 58.5 L27 43 Z" fill="${DK}"/>
      <path d="M15 18 Q24.5 5.5 34 18" fill="none" stroke-width="4.2"/>
      <path d="M35 21.5 L53.5 19.5 Q60 19.5 60 26 L60 36 Q60 42.5 53.5 42.5 L35 40.5 Z" fill="${LT}"/>
      <ellipse cx="58" cy="31" rx="3.6" ry="10.5" fill="${DK}"/>
      <circle cx="24.5" cy="30.5" r="15.5" fill="currentColor"/>
      <rect x="36.5" y="20.5" width="5.5" height="21" rx="2.2" fill="currentColor"/>
    </g>
    <ellipse cx="19.5" cy="24.5" rx="5.2" ry="3.6" fill="#fff" fill-opacity=".6"/>`),
  // twin pistols: the back one offset down-right, both with the team fin on the slide
  dualies: svg(`<g ${O}>
      <g transform="translate(15 16)">
        <path d="M9 21 L6 36.5 Q5.6 39 8 39 L13 39 Q15 39 15.5 37 L18 22 Z" fill="${DK}"/>
        <path d="M17 4 L23 -1.5 L26 4 Z" fill="currentColor"/>
        <rect x="3" y="4" width="33" height="12" rx="5" fill="${LT}"/>
        <rect x="34.5" y="7" width="8" height="6.5" rx="2" fill="${DK}"/>
        <path d="M5 16.5 L32 16.5 L30 21.5 L7 21.5 Z" fill="${DK}"/>
      </g>
      <path d="M11 25 L7.5 41.5 Q7 44 9.5 44 L15 44 Q17 44 17.5 42 L20.5 26 Z" fill="${DK}"/>
      <path d="M19 8 L25.5 2 L28.5 8 Z" fill="currentColor"/>
      <rect x="4.5" y="8" width="35" height="13" rx="5.5" fill="${LT}"/>
      <rect x="38" y="11" width="9" height="7" rx="2.2" fill="${DK}"/>
      <path d="M6.5 21 L35 21 L32.5 26 L9 26 Z" fill="${DK}"/>
      <rect x="15" y="12" width="9" height="4" rx="2" fill="currentColor"/>
    </g>
    <path d="M9 12.5 L30 12.5" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>`),
  // bucket mid-heave: ink wave curling out over the lip with a trail of globs
  slosher: svg(`<g ${O}>
      <path d="M10 22 L7 25 Q6 27 8.5 28 L12 29" fill="none" stroke-width="3.4"/>
      <path d="M12 24 L41 20 L44 51 Q44.5 55 40.5 55.5 L22.5 58 Q18.5 58.5 18 54.5 Z" fill="${LT}"/>
      <path d="M14.4 34 L42.4 30.2 L43.2 38.6 L15.6 42.4 Z" fill="currentColor"/>
      <path d="M11 24 Q26 12 42 19.5 Q49 11 58 13 Q53 17 52.5 22 Q51 27 45 27 Q38 26 33 22.5 Q22 26 11 24 Z" fill="currentColor"/>
      <circle cx="56" cy="25" r="3.2" fill="currentColor"/><circle cx="59.5" cy="33" r="2.3" fill="currentColor"/>
    </g>
    <path d="M19 45 L38 42.6" stroke="${K}" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>
    <path d="M40 15.5 Q47 11.5 53 13" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>`),
  // rotary splatling: windowed ink drum on top, housing, six-barrel cluster, grip + foregrip
  splatling: svg(`<g ${O}>
      <path d="M14 38 L11 51.5 Q10.6 54 13 54 L18 54 Q20 54 20.5 52 L23 39 Z" fill="${DK}"/>
      <path d="M32 38 L31 47 Q31 49.5 33.5 49.5 L36 49.5 Q38 49.5 38 47.5 L38.5 38 Z" fill="${DK}"/>
      <rect x="37" y="26.5" width="23" height="11" rx="2.5" fill="${DK}"/>
      <rect x="6" y="24" width="34" height="15.5" rx="5" fill="${LT}"/>
      <circle cx="21" cy="15" r="10.5" fill="currentColor"/>
      <rect x="40" y="24.5" width="4.4" height="15" rx="1.6" fill="${LT}"/>
      <rect x="51.5" y="25" width="4" height="14" rx="1.6" fill="${LT}"/>
    </g>
    <path d="M41 30 L60 30 M41 34 L60 34" stroke="${LT}" stroke-width="1.6"/>
    <circle cx="21" cy="15" r="4.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.2"/>
    <path d="M11 29.5 L33 29.5" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>`),
};

export const SUB_ICONS = {
  bomb: svg(`<g ${O}>
      <rect x="26.5" y="6" width="11" height="10" rx="3" fill="${DK}"/>
      <path d="M32 13 C38 13 53 39 53 46 C53 53 46 56.5 32 56.5 C18 56.5 11 53 11 46 C11 39 26 13 32 13 Z" fill="currentColor"/>
    </g>
    <circle cx="32" cy="43" r="4.6" fill="#fff" stroke="${K}" stroke-width="2.5"/>
    <path d="M25 29 Q21.5 35 19.5 42" stroke="#fff" stroke-opacity=".6" stroke-width="3.4" fill="none" stroke-linecap="round"/>`),
};

export const SPECIAL_ICONS = {
  slam: svg(`<g ${O}>
      <ellipse cx="32" cy="51" rx="25" ry="7" fill="none" stroke="currentColor" stroke-width="4.6"/>
      <ellipse cx="32" cy="51" rx="25" ry="7" fill="none" stroke-width="1.4"/>
      <path d="M32 45 L15 25.5 L24.5 25.5 L24.5 5 L39.5 5 L39.5 25.5 L49 25.5 Z" fill="currentColor"/>
      <circle cx="7" cy="36" r="3.4" fill="currentColor"/>
      <circle cx="57" cy="36" r="3.4" fill="currentColor"/>
      <circle cx="12" cy="27" r="2.2" fill="currentColor"/>
      <circle cx="52" cy="27" r="2.2" fill="currentColor"/>
    </g>
    <path d="M28.5 9 L28.5 26" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  storm: svg(`<g ${O}>
      <path d="M20 42 L16 54" stroke="${K}" stroke-width="8"/><path d="M20 42 L16 54" stroke="currentColor" stroke-width="3.6"/>
      <path d="M32 42 L28 57" stroke="${K}" stroke-width="8"/><path d="M32 42 L28 57" stroke="currentColor" stroke-width="3.6"/>
      <path d="M44 42 L40 54" stroke="${K}" stroke-width="8"/><path d="M44 42 L40 54" stroke="currentColor" stroke-width="3.6"/>
      <path d="M15.5 38 Q5 38 6 28 Q7 19.5 16.5 20.5 Q18.5 8.5 31 8.5 Q43 8.5 46 19.5 Q58 18.5 58 29 Q58 38 48.5 38 Z" fill="currentColor"/>
      <path d="M33 21 L27 31 L33 31 L29 40" fill="none" stroke="#fff" stroke-width="3"/>
    </g>
    <path d="M14 26 Q15 22.5 19 23" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`),
};

// ------------------------------------------------------------------ player (team icons, avatar)
// A paintball player's masked head, front view: headwrap dome, goggle lens band, ear pieces, vented jaw guard.
// (Export name SQUID / class iw-squid kept from INKWAVE so every importer keeps working.)
export const MASK_PATH = 'M32 4 C43 4 50.5 12 51 23 L55.5 24 C57.5 24.5 58.5 26 58.5 28 L58.5 36 C58.5 38 57.5 39.5 55.5 40 L50.5 41 C49 51 42 58.5 32 60 C22 58.5 15 51 13.5 41 L8.5 40 C6.5 39.5 5.5 38 5.5 36 L5.5 28 C5.5 26 6.5 24.5 8.5 24 L13 23 C13.5 12 21 4 32 4 Z';
export const SQUID = svg(`<g ${O} stroke-width="3.4">
    <path d="${MASK_PATH}" fill="currentColor"/>
    <path d="M17.5 42 L46.5 42 C45 51 39.5 56 32 57 C24.5 56 19 51 17.5 42 Z" fill="${DK}" stroke-width="2.6"/>
  </g>
  <path d="M22 12 Q27 7.5 33 7.5" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>
  <g class="iw-squid-eyes">
    <rect x="11.5" y="22" width="41" height="16" rx="7.5" fill="#252c3d" stroke="${K}" stroke-width="3"/>
    <path d="M16.5 26.5 L27 26.5" stroke="#fff" stroke-opacity=".7" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M31 31.5 L34 31.5" stroke="#fff" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round"/>
  </g>
  <path d="M26 45.5 L26 51.5 M32 46.5 L32 53.5 M38 45.5 L38 51.5" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>`, '0 0 64 64', 'iw-squid');

// ------------------------------------------------------------------ line glyphs (single colour, currentColor)
const G = `fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
function gearPath() {
  const pts = []; const n = 8;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = (i % 4 === 0 || i % 4 === 1) ? 27 : 20;
    pts.push(`${(32 + Math.cos(a) * r).toFixed(1)} ${(32 + Math.sin(a) * r).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}
/** Masked-player silhouette (64 box). Shared by GLYPHS.squidlet and the player-tag art. (Old name kept.) */
export const SQUID_PATH = MASK_PATH;
export const GLYPHS = {
  play: svg(`<path d="M21 12 L51 32 L21 52 Z" fill="currentColor" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>`),
  gear: svg(`<path d="${gearPath()}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="32" r="8.5" fill="var(--k, #15121c)"/>`),
  question: svg(`<circle cx="32" cy="32" r="26" fill="currentColor"/><path d="M24 25 Q24 16 32.5 16 Q41 16 41 24 Q41 29.5 35 32 Q32.5 33.3 32.5 37.5" fill="none" stroke="var(--k, #15121c)" stroke-width="6" stroke-linecap="round"/><circle cx="32.5" cy="47" r="3.8" fill="var(--k, #15121c)"/>`),
  star: svg(`<path d="M32 5 L39.5 23 L58.5 24.5 L44 37 L48.5 56 L32 46 L15.5 56 L20 37 L5.5 24.5 L24.5 23 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`),
  back: svg(`<path d="M38 14 L20 32 L38 50" ${G} stroke-width="8"/>`),
  next: svg(`<path d="M26 14 L44 32 L26 50" ${G} stroke-width="8"/>`),
  check: svg(`<path d="M14 33 L27 46 L51 18" ${G} stroke-width="8"/>`),
  close: svg(`<path d="M18 18 L46 46 M46 18 L18 46" ${G} stroke-width="8"/>`),
  crown: svg(`<path d="M8 22 L20 34 L32 12 L44 34 L56 22 L51 50 L13 50 Z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>`),
  clock: svg(`<circle cx="32" cy="33" r="23" ${G}/><path d="M32 20 L32 34 L41 40" ${G}/>`),
  pencil: svg(`<path d="M14 50 L17 38 L42 13 L51 22 L26 47 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M36 19 L45 28" stroke="var(--k, #15121c)" stroke-width="3.5"/>`),
  map: svg(`<path d="M8 16 L24 10 L40 16 L56 10 L56 48 L40 54 L24 48 L8 54 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 10 L24 48 M40 16 L40 54" stroke="var(--k, #15121c)" stroke-width="3.5"/>`),
  bot: svg(`<rect x="12" y="18" width="40" height="32" rx="10" fill="currentColor"/><path d="M32 18 L32 9" ${G} stroke-width="4.5"/><circle cx="32" cy="8" r="4" fill="currentColor"/><circle cx="24" cy="34" r="4.5" fill="var(--k, #15121c)"/><circle cx="40" cy="34" r="4.5" fill="var(--k, #15121c)"/>`),
  gamepad: svg(`<path d="M18 17 L46 17 Q58 17 60 34 Q62 50 54 50 Q49 50 44 42 L20 42 Q15 50 10 50 Q2 50 4 34 Q6 17 18 17 Z" fill="currentColor"/><path d="M19 25 L19 35 M14 30 L24 30" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/><circle cx="44" cy="27" r="3.2" fill="var(--k, #15121c)"/><circle cx="50" cy="33" r="3.2" fill="var(--k, #15121c)"/>`),
  keyboard: svg(`<rect x="4" y="16" width="56" height="34" rx="7" fill="currentColor"/><g fill="var(--k, #15121c)"><rect x="11" y="23" width="6" height="6" rx="1.5"/><rect x="20" y="23" width="6" height="6" rx="1.5"/><rect x="29" y="23" width="6" height="6" rx="1.5"/><rect x="38" y="23" width="6" height="6" rx="1.5"/><rect x="47" y="23" width="6" height="6" rx="1.5"/><rect x="11" y="32" width="6" height="6" rx="1.5"/><rect x="47" y="32" width="6" height="6" rx="1.5"/><rect x="20" y="40" width="24" height="5" rx="2"/></g>`),
  monitor: svg(`<rect x="6" y="10" width="52" height="34" rx="6" fill="currentColor"/><path d="M24 54 L40 54 M32 44 L32 54" ${G} stroke-width="5"/><path d="M14 36 L24 24 L31 31 L38 22 L50 36" fill="none" stroke="var(--k, #15121c)" stroke-width="4" stroke-linejoin="round"/>`),
  speaker: svg(`<path d="M8 24 L20 24 L34 12 L34 52 L20 40 L8 40 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M42 23 Q48 32 42 41 M48 16 Q59 32 48 48" ${G} stroke-width="5"/>`),
  flag: svg(`<path d="M14 58 L14 8" ${G} stroke-width="6"/><path d="M14 10 Q24 4 34 10 Q44 16 54 10 L54 34 Q44 40 34 34 Q24 28 14 34 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`),
  reset: svg(`<path d="M50 30 A18 18 0 1 1 42 17" ${G} stroke-width="6.5"/><path d="M40 7 L45 19 L33 22" ${G} stroke-width="6.5"/>`),
  sun: svg(`<circle cx="32" cy="32" r="12" fill="currentColor"/><g ${G} stroke-width="5">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<path d="M${(32 + Math.cos(a) * 19).toFixed(1)} ${(32 + Math.sin(a) * 19).toFixed(1)} L${(32 + Math.cos(a) * 26).toFixed(1)} ${(32 + Math.sin(a) * 26).toFixed(1)}"/>`; }).join('')}</g>`),
  moon: svg(`<path d="M40 8 A24 24 0 1 0 56 40 A19 19 0 0 1 40 8 Z" fill="currentColor"/>`),
  users: svg(`<circle cx="22" cy="22" r="9" fill="currentColor"/><circle cx="43" cy="22" r="9" fill="currentColor"/><path d="M6 52 Q6 36 22 36 Q38 36 38 52 Z M30 52 Q30 36 43 36 Q58 36 58 52 Z" fill="currentColor"/>`),
  drop: svg(`<path d="M32 6 C32 6 50 28 50 40 C50 51 42 58 32 58 C22 58 14 51 14 40 C14 28 32 6 32 6 Z" fill="currentColor"/>`),
  swords: svg(`<path d="M12 10 L40 38 M52 10 L24 38" ${G} stroke-width="6"/><path d="M34 44 L44 34 M20 34 L30 44 M42 42 L54 54 M22 42 L10 54" ${G} stroke-width="6"/>`),
  // locker / stage select
  hanger: svg(`<path d="M26 16 Q26 8.5 32 8.5 Q38 8.5 38 14.5 Q38 19.5 32 21.5 L32 26" ${G} stroke-width="5"/><path d="M32 25 L7 42.5 Q3.5 45.5 8.5 48 L55.5 48 Q60.5 45.5 57 42.5 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 43 L48 43" stroke="var(--k, #15121c)" stroke-width="3" stroke-linecap="round" opacity=".45"/>`),
  dice: svg(`<rect x="8" y="8" width="48" height="48" rx="12" fill="currentColor" transform="rotate(-8 32 32)"/><g fill="var(--k, #15121c)" transform="rotate(-8 32 32)"><circle cx="21" cy="21" r="4.6"/><circle cx="43" cy="21" r="4.6"/><circle cx="32" cy="32" r="4.6"/><circle cx="21" cy="43" r="4.6"/><circle cx="43" cy="43" r="4.6"/></g>`),
  shirt: svg(`<path d="M23 9 L12 13 L3.5 26 L13 32.5 L17 27.5 L17 56 L47 56 L47 27.5 L51 32.5 L60.5 26 L52 13 L41 9 Q38 16.5 32 16.5 Q26 16.5 23 9 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M17 36 L47 36" stroke="var(--k, #15121c)" stroke-width="4" opacity=".4"/>`),
  eye: svg(`<path d="M4 32 Q32 5 60 32 Q32 59 4 32 Z" fill="currentColor"/><circle cx="32" cy="32" r="12" fill="var(--k, #15121c)"/><circle cx="36.5" cy="27.5" r="4" fill="currentColor"/>`),
  hair: svg(`<path d="M12 36 Q10 11 32 9 Q54 11 52 36 Q47 30 43 34 Q40 26 32 29 Q24 26 21 34 Q17 30 12 36 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M13 34 Q8 46 12 58 Q19 52 20 39 Z M44 39 Q45 52 52 58 Q56 46 51 34 Z M27 34 Q25 47 28 56 Q34 49 33 35 Z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 20 Q24 15 30 14" stroke="var(--k, #15121c)" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".35"/>`),
  palette: svg(`<path d="M32 6 C16 6 6 18 6 32 C6 46.5 18 58 32 58 C38.5 58 40.5 54 38.5 50 C36.5 46 38.5 42 44 42 L50 42 C56 42 58 36.5 58 32 C58 18 48 6 32 6 Z" fill="currentColor"/><g fill="var(--k, #15121c)"><circle cx="19" cy="31" r="4.6"/><circle cx="25" cy="19" r="4.6"/><circle cx="38.5" cy="16.5" r="4.6"/><circle cx="48" cy="26" r="4.6"/></g>`),
  sparkle: svg(`<path d="M32 4 Q35 26 60 32 Q35 38 32 60 Q29 38 4 32 Q29 26 32 4 Z" fill="currentColor"/>`),
  rotate: svg(`<path d="M50 23 A20 20 0 0 0 14 25" ${G} stroke-width="5.5"/><path d="M14 41 A20 20 0 0 0 50 39" ${G} stroke-width="5.5"/><path d="M52 10 L51 24 L37 22" ${G} stroke-width="5.5"/><path d="M12 54 L13 40 L27 42" ${G} stroke-width="5.5"/>`),
  bolt: svg(`<path d="M36 4 L12 36 L30 36 L26 60 L52 26 L34 26 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`),
  target: svg(`<circle cx="32" cy="32" r="22" ${G} stroke-width="5"/><circle cx="32" cy="32" r="10" ${G} stroke-width="5"/><path d="M32 2 L32 14 M32 50 L32 62 M2 32 L14 32 M50 32 L62 32" ${G} stroke-width="5"/>`),
  feather: svg(`<path d="M52 8 Q22 12 16 40 L12 54 L17 50 Q46 44 52 8 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 52 L40 22" stroke="var(--k, #15121c)" stroke-width="3" stroke-linecap="round" opacity=".45"/>`),
  // online / lobby
  online: svg(`<path d="M32 30 C38 30 42 34 42 40 C42 46 38 50 32 50 C26 50 22 46 22 40 C22 34 26 30 32 30 Z" fill="currentColor"/><path d="M26 49 L22 58 M32 50 L32 59 M38 49 L42 58" ${G} stroke-width="4.5"/><path d="M17 26 Q32 12 47 26" ${G} stroke-width="5"/><path d="M8 17 Q32 -4 56 17" ${G} stroke-width="5" opacity=".6"/><circle cx="28" cy="39" r="2.8" fill="var(--k, #15121c)"/><circle cx="36" cy="39" r="2.8" fill="var(--k, #15121c)"/>`),
  copy: svg(`<rect x="21" y="8" width="33" height="38" rx="7" fill="none" stroke="currentColor" stroke-width="5.5"/><rect x="10" y="18" width="33" height="38" rx="7" fill="currentColor"/><path d="M18 31 L35 31 M18 40 L30 40" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/>`),
  paste: svg(`<rect x="11" y="12" width="42" height="46" rx="8" fill="currentColor"/><rect x="21" y="5" width="22" height="13" rx="5" fill="currentColor" stroke="var(--k, #15121c)" stroke-width="3.5"/><path d="M21 31 L43 31 M21 40 L43 40 M21 49 L34 49" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/>`),
  exit: svg(`<path d="M30 10 L14 10 Q10 10 10 14 L10 50 Q10 54 14 54 L30 54" ${G} stroke-width="6"/><path d="M26 32 L54 32 M44 21 L55 32 L44 43" ${G} stroke-width="6.5"/>`),
  lock: svg(`<rect x="12" y="28" width="40" height="30" rx="7" fill="currentColor"/><path d="M20 29 L20 21 Q20 9 32 9 Q44 9 44 21 L44 29" ${G} stroke-width="6"/><circle cx="32" cy="41" r="4.5" fill="var(--k, #15121c)"/><path d="M32 43 L32 50" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/>`),
  plus: svg(`<path d="M32 12 L32 52 M12 32 L52 32" ${G} stroke-width="8.5"/>`),
  key: svg(`<circle cx="21" cy="32" r="13" fill="currentColor"/><circle cx="18" cy="32" r="4.5" fill="var(--k, #15121c)"/><path d="M33 32 L57 32 M48 32 L48 42 M56 32 L56 40" ${G} stroke-width="6"/>`),
  smile: svg(`<circle cx="32" cy="32" r="26" fill="currentColor"/><circle cx="23.5" cy="27" r="4" fill="var(--k, #15121c)"/><circle cx="40.5" cy="27" r="4" fill="var(--k, #15121c)"/><path d="M20 38 Q32 50 44 38" fill="none" stroke="var(--k, #15121c)" stroke-width="4.5" stroke-linecap="round"/>`),
  booyah: svg(`<path d="M10 26 L28 22 L48 9 L48 55 L28 42 L10 38 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M18 40 L22 55 L30 55 L27 42" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M54 24 L60 20 M55 32 L62 32 M54 40 L60 44" ${G} stroke-width="4"/>`),
  hand: svg(`<path d="M22 56 Q12 50 11 38 L10 30 Q10 26 13.5 26 Q17 26 17.5 30 L18 36 L18 13 Q18 9 21.5 9 Q25 9 25 13 L25 30 L25 8 Q25 4 28.5 4 Q32 4 32 8 L32 30 L32 11 Q32 7 35.5 7 Q39 7 39 11 L39 31 L39 17 Q39 13 42.5 13 Q46 13 46 17 L46 40 Q46 54 36 57 Z" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M50 8 Q57 12 58 20 M53 3 Q62 8 63 17" ${G} stroke-width="3.5" opacity=".8"/>`),
  note: svg(`<path d="M24 46 L24 12 L52 6 L52 40" ${G} stroke-width="6"/><ellipse cx="17" cy="47" rx="9" ry="7" fill="currentColor" transform="rotate(-18 17 47)"/><ellipse cx="45" cy="41" rx="9" ry="7" fill="currentColor" transform="rotate(-18 45 41)"/><path d="M24 21 L52 15" ${G} stroke-width="6"/>`),
  flex: svg(`<path d="M14 54 Q8 40 16 30 L24 20 Q22 14 26 10 Q32 6 37 10 L40 14 Q36 18 33 18 L30 24 Q38 22 46 26 Q56 32 54 44 Q52 54 40 56 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M30 36 Q38 32 46 38" fill="none" stroke="var(--k, #15121c)" stroke-width="3.5" stroke-linecap="round" opacity=".45"/>`),
  signal: svg(`<rect x="8" y="40" width="10" height="16" rx="3" fill="currentColor"/><rect x="27" y="28" width="10" height="28" rx="3" fill="currentColor"/><rect x="46" y="12" width="10" height="44" rx="3" fill="currentColor"/>`),
  // masked-player silhouette (lobby head-count pips, player-tag patterns): outlined, goggle lens cut out
  squidlet: svg(`<path d="${SQUID_PATH}" fill="currentColor" stroke="var(--k, #15121c)" stroke-width="4" stroke-linejoin="round"/><rect x="14" y="24" width="36" height="12" rx="6" fill="var(--k, #15121c)"/>`),
};

/** Kill-feed / stat glyphs */
export const SPLAT_ICON = (() => {
  const s = splatShape(32, 32, 17, { seed: 11, arms: 8, drops: 4, armLen: 0.5 });
  return svg(`<path d="${s.core}" fill="currentColor" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>${s.drops.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${Math.max(2.2, d.r)}" fill="currentColor" stroke="${K}" stroke-width="2"/>`).join('')}`);
})();
export const DEATH_ICON = svg(`<g ${O} stroke-width="3.4">
    <path d="${MASK_PATH}" fill="currentColor"/>
    <path d="M17.5 42 L46.5 42 C45 51 39.5 56 32 57 C24.5 56 19 51 17.5 42 Z" fill="${DK}" stroke-width="2.6"/>
    <rect x="11.5" y="22" width="41" height="16" rx="7.5" fill="#252c3d" stroke-width="3"/>
  </g>
  <path d="M20.5 25.5 L27.5 34.5 M27.5 25.5 L20.5 34.5 M36.5 25.5 L43.5 34.5 M43.5 25.5 L36.5 34.5" stroke="#ff5a6a" stroke-width="3.4" stroke-linecap="round"/>`);

// ------------------------------------------------------------------ BREAKOUT (paintball) HUD glyphs
/** Paint grenade: a stubby canister with a pin ring (currentColor = team paint). */
export const GRENADE_ICON = svg(`<g ${O}>
    <rect x="25" y="5" width="14" height="9" rx="2.5" fill="${DK}"/>
    <path d="M40 9 Q51 6 52 16 Q52.5 21 47 22" fill="none" stroke-width="3.4"/>
    <rect x="15" y="13" width="34" height="45" rx="11" fill="currentColor"/>
    <path d="M15 27 L49 27 M15 44 L49 44" stroke-width="3.4"/>
  </g>
  <path d="M40 9 Q51 6 52 16 Q52.5 21 47 22" fill="none" stroke="${LT}" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M21.5 19 L21.5 22 M21.5 32 L21.5 39" stroke="#fff" stroke-opacity=".65" stroke-width="3.4" stroke-linecap="round"/>`);
/** One paintball (ammo glyph). */
export const BALL_ICON = svg(`<circle cx="32" cy="32" r="22" fill="currentColor" stroke="${K}" stroke-width="4.5"/>
  <path d="M14 35 Q32 44 50 35" fill="none" stroke="${K}" stroke-opacity=".35" stroke-width="3"/>
  <ellipse cx="24.5" cy="23" rx="7" ry="4.6" transform="rotate(-30 24.5 23)" fill="#fff" fill-opacity=".7"/>`);
/** Sprint: three forward chevrons. */
export const SPRINT_ICON = svg(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 16 L22 32 L8 48 M24 16 L38 32 L24 48 M40 16 L54 32 L40 48" stroke="${K}" stroke-width="11"/>
    <path d="M8 16 L22 32 L8 48 M24 16 L38 32 L24 48 M40 16 L54 32 L40 48" stroke="currentColor" stroke-width="5.5"/></g>`);
/** Elimination mark: a bold X (feed / scoreboard / results). */
export const OUT_ICON = svg(`<path d="M15 15 L49 49 M49 15 L15 49" fill="none" stroke="${K}" stroke-width="15" stroke-linecap="round"/>
  <path d="M15 15 L49 49 M49 15 L15 49" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>`);
/** Round decided by the clock. */
export const WHISTLE_ICON = svg(`<g ${O} stroke-width="3.4">
    <path d="M6 24 L30 24 A15 15 0 1 1 22 38 L10 34 Q6 33 6 29 Z" fill="currentColor"/>
    <circle cx="36" cy="37" r="5" fill="${DK}"/>
    <path d="M46 20 L54 12" fill="none"/></g>`);

// ------------------------------------------------------------------ input glyphs
const PAD_FACE = { A: '#3fc46e', B: '#ff4f5a', X: '#3c8cff', Y: '#ffc31d' };
/** Keycap. `k` is the label ('W', 'SHIFT', 'SPACE', ...). */
export function keycap(k) {
  const s = String(k);
  const wide = s.length > 2 ? ' iw-key--wide' : '';
  return `<kbd class="iw-key${wide}">${esc(s === ' ' ? 'SPACE' : s)}</kbd>`;
}
/** Mouse glyph: which = 'L' | 'R' | 'M' (move) | 'W' (wheel) */
export function mouseGlyph(which = 'L') {
  const l = which === 'L' ? 'var(--a, #ff8a14)' : '#fff';
  const r = which === 'R' ? 'var(--a, #ff8a14)' : '#fff';
  const arrows = which === 'M' ? `<g stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 32 L-3 32 M0 29 L-3 32 L0 35"/><path d="M45 32 L51 32 M48 29 L51 32 L48 35"/></g>` : '';
  return `<span class="iw-mouse"><svg viewBox="-6 0 60 64" aria-hidden="true">${arrows}
    <path d="M24 6 Q40 6 40 24 L40 42 Q40 58 24 58 Q8 58 8 42 L8 24 Q8 6 24 6 Z" fill="#fff" stroke="${K}" stroke-width="3"/>
    <path d="M24 6 Q9.5 6 8.3 24 L24 24 Z" style="fill:${l}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 6 Q38.5 6 39.7 24 L24 24 Z" style="fill:${r}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="21.5" y="11" width="5" height="9" rx="2.5" fill="${K}"/></svg></span>`;
}
/** Gamepad glyph: 'A' 'B' 'X' 'Y' 'LB' 'RB' 'LT' 'RT' 'LS' 'RS' 'View' 'Start' 'DPad' */
export function padGlyph(b) {
  if (PAD_FACE[b]) return `<span class="iw-pad iw-pad--face" style="--pc:${PAD_FACE[b]}">${b}</span>`;
  if (b === 'LB' || b === 'RB') return `<span class="iw-pad iw-pad--bumper">${b}</span>`;
  if (b === 'LT' || b === 'RT') return `<span class="iw-pad iw-pad--trigger">${b}</span>`;
  if (b === 'LS' || b === 'RS') return `<span class="iw-pad iw-pad--stick">${b[0]}</span>`;
  if (b === 'View') return `<span class="iw-pad iw-pad--sys"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="9" y="10" width="10" height="8" rx="1.5" fill="currentColor"/></svg></span>`;
  if (b === 'Start') return `<span class="iw-pad iw-pad--sys"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7 H19 M5 12 H19 M5 17 H19" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></span>`;
  if (b === 'DPad') return `<span class="iw-pad iw-pad--sys"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z" fill="currentColor"/></svg></span>`;
  return `<span class="iw-pad iw-pad--bumper">${esc(b)}</span>`;
}
/** Renders "Hold [SHIFT] to swim" → text with keycaps. `{A}` renders a gamepad glyph. */
export function richText(str) {
  return esc(str)
    .replace(/\[([^\]]{1,10})\]/g, (_, k) => (k === 'LMB' ? mouseGlyph('L') : k === 'RMB' ? mouseGlyph('R') : keycap(k)))
    .replace(/\{([A-Za-z]{1,5})\}/g, (_, k) => padGlyph(k));
}

// ------------------------------------------------------------------ logo
/** Crosshair reticle (100 box): ring, centre dot and four ticks — the O of the wordmark sits inside it. */
const RETICLE = `<svg class="iw-logo__reticle" viewBox="0 0 100 100" aria-hidden="true">
    <g fill="none" stroke-linecap="round">
      <circle cx="50" cy="50" r="33" stroke="${K}" stroke-width="12"/>
      <path d="M50 2 L50 20 M50 80 L50 98 M2 50 L20 50 M80 50 L98 50" stroke="${K}" stroke-width="12"/>
      <circle cx="50" cy="50" r="33" stroke="var(--b-light, #8fb0ff)" stroke-width="5"/>
      <path d="M50 2 L50 20 M50 80 L50 98 M2 50 L20 50 M80 50 L98 50" stroke="var(--b-light, #8fb0ff)" stroke-width="5"/>
    </g>
  </svg>`;
/** Big display wordmark: sporty italic block letters over a paint splat with drips; the O is framed by a crosshair
 *  and a trailing "OUT" (BREAKOUT) takes the accent colour. size: 'xl' | 'md' | 'sm' */
export function logoMarkup(title = 'BREAKOUT', subtitle = '4v4 Paintball', size = 'xl') {
  const chars = [...title];
  const hiFrom = /OUT$/i.test(title) && chars.length > 3 ? chars.length - 3 : chars.length;
  const oIdx = chars.findIndex((ch, i) => i >= Math.min(hiFrom, chars.length - 3) && /o/i.test(ch));
  const letters = chars.map((ch, i) => `<span class="iw-logo__l${i >= hiFrom ? ' is-hi' : ''}${i === oIdx ? ' is-o' : ''}" style="--i:${i}" data-l="${esc(ch)}">${i === oIdx ? RETICLE : ''}<span class="iw-logo__g">${esc(ch)}</span></span>`).join('');
  const s = splatShape(300, 110, 88, { seed: 23, arms: 11, drops: 9, armLen: 0.55 });
  const s2 = splatShape(470, 60, 30, { seed: 5, arms: 8, drops: 4, armLen: 0.6 });
  // drips hanging off the splat, grow + drop
  const drips = [[190, 150, 1.0], [262, 162, 1.35], [335, 158, 0.8], [402, 150, 1.15]].map(([x, y, k], i) =>
    `<g class="iw-drip" style="--d:${i}"><path class="iw-fa" d="M${x - 7} ${y} L${x + 7} ${y} L${x + 5} ${y + 28 * k} Q${x} ${y + 38 * k} ${x - 5} ${y + 28 * k} Z"/>
     <circle class="iw-fa iw-drip__drop" cx="${x}" cy="${y + 36 * k}" r="5.5"/></g>`).join('');
  return `<div class="iw-logo iw-logo--${size}">
    <svg class="iw-logo__splat" viewBox="0 0 600 240" aria-hidden="true">
      <g transform="translate(300 110) scale(1.7 1.02) translate(-300 -110)">
        <path class="iw-fb" transform="translate(-30 12) rotate(-10 300 110)" d="${s.core}"/>
        <path class="iw-fa" d="${s.core}"/>
      </g>
      <path class="iw-fb" d="${s2.core}"/>${s2.drops.map((d) => `<circle class="iw-fb" cx="${d.x}" cy="${d.y}" r="${d.r}"/>`).join('')}
      ${s.drops.map((d) => `<circle class="iw-fa" cx="${(300 + (d.x - 300) * 1.7).toFixed(1)}" cy="${d.y}" r="${d.r}"/>`).join('')}
      ${drips}
    </svg>
    <div class="iw-logo__word">${letters}</div>
    ${subtitle ? `<div class="iw-logo__sub"><span>${esc(subtitle)}</span></div>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ map thumbnails
/** Stylised top-down illustration of an arena. theme: 'day' | 'sunset' */
export function mapThumb(map, seed = 3) {
  const sunset = map && map.theme === 'sunset';
  const id = 'm' + Math.floor(Math.random() * 1e9).toString(36);
  const sea = sunset ? ['#ffb36b', '#e0607e', '#5b3b9a'] : ['#7fe3f5', '#2fb1e6', '#1e76cf'];
  const deck = sunset ? '#f1cfae' : '#f6efe0';
  const deckEdge = sunset ? '#b98468' : '#c9b99c';
  const block = sunset ? '#e4b894' : '#e9dfcb';
  const blockTop = sunset ? '#f6dcc2' : '#fffaf0';
  const sa = splatShape(0, 0, 1, { seed: seed * 3 + 1, arms: 8, drops: 0 });
  const sb = splatShape(0, 0, 1, { seed: seed * 5 + 2, arms: 9, drops: 0 });
  const splat = (cls, shape, x, y, r, rot) => `<path class="${cls}" transform="translate(${x} ${y}) rotate(${rot}) scale(${r})" d="${shape.core}"/>`;
  const waves = Array.from({ length: 7 }, (_, i) => {
    const y = 14 + i * 29; const x = (i % 2) * 22;
    return `<path d="M${x - 10} ${y} q10 -6 20 0 t20 0 M${x + 250} ${y + 8} q10 -6 20 0 t20 0" stroke="#fff" stroke-opacity="${sunset ? 0.35 : 0.5}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }).join('');
  const lights = sunset ? Array.from({ length: 14 }, (_, i) => `<circle cx="${52 + i * 16.5}" cy="${34 + Math.sin(i * 0.9) * 2}" r="2.6" fill="#fff4b0"/><circle cx="${52 + i * 16.5}" cy="${34 + Math.sin(i * 0.9) * 2}" r="6" fill="#ffe27a" opacity=".35"/>`).join('') : '';
  const sun = sunset
    ? `<circle cx="276" cy="18" r="30" fill="#ffe08a" opacity=".55"/><circle cx="276" cy="18" r="17" fill="#fff1b8"/>`
    : `<circle cx="292" cy="10" r="26" fill="#fff" opacity=".35"/>`;
  return `<svg class="iw-mapthumb" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${id}s" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${sea[0]}"/><stop offset=".55" stop-color="${sea[1]}"/><stop offset="1" stop-color="${sea[2]}"/></linearGradient>
    <clipPath id="${id}c"><rect x="44" y="30" width="232" height="146" rx="16"/></clipPath></defs>
    <rect width="320" height="200" fill="url(#${id}s)"/>${waves}${sun}
    <rect x="48" y="40" width="232" height="146" rx="16" fill="#000" opacity=".18"/>
    <rect x="44" y="30" width="232" height="146" rx="16" fill="${deckEdge}"/>
    <rect x="44" y="30" width="232" height="140" rx="16" fill="${deck}"/>
    <g clip-path="url(#${id}c)">
      <path d="M44 72 H276 M44 128 H276 M102 30 V176 M160 30 V176 M218 30 V176" stroke="${deckEdge}" stroke-opacity=".35" stroke-width="2"/>
      ${splat('iw-fa', sa, 78, 100, 30, 10)}${splat('iw-fa', sb, 118, 62, 17, 40)}${splat('iw-fa', sa, 128, 140, 14, 70)}${splat('iw-fa', sb, 60, 150, 12, 5)}
      ${splat('iw-fb', sb, 244, 102, 29, 25)}${splat('iw-fb', sa, 206, 140, 17, 60)}${splat('iw-fb', sb, 196, 58, 13, 12)}${splat('iw-fb', sa, 262, 54, 11, 80)}
      <g>
        <rect x="140" y="86" width="40" height="30" rx="7" fill="${block}"/><rect x="140" y="82" width="40" height="28" rx="7" fill="${blockTop}"/>
        <rect x="96" y="40" width="30" height="20" rx="6" fill="${block}"/><rect x="96" y="37" width="30" height="18" rx="6" fill="${blockTop}"/>
        <rect x="194" y="150" width="30" height="18" rx="6" fill="${block}"/><rect x="194" y="147" width="30" height="16" rx="6" fill="${blockTop}"/>
        <rect x="100" y="146" width="22" height="22" rx="6" fill="${block}"/><rect x="100" y="143" width="22" height="20" rx="6" fill="${blockTop}"/>
        <rect x="200" y="40" width="22" height="22" rx="6" fill="${block}"/><rect x="200" y="37" width="22" height="20" rx="6" fill="${blockTop}"/>
        <path class="iw-fa" d="M140 99 q8 -4 14 0 v11 h-14 z" opacity=".9"/>
      </g>
    </g>
    <circle cx="58" cy="103" r="11" class="iw-fa" stroke="#fff" stroke-width="4"/>
    <circle cx="262" cy="103" r="11" class="iw-fb" stroke="#fff" stroke-width="4"/>
    ${lights}
  </svg>`;
}

// ------------------------------------------------------------------ how-to illustrations (120 x 80)
const MASK_AT = (x, y, sc, color) => `<g transform="translate(${x} ${y}) scale(${sc})" style="color:${color}">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>`;
const BALL = (x, y, r, cls = 'iw-fa') => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" stroke="${K}" stroke-width="2"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff" opacity=".7"/>`;
export const RULE_ART = {
  // one life per round: a rival mask tagged OUT, splatted with your paint
  elim: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <path class="iw-fb" d="${blobPath(60, 70, 46, { seed: 31, sy: 0.22, points: 11, wobble: 0.14 })}" opacity=".55"/>
    ${MASK_AT(34, 12, 0.8, 'var(--b)')}
    <path class="iw-fa" d="${splatShape(58, 34, 9, { seed: 7, arms: 8, drops: 0 }).core}" stroke="${K}" stroke-width="1.6"/>
    ${BALL(16, 22, 4.2)}${BALL(8, 30, 3.2)}
    <path d="M13 24 L2 29" stroke="#fff" stroke-width="2" stroke-dasharray="2 3" stroke-linecap="round"/>
    <g transform="translate(78 10) rotate(10)"><rect width="36" height="17" rx="4" fill="#ff3d5e" stroke="${K}" stroke-width="2.5"/>
      <text x="18" y="13" text-anchor="middle" font-family="Rubik, sans-serif" font-style="italic" font-weight="900" font-size="12" fill="#fff">OUT!</text></g>
  </svg>`,
  // first to N: round pips + the round clock
  rounds: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <g transform="translate(8 12)">
      ${[0, 1, 2, 3].map((i) => `<circle cx="${8 + i * 15}" cy="8" r="6" class="${i < 3 ? 'iw-fa' : ''}" fill="${i < 3 ? '' : '#fff'}" fill-opacity="${i < 3 ? 1 : 0.18}" stroke="${K}" stroke-width="2.4"/>`).join('')}
      ${[0, 1, 2, 3].map((i) => `<circle cx="${8 + i * 15}" cy="26" r="6" class="${i < 1 ? 'iw-fb' : ''}" fill="${i < 1 ? '' : '#fff'}" fill-opacity="${i < 1 ? 1 : 0.18}" stroke="${K}" stroke-width="2.4"/>`).join('')}
    </g>
    <g transform="translate(92 42)">
      <circle r="22" fill="#fff" stroke="${K}" stroke-width="3"/>
      <path d="M0 0 L0 -22 A22 22 0 0 1 20.9 -6.8 Z" class="iw-fa" opacity=".85"/>
      <path d="M0 0 L0 -14 M0 0 L9 5" stroke="${K}" stroke-width="3" stroke-linecap="round"/>
      <rect x="-5" y="-29" width="10" height="6" rx="2" fill="${K}"/>
    </g>
    <text x="8" y="70" font-family="Rubik, sans-serif" font-style="italic" font-weight="900" font-size="13" fill="#fff" stroke="${K}" stroke-width="3" paint-order="stroke">3 – 1</text>
  </svg>`,
  // the hopper: a loader full of balls + a pod sliding in
  hopper: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <path d="M22 18 Q22 8 40 8 Q58 8 58 18 L54 48 Q53 54 46 54 L34 54 Q27 54 26 48 Z" fill="#fff" fill-opacity=".22" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <g>${[[32, 44], [42, 45], [37, 36], [47, 36], [30, 30], [40, 27], [50, 27]].map(([x, y]) => BALL(x, y, 4.6)).join('')}</g>
    <rect x="34" y="54" width="12" height="12" rx="2" fill="${DK}" stroke="${K}" stroke-width="2.5"/>
    <path d="M14 70 L96 70" stroke="${K}" stroke-width="7" stroke-linecap="round"/><path d="M14 70 L96 70" class="iw-fa" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="stroke:var(--a)"/>
    <g transform="translate(78 16) rotate(18)"><rect width="16" height="36" rx="7" fill="#fff" stroke="${K}" stroke-width="2.5"/><rect x="3" y="12" width="10" height="21" rx="4" class="iw-fb"/></g>
    <path d="M72 44 Q64 40 60 30" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M58 34 L60 29 L65 31" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="104" y="16" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="900" font-size="12" fill="#fff" stroke="${K}" stroke-width="3" paint-order="stroke">R</text>
  </svg>`,
  // sprint to cover: an inflatable bunker, speed lines, a grenade lobbed over it
  cover: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <ellipse cx="60" cy="72" rx="54" ry="6" fill="#000" opacity=".2"/>
    <path d="M44 72 L44 40 Q44 30 56 30 L80 30 Q92 30 92 40 L92 72 Z" class="iw-fb" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M56 30 L56 72 M68 30 L68 72 M80 30 L80 72" stroke="${K}" stroke-width="2" opacity=".35"/>
    <path d="M50 38 Q52 34 57 34" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>
    ${MASK_AT(12, 34, 0.55, 'var(--a)')}
    <path d="M4 44 L10 44 M2 52 L10 52 M6 60 L12 60" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path d="M40 30 Q62 -6 100 24" stroke="#fff" stroke-width="2.4" fill="none" stroke-dasharray="3 4" stroke-linecap="round"/>
    <g transform="translate(100 30)"><rect x="-3.5" y="-12" width="7" height="5" rx="1.5" fill="${DK}" stroke="${K}" stroke-width="1.6"/><path class="iw-fa" d="M0 -9 C4 -9 9 1 9 4 C9 8 5 9.5 0 9.5 C-5 9.5 -9 8 -9 4 C-9 1 -4 -9 0 -9 Z" stroke="${K}" stroke-width="2.2"/></g>
  </svg>`,
};

// ------------------------------------------------------------------ helpers
export const weaponIcon = (idOrKind) => WEAPON_ICONS[idOrKind] || WEAPON_ICONS.shooter;
export const specialIcon = (id) => SPECIAL_ICONS[id] || SPECIAL_ICONS.slam;
