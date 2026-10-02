// SHOP menu screen (cosmetics only). Built with the Menus instance's own building blocks so it matches the other screens:
//   _scr_shop() { return buildShopScreen(this); }   in src/ui/menus.js
// Browse (tabs) -> pick an item -> preview it on the showcase pedestal -> buy (card / crypto) or equip. Prices, ownership
// and equipped state all come from the server (src/shop/client.js); offline the shop still browses the bundled catalog.
import { h, splatSVG, safeCall } from '../ui/ui-util.js';
import { GLYPHS, weaponIcon } from '../ui/ui-icons.js';
import { G } from '../core/ctx.js';
import { getShop } from './client.js';
import { getItem, fmtUSD, SLOTS, RARITIES } from './catalog.js';
import { allowPreview } from './cosmetics.js';
import * as LOOK from '../game/character-style.js';

const TABS = [{ id: 'all', label: 'ALL' }, { id: 'gun', label: 'MARKER FINISHES' }, { id: 'costume', label: 'COSTUMES' }];
const RARITY_COL = { common: '#c3bdd6', rare: '#58b4ff', epic: '#c76bff', legendary: '#ffc83d' };

let cssDone = false;
function injectCSS() {
  if (cssDone) return; cssDone = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../styles/shop.css', import.meta.url).href;
  document.head.appendChild(l);
}

export function buildShopScreen(menus) {
  injectCSS();
  const shop = getShop();
  const sc = G.game && G.game.showcase;
  const teamColor = () => (G.teamColors && G.teamColors[0]) || menus._accent()[0];
  let tab = 0, sel = null, busy = false;

  // ---- header + banner
  const banner = h('div', { class: 'bo-shop__banner' });
  const tabsEl = h('div', { class: 'iw-tabs bo-shop__tabs' });
  const tabBtns = TABS.map((t, i) => {
    const b = h('button', { class: 'iw-tab' }, h('span', null, t.label));
    menus._bind(b, { id: 'stab-' + t.id, type: 'tab', accept: () => { tab = i; build(); } });
    return b;
  });
  tabsEl.append(...tabBtns);

  const grid = h('div', { class: 'bo-shop__grid' });
  const detail = h('div', { class: 'bo-shop__detail' });
  const restoreBtn = menus._btn({ id: 'restore', label: 'RESTORE PURCHASES', icon: GLYPHS.rotate, cls: 'iw-btn--ghost iw-lbtn', accept: () => restore() });
  const doneBtn = menus._btn({ id: 'done', label: 'DONE', icon: GLYPHS.check, cls: 'iw-btn--primary iw-lbtn', sound: 'ui_confirm', accept: () => menus._back() });
  const foot = h('div', { class: 'iw-lfoot iw-in iw-in--up' }, restoreBtn, h('span', { class: 'iw-lsaved' }, h('span', null, 'Cosmetics only: no gameplay advantage')), doneBtn);
  const panel = menus._panel('bo-shop__panel iw-in', banner, tabsEl, grid);
  const el = h('div', { class: 'iw-screen bo-shop' },
    h('div', { class: 'iw-scrim-left' }),
    menus._header('SHOP', { sub: 'Marker finishes and costumes. Purely cosmetic.' }),
    h('div', { class: 'iw-locker__body' }, panel, foot), detail,
    menus._prompts([['Enter', 'A', 'Select'], ['Esc', 'B', 'Back']]));

  // ---- helpers
  const items = () => shop.items.filter((i) => TABS[tab].id === 'all' || i.type === TABS[tab].id)
    .slice().sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.price - b.price);
  const isEquipped = (it) => shop.equipped[SLOTS[it.type]] === it.id;
  const online = () => shop.state === 'ready';
  const toast = (t, kind = 'info') => menus.toast(t, { kind });

  function artFor(it) {
    const c = (it.preview && it.preview.accent) || '#ff8a14';
    const icon = it.type === 'gun' ? weaponIcon((it.preview && it.preview.weapon) || 'shooter') : GLYPHS.hanger;
    return h('span', { class: 'bo-tile__art', style: { '--c': c }, html: icon });
  }

  function tile(it, n) {
    const status = isEquipped(it) ? 'EQUIPPED' : shop.owned.has(it.id) ? 'OWNED' : fmtUSD(it.price);
    const t = h('button', { class: 'bo-tile iw-rowin' + (isEquipped(it) ? ' is-on' : '') + (shop.owned.has(it.id) ? ' is-owned' : ''), style: { '--i': n, '--r': RARITY_COL[it.rarity] } },
      artFor(it), h('span', { class: 'bo-tile__name' }, it.name),
      h('span', { class: 'bo-tile__meta' }, h('i', { class: 'bo-tile__rar' }), it.rarity.toUpperCase()),
      h('span', { class: 'bo-tile__price' }, status));
    t.dataset.cur = 'own';
    menus._fx(t, { tilt: 10 });
    menus._bind(t, { id: 'item-' + it.id, accept: () => select(it, t) });
    t._it = it;
    return t;
  }

  function previewOn(it) {
    if (!sc || !sc.showLocker) return;
    allowPreview([it.id]);
    const base = menus._style();
    const st = { ...base, ...((it.preview && it.preview.style) || {}) };
    for (const s of Object.values(SLOTS)) delete st[s];
    st[SLOTS[it.type]] = it.id;
    // keep the other equipped cosmetic visible in the try-on
    for (const [k, v] of Object.entries(shop.equipped)) if (!(k in st)) st[k] = v;
    const weapon = it.type === 'gun' ? (it.preview && it.preview.weapon) || 'shooter' : menus._loadout().weapon;
    safeCall(() => { if (sc.mode === 'locker') { sc.setStyle(st, 'outfit'); } else sc.showLocker(st, teamColor(), weapon); });
  }

  function select(it, tileEl) {
    sel = it; previewOn(it); renderDetail();
    for (const t of grid.querySelectorAll('.bo-tile')) t.classList.toggle('is-sel', t === tileEl);
  }

  function renderDetail() {
    detail.innerHTML = '';
    const it = sel; if (!it) { detail.append(h('div', { class: 'bo-detail__empty' }, 'Pick an item to preview it')); return; }
    const own = shop.owned.has(it.id), eq = isEquipped(it);
    detail.append(
      h('div', { class: 'bo-detail__head' }, h('small', { style: { color: RARITY_COL[it.rarity] } }, `${it.rarity.toUpperCase()} · ${it.type === 'gun' ? 'MARKER FINISH' : 'COSTUME'}`), h('b', null, it.name)),
      h('p', { class: 'bo-detail__text' }, it.blurb),
      h('p', { class: 'bo-detail__note' }, it.type === 'gun' ? 'Paint job only. Works on any marker; handling and stats are unchanged.' : 'Look only. No effect on gameplay.'));
    const row = h('div', { class: 'bo-detail__btns' });
    if (own) {
      row.append(menus._btn({ id: 'equip', label: eq ? 'UNEQUIP' : 'EQUIP', icon: GLYPHS.check, cls: 'iw-btn--primary iw-lbtn', sound: 'ui_confirm',
        accept: () => act(() => shop.equip(SLOTS[it.type], eq ? null : it.id), eq ? 'Unequipped' : `${it.name} equipped`) }));
    } else {
      const can = online() && shop.methods.length;
      if (shop.methods.includes('card')) row.append(menus._btn({ id: 'buy-card', label: `BUY ${fmtUSD(it.price)}`, sub: 'Card · Apple Pay · Google Pay', icon: GLYPHS.star, cls: 'iw-btn--primary iw-lbtn', sound: 'ui_confirm', accept: () => buy(it, 'card') }));
      if (shop.methods.includes('crypto')) row.append(menus._btn({ id: 'buy-crypto', label: `PAY WITH CRYPTO ${fmtUSD(it.price)}`, sub: 'USDC stablecoin', icon: GLYPHS.star, cls: 'iw-btn--ghost iw-lbtn', accept: () => buy(it, 'crypto') }));
      if (!can) row.append(h('p', { class: 'bo-detail__note is-warn' }, shop.state === 'offline' ? 'Offline: purchases are unavailable right now.' : shop.state === 'loading' ? 'Connecting to the shop...' : 'The shop is not open yet.'));
    }
    detail.append(row);
  }

  async function act(fn, ok) {
    if (busy) return; busy = true;
    try { await fn(); toast(ok); } catch (e) { toast(e.code === 'offline' ? 'You are offline. Try again later.' : e.code === 'not_owned' ? 'You do not own that item.' : 'Something went wrong. Please try again.', 'error'); }
    busy = false; build(true);
  }

  function buy(it, method) {
    if (busy) return;
    menus._openModal({
      title: `BUY ${it.name.toUpperCase()}?`,
      text: `${fmtUSD(it.price)} USD, ${method === 'crypto' ? 'paid in stablecoin' : 'paid by card'}. You will leave the game to pay on a secure checkout page and come back automatically. Cosmetic item, digital delivery; see the refund policy before buying.${shop.mode === 'test' ? ' (TEST MODE: no real money is charged.)' : ''}`,
      buttons: [
        { label: 'CHECKOUT', cls: 'iw-btn--primary', sound: 'ui_confirm', accept: async () => {
          menus._closeModal(true); busy = true;
          try { const url = await shop.checkout([it.id], method); toast('Opening checkout...'); location.assign(url); }
          catch (e) {
            busy = false;
            toast(e.code === 'already_owned' ? 'You already own that.' : e.code === 'offline' ? 'You are offline. Try again later.' : e.code === 'method_unavailable' ? 'That payment method is not available yet.' : 'Could not start checkout. Please try again.', 'error');
          }
        } },
        { label: 'CANCEL', accept: () => menus._closeModal() },
      ],
    });
  }

  function restore() {
    menus._openModal({
      title: 'RESTORE PURCHASES',
      text: 'Already bought items on another device? Enter your recovery code. Or get a code now to keep your purchases safe.',
      buttons: [
        { label: 'ENTER CODE', cls: 'iw-btn--primary', accept: async () => {
          menus._closeModal(true);
          const code = window.prompt('Recovery code (BRK-XXXX-XXXX-XXXX-XXXX)');
          if (!code) return;
          await act(() => shop.redeem(code), 'Purchases restored');
        } },
        { label: 'GET MY CODE', accept: async () => {
          menus._closeModal(true);
          try { const c = await shop.createRecovery(); menus._openModal({ title: 'YOUR RECOVERY CODE', text: `${c}\n\nWrite it down and keep it private. A new code replaces the old one.`, buttons: [{ label: 'DONE', accept: () => menus._closeModal() }] }); }
          catch (e) { toast('Could not create a code right now.', 'error'); }
        } },
        { label: 'CANCEL', accept: () => menus._closeModal() },
      ],
    });
  }

  function paintBanner() {
    const msg = shop.state === 'offline' ? 'Offline: showing the catalog. Reconnect to buy or equip.' : shop.state === 'unavailable' ? 'The shop is not open yet.'
      : shop.state === 'loading' ? 'Loading your items...' : shop.mode === 'test' ? 'TEST MODE: checkout uses test payments, no real money.' : '';
    banner.textContent = msg; banner.classList.toggle('is-warn', shop.state === 'offline' || shop.state === 'unavailable'); banner.style.display = msg ? '' : 'none';
    const pend = shop.pendingOrder();
    if (pend && shop.state === 'ready') banner.textContent = 'A recent payment is still being confirmed. It will appear here shortly.', banner.style.display = '';
  }

  let tiles = [];
  function build(keepFocus) {
    tabBtns.forEach((b, i) => b.classList.toggle('is-sel', i === tab));
    grid.innerHTML = ''; paintBanner();
    tiles = items().map((it, n) => tile(it, n));
    grid.append(...tiles);
    if (sel) { const m = tiles.find((t) => t._it.id === sel.id); if (m) m.classList.add('is-sel'); else sel = null; }
    renderDetail();
    if (keepFocus && sel) { const m = tiles.find((t) => t._it.id === sel.id); if (m) menus._setFocus(m, { snap: true }); }
  }
  build();

  const off = shop.on(() => { if (menus.current === 'shop') { const m = menus._modal; if (!m) build(true); } });
  shop.refresh();

  return {
    el,
    initial: () => tiles[0] || doneBtn,
    afterMount: () => { const w = menus._loadout().weapon; if (sc && sc.showLocker) safeCall(() => sc.showLocker(menus._style(), teamColor(), w)); },
    onNav: (dir) => {
      if (dir === 'tab_prev' || dir === 'tab_next') { tab = (tab + (dir === 'tab_next' ? 1 : TABS.length - 1)) % TABS.length; build(); return true; }
      return false;
    },
    destroy: () => { off(); allowPreview([]); if (sc && !['loadout', 'online', 'lobby', 'locker'].includes(menus.current)) safeCall(() => sc.hide()); },
  };
}
