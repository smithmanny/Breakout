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

  // ---- header + notes
  const notes = h('div', { class: 'bo-shop__notes' });
  const tools = h('div', { class: 'bo-shop__tools' });
  const tabsEl = h('div', { class: 'iw-tabs bo-shop__tabs' });
  const tabBtns = TABS.map((t, i) => {
    const b = h('button', { class: 'iw-tab' }, h('span', null, t.label));
    menus._bind(b, { id: 'stab-' + t.id, type: 'tab', accept: () => { tab = i; build(); } });
    return b;
  });
  tabsEl.append(...tabBtns);

  const grid = h('div', { class: 'bo-shop__grid' });
  const detail = h('div', { class: 'bo-shop__detail' });
  const doneBtn = menus._btn({ id: 'done', label: 'DONE', icon: GLYPHS.check, cls: 'iw-btn--primary iw-lbtn', sound: 'ui_confirm', accept: () => menus._back() });
  const foot = h('div', { class: 'iw-lfoot iw-in iw-in--up bo-shop__foot' }, h('span', { class: 'iw-lsaved' }, h('span', null, 'Cosmetics only: no gameplay advantage')), doneBtn);
  const panel = menus._panel('bo-shop__panel iw-in', notes, tools, tabsEl, grid);
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
  const compact = () => window.matchMedia('(max-width: 900px), (max-aspect-ratio: 5 / 4)').matches;
  /** Compact layout: the detail card is a bottom sheet, so pad/keyboard picks jump straight to its first button (B returns to the tile). */
  const focusDetail = () => { const b = detail.querySelector('[data-nav]'); if (b) menus._setFocus(b, { snap: true }); };
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
    menus._fx(t, { tilt: 10 });
    menus._bind(t, { id: 'item-' + it.id, accept: (src) => { select(it, t); if (src !== 'mouse' && compact()) focusDetail(); } });
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
    sel = it; previewOn(it); renderDetail(); el.classList.add('has-sel');
    for (const t of grid.querySelectorAll('.bo-tile')) t.classList.toggle('is-sel', t === tileEl);
    if (tileEl && tileEl.scrollIntoView) tileEl.scrollIntoView({ block: 'nearest' });   // compact layout: keep the pick clear of the bottom sheet
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
        accept: () => act(() => shop.equip(SLOTS[it.type], eq ? null : it.id), eq ? 'Unequipped' : `${it.name} equipped`, 'equip that') }));
    } else {
      const can = online() && shop.methods.length;
      if (shop.methods.includes('card')) row.append(menus._btn({ id: 'buy-card', label: `BUY ${fmtUSD(it.price)}`, sub: 'Card · Apple Pay · Google Pay', icon: GLYPHS.star, cls: 'iw-btn--primary iw-lbtn', sound: 'ui_confirm', accept: () => buy(it, 'card') }));
      if (shop.methods.includes('crypto')) row.append(menus._btn({ id: 'buy-crypto', label: `CRYPTO ${fmtUSD(it.price)}`, sub: 'Pay in USDC stablecoin', icon: GLYPHS.star, cls: 'iw-btn--ghost iw-lbtn', accept: () => buy(it, 'crypto') }));
      if (!can) row.append(h('p', { class: 'bo-detail__note is-warn' }, shop.state === 'offline' ? 'Offline: purchases are unavailable right now.' : shop.state === 'loading' ? 'Connecting to the shop...' : shop.state === 'error' ? 'The shop is having a problem. Try again in a moment.' : 'The shop is not open yet.'));
    }
    detail.append(row);
  }

  const errText = (e, what = 'do that') => ({
    offline: 'You are offline. Check your connection and try again.', timeout: 'The shop took too long to answer. Please try again.',
    not_owned: 'You do not own that item.', already_owned: 'You already own that.', method_unavailable: 'That payment method is not available yet.',
    rate_limited: 'Too many tries. Wait a minute and try again.', shop_unavailable: 'The shop is not open yet.', invalid_code: 'That recovery code was not found. Check it and try again.',
    unauthorized: 'Your shop session expired. Reload the page and try again.',
  }[e && e.code] || `Could not ${what} (server problem). Please try again in a moment.`);

  async function act(fn, ok, what) {
    if (busy) return; busy = true;
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e, what), 'error'); }
    busy = false; build(true);
  }

  function buy(it, method) {
    if (busy) return;
    const first = shop.owned.size === 0;
    menus._openModal({
      title: `BUY ${it.name.toUpperCase()}?`,
      text: `${fmtUSD(it.price)} USD, ${method === 'crypto' ? 'paid in stablecoin (USDC)' : 'paid by card'}. You will leave the game to pay on a secure checkout page and come back automatically. Cosmetic item, digital delivery; see the refund policy before buying.${first ? ' After your first purchase we will give you a recovery code so you can never lose your items.' : ''}${shop.mode === 'test' ? ' (TEST MODE: no real money is charged.)' : ''}`,
      buttons: [
        { label: 'CHECKOUT', cls: 'iw-btn--primary', sound: 'ui_confirm', accept: async () => {
          menus._closeModal(true); busy = true;
          try { const url = await shop.checkout([it.id], method); toast('Opening checkout...'); location.assign(url); setTimeout(() => { busy = false; }, 6000); }
          catch (e) { busy = false; toast(errText(e, 'start checkout'), 'error'); build(true); }
        } },
        { label: 'CANCEL', accept: () => menus._closeModal() },
      ],
    });
  }

  // ---- recovery code: save + restore
  function copyText(text) {
    return new Promise((res, rej) => {
      const fallback = () => {
        const ta = h('textarea', { style: { position: 'fixed', opacity: '0', left: '-999px' } }); ta.value = text; document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); ok ? res() : rej(new Error('copy'));
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(res, fallback); else fallback();
    });
  }
  function downloadCode(code) {
    const body = `BREAKOUT recovery code\n\n${code}\n\nKeep this file private and somewhere safe (cloud notes, password manager, email to yourself).\nTo get your purchases back after clearing site data or on a new device: open BREAKOUT > SHOP > RESTORE PURCHASES and enter this code.\nAnyone with this code can restore your items.\n`;
    const a = h('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/plain' })), download: 'breakout-recovery-code.txt' });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const setLabel = (id, t) => { const m = menus._modal, l = m && m.querySelector(`[data-id="${id}"] .iw-btn__label`); if (l) l.textContent = t; };

  /** The "save your code" sheet: shown automatically after the first purchase, from the Shop header note, and from the toolbar. */
  async function showRecovery(first) {
    if (busy || menus._modal) return;
    busy = true;
    let code;
    try { code = await shop.createRecovery(); } catch (e) { busy = false; toast(errText(e, 'create a recovery code'), 'error'); return; }
    busy = false;
    if (menus.current !== 'shop' || menus._modal) return;
    shop.markRecoveryPrompted();
    const status = h('div', { class: 'bo-rec__status', 'aria-live': 'polite' }, 'Not saved yet');
    const flag = (t) => { status.textContent = t; status.classList.add('is-ok'); setLabel('modal-2', 'I SAVED IT'); };
    const body = h('div', { class: 'bo-rec' }, h('div', { class: 'bo-rec__code', 'aria-label': 'Recovery code' }, code), status,
      h('p', { class: 'bo-rec__why' }, 'Your items live on our server, but the key to them is stored only in this browser. If you clear site data, reset the browser or switch devices, your purchases are gone unless you have this code. Anyone with the code can restore your items, so keep it private.'));
    menus._openModal({
      title: first ? 'SAVE YOUR CODE' : 'YOUR RECOVERY CODE',
      text: first ? 'Purchase complete! Before you play, save this recovery code. It is the only way to get your items back.' : 'Keep this code somewhere safe.',
      body,
      onBack: () => { menus._closeModal(); build(true); },
      buttons: [
        { label: 'COPY CODE', cls: 'iw-btn--primary', accept: () => copyText(code).then(() => { flag('Copied. Now paste it somewhere safe.'); setLabel('modal-0', 'COPIED'); }, () => { status.textContent = 'Copy failed: select the code above or use DOWNLOAD.'; }) },
        { label: 'DOWNLOAD .TXT', accept: () => { downloadCode(code); flag('Downloaded breakout-recovery-code.txt'); } },
        { label: 'I HAVE SAVED IT', sound: 'ui_confirm', accept: () => { shop.markRecoverySaved(); menus._closeModal(true); toast('Recovery code saved. Restore any time from the Shop.', 'good'); build(true); } },
        { label: 'LATER', accept: () => { menus._closeModal(); build(true); } },
      ],
    });
    menus._modal.classList.add('bo-modal--rec');
  }

  function restore() {
    if (menus._modal) return;
    const input = h('input', { class: 'bo-code__input', type: 'text', maxlength: '40', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'BRK-XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Recovery code' });
    const err = h('div', { class: 'bo-code__err', 'aria-live': 'polite' });
    const row = h('div', { class: 'bo-code' }, input, err);
    const fmt = (v) => { const c = String(v || '').toUpperCase().replace(/^\s*BRK/, '').replace(/[^A-Z0-9]/g, ''); return c.length === 16 ? 'BRK-' + c.match(/.{4}/g).join('-') : null; };
    let working = false;
    const submit = async () => {
      if (working) return;
      const code = fmt(input.value);
      if (!code) { err.textContent = 'A recovery code is BRK plus 16 letters and numbers, like BRK-7QXM-2K9D-HV4P-ZR8T.'; menus._sfx('ui_error'); return; }
      working = true; err.textContent = 'Checking...';
      try { await shop.redeem(code); menus._closeModal(true); toast(shop.owned.size ? `Purchases restored (${shop.owned.size} item${shop.owned.size === 1 ? '' : 's'}).` : 'Code accepted. No purchases on it yet.', 'good'); build(true); }
      catch (e) { err.textContent = errText(e, 'restore'); menus._sfx('ui_error'); }
      working = false;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); e.stopPropagation(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.blur(); menus._closeModal(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); input.blur(); menus.setInputMode('kbm'); menus._nav(e.key === 'ArrowUp' ? 'up' : 'down'); }
    });
    input.addEventListener('input', () => { err.textContent = ''; });
    menus._bind(row, { id: 'code', accept: () => { input.focus(); } });
    input.addEventListener('pointerdown', () => menus._setFocus(row));
    menus._openModal({
      title: 'RESTORE PURCHASES',
      text: 'Bought items before, on this or another device? Enter the recovery code you saved to bring them back.',
      body: row,
      buttons: [
        { label: 'RESTORE', cls: 'iw-btn--primary', sound: 'ui_confirm', accept: submit },
        { label: 'CANCEL', accept: () => menus._closeModal() },
      ],
    });
    menus._modal.classList.add('bo-modal--code');
    menus._setFocus(row, { snap: true });
  }

  // ---- notes (status + checkout outcome + recovery nag) and toolbar
  async function checkPending() {
    const p = shop.pendingOrder(); if (!p || busy) return;
    busy = true; toast('Checking your payment...');
    const r = await shop.confirm(p.provider, p.ref, 1);
    busy = false;
    toast({ paid: 'Payment confirmed! Your items are ready.', pending: 'Still waiting on the network. Crypto can take several minutes; this updates by itself.', failed: 'The payment did not go through. You were not charged.', rejected: 'We could not verify that payment. Contact support.', error: 'Could not reach the shop. Try again in a moment.', unknown: 'We could not find that order.' }[r.status] || 'Done', r.status === 'paid' ? 'good' : 'info');
    build(true);
  }

  function noteRow(cls, text, action) {
    const r = h('div', { class: 'bo-note ' + cls, role: 'status' }, h('span', { class: 'bo-note__text' }, text));
    if (action) r.append(menus._btn({ id: action.id, label: action.label, cls: (action.primary ? 'iw-btn--primary' : 'iw-btn--ghost') + ' iw-btn--small bo-note__btn', accept: action.fn }));
    return r;
  }
  function paintNotes() {
    notes.innerHTML = '';
    const pend = shop.pendingOrder(), n = shop.notice, rows = [];
    const retry = { id: 'note-retry', label: 'RETRY', fn: () => shop.refresh() };
    if (shop.state === 'offline') rows.push(noteRow('is-warn', 'You are offline. You can browse and preview, but buying and equipping need a connection.', retry));
    else if (shop.state === 'error') rows.push(noteRow('is-warn', shop.error === 'timeout' ? 'The shop is taking too long to answer. Your items are safe; try again in a moment.' : 'The shop ran into a problem on our side. Your items are safe; try again in a moment.', retry));
    else if (shop.state === 'unavailable') rows.push(noteRow('is-warn', 'The shop is not open yet. Check back soon.'));
    else if (pend) rows.push(noteRow('is-info', (n && n.kind === 'error' ? 'We could not check your payment just now. ' : '') + 'Your payment is still being confirmed. Crypto payments can take several minutes. Your items will appear here by themselves; you do not need to pay again.', { id: 'note-check', label: 'CHECK STATUS', fn: checkPending }));
    else if (n && n.kind === 'cancelled') rows.push(noteRow('is-info', 'Checkout cancelled. You were not charged.', { id: 'note-ok', label: 'OK', fn: () => shop.dismissNotice() }));
    else if (n && (n.kind === 'failed' || n.kind === 'rejected' || n.kind === 'unknown' || n.kind === 'error')) rows.push(noteRow('is-warn', { failed: 'The payment did not go through. You were not charged.', rejected: 'We could not verify that payment. If you were charged, contact support.', unknown: 'We could not find that order. If you were charged, contact support.', error: 'We could not confirm that payment right now. If you were charged, your items will still arrive.' }[n.kind], { id: 'note-ok', label: 'OK', fn: () => shop.dismissNotice() }));
    else if (shop.state === 'loading' && !shop.owned.size) rows.push(noteRow('is-info', 'Loading your items...'));
    else if (shop.mode === 'test' && shop.state === 'ready') rows.push(noteRow('is-info', 'TEST MODE: checkout uses test payments, no real money.'));
    if (shop.needsRecoverySave() && shop.state !== 'unavailable') rows.push(noteRow('is-save', 'SAVE YOUR RECOVERY CODE. It is the only way to get your purchases back if you clear site data or change device.', { id: 'note-save', label: 'SAVE MY CODE', primary: true, fn: () => showRecovery(false) }));
    notes.append(...rows); notes.style.display = rows.length ? '' : 'none';
  }
  function paintTools() {
    tools.innerHTML = '';
    if (shop.owned.size || shop.rec.code) tools.append(menus._btn({ id: 'recovery', label: 'MY RECOVERY CODE', icon: GLYPHS.key, cls: 'iw-btn--ghost iw-btn--small bo-tool', accept: () => showRecovery(false) }));
    tools.append(menus._btn({ id: 'restore', label: 'RESTORE PURCHASES', icon: GLYPHS.rotate, cls: 'iw-btn--ghost iw-btn--small bo-tool', accept: () => restore() }));
  }

  let tiles = [], mounted = false, lastSig = '';
  function build(keepFocus) {
    const had = menus._focus && menus._focus.isConnected ? menus._focus.dataset.id : null;
    tabBtns.forEach((b, i) => b.classList.toggle('is-sel', i === tab));
    grid.innerHTML = ''; paintNotes(); paintTools();
    tiles = items().map((it, n) => tile(it, n));
    grid.append(...tiles);
    if (sel) { const m = tiles.find((t) => t._it.id === sel.id); if (m) m.classList.add('is-sel'); else sel = null; }
    renderDetail();
    el.classList.toggle('has-sel', !!sel);
    if (!mounted || menus._modal) return;
    // keep the player's place across rebuilds: same control by id, else the selected tile, else the first useful thing
    let f = had && el.querySelector(`[data-id="${CSS.escape(had)}"]`);
    if (!f && keepFocus && sel) f = tiles.find((t) => t._it.id === sel.id);
    if (!f && !(menus._focus && menus._focus.isConnected)) f = tiles[0] || doneBtn;
    if (f) menus._setFocus(f, { snap: true });
  }
  build();

  // auto-open the "save your code" sheet once, right after the first purchase lands
  const maybePrompt = () => { if (menus.current === 'shop' && !menus._modal && !busy && shop.state === 'ready' && shop.needsRecoverySave() && !shop.rec.prompted) showRecovery(true); };
  const off = shop.on(() => {
    if (menus.current !== 'shop' || menus._modal) return;
    const sig = [shop.state, shop.error, shop.owned.size, shop.notice && shop.notice.kind, !!shop.pendingOrder(), shop.rec.saved, !!shop.rec.code].join('|');
    if (sig !== lastSig) { lastSig = sig; build(true); }
    maybePrompt();
  });
  const onOnline = () => { if (menus.current === 'shop' && shop.state !== 'ready') shop.refresh(); };
  const onShow = (e) => { if (e.persisted) busy = false; };      // back from the checkout page via bfcache
  window.addEventListener('online', onOnline); window.addEventListener('pageshow', onShow);
  // a pending crypto payment settles on its own: poll quietly while the Shop is open
  const poll = setInterval(() => { if (menus.current === 'shop' && !menus._modal && !busy && shop.pendingOrder() && shop.state === 'ready') shop.refresh(); }, 20000);
  shop.refresh();

  return {
    el,
    initial: () => tiles[0] || doneBtn,
    afterMount: () => {
      mounted = true;
      const w = menus._loadout().weapon; if (sc && sc.showLocker) safeCall(() => sc.showLocker(menus._style(), teamColor(), w));
      setTimeout(maybePrompt, 500);
    },
    onFocus: (f) => { if (f && f.scrollIntoView && !menus._modal) f.scrollIntoView({ block: 'nearest', inline: 'nearest' }); },
    onNav: (dir) => {
      if (dir === 'back' && !menus._modal && sel && compact() && menus._focus && detail.contains(menus._focus)) { const t = tiles.find((x) => x._it.id === sel.id); if (t) { menus._setFocus(t, { snap: true }); return true; } }
      if (dir === 'tab_prev' || dir === 'tab_next') { if (menus._modal) return true; tab = (tab + (dir === 'tab_next' ? 1 : TABS.length - 1)) % TABS.length; build(); menus._sfx('ui_click'); return true; }
      return false;
    },
    destroy: () => { off(); clearInterval(poll); window.removeEventListener('online', onOnline); window.removeEventListener('pageshow', onShow); allowPreview([]); if (sc && !['loadout', 'online', 'lobby', 'locker'].includes(menus.current)) safeCall(() => sc.hide()); },
  };
}
