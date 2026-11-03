/**
 * CARTES ISS ET ESPACE — Thème HC3 Fibaro Glossy
 * https://github.com/Marlboro62/ISS
 *
 * Cinq cartes dans un seul fichier :
 *   custom:glossy-iss-tracker-card   position de l'ISS sur une mini-carte
 *   custom:glossy-iss-passes-card    prochains passages ISS + graphique de distance
 *   custom:glossy-iss-transit-card   prochains transits ISS devant le Soleil et la Lune
 *   custom:glossy-launch-card        prochain lancement (intégration Next Launch)
 *   custom:glossy-space-dashboard-card  les quatre en un seul tableau de bord
 */

const CARD_VERSION = "0.3.0-beta.1";

// Enregistrement sans erreur si une ancienne copie de la carte est encore
// chargée comme ressource à côté de celle de HACS.
const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };

// ── Couleurs : variables partagées par les cinq cartes ──
// v2 (défaut) : bleu nuit des autres cartes (MyElectricalData, Météo, Serveur HA…)
// light : version claire (thème « auto » quand Home Assistant est en clair)
// ha : couleurs du thème Home Assistant ; glossy : orange HC3 Fibaro d'origine
const _ISS_THEME_CSS = `
:host{
  --g-bg:#1a2434;--g-deep:#131c2a;--g-panel:#212d40;--g-grad:#1a2434;
  --g-acc:#1d93e3;--g-acc2:#7cc4ff;--g-edge:#5b7fb0;--g-text:#e7edf5;--g-muted:#b4c3d8;
  --g-font:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,Roboto,'Noto',sans-serif));
  --g-font-t:var(--g-font);--g-font-m:var(--code-font-family,ui-monospace,monospace);
}
:host([data-theme="light"]){
  --g-bg:#ffffff;--g-deep:#eef2f7;--g-panel:#f2f5f9;--g-grad:#ffffff;
  --g-acc:#1673b8;--g-acc2:#1673b8;--g-edge:#9fb3cc;--g-text:#1a2434;--g-muted:#5b6b82;
}
:host([data-theme="ha"]){
  --g-bg:var(--ha-card-background,var(--card-background-color,#fff));
  --g-deep:color-mix(in srgb,var(--primary-text-color,#000) 7%,var(--g-bg));
  --g-panel:color-mix(in srgb,var(--primary-text-color,#000) 4%,var(--g-bg));--g-grad:var(--g-bg);
  --g-acc:var(--primary-color,#03a9f4);--g-acc2:var(--primary-color,#03a9f4);--g-edge:var(--primary-color,#03a9f4);
  --g-text:var(--primary-text-color,#212121);--g-muted:var(--primary-text-color,#212121);
}
:host([data-theme="glossy"]){
  --g-bg:#1a1a1a;--g-deep:#0e0e0e;--g-panel:rgba(28,28,28,.96);
  --g-grad:linear-gradient(175deg,#1e1e1e 0%,#141414 55%,#0f0f0f 100%);
  --g-acc:#e6750a;--g-acc2:#ffc06a;--g-edge:#e6750a;--g-text:#f2f2f2;--g-muted:#d2b48c;
  --g-font:'Rajdhani','Nunito',sans-serif;--g-font-t:'Orbitron',monospace;--g-font-m:'DM Mono',monospace;
}
`;
/** Applique le thème choisi (et le mode clair de Home Assistant pour « auto »). */
const _issTheme = (el, theme, hass) => {
  const t = theme || 'v2', light = hass?.themes?.darkMode === false;
  const mode = t === 'glossy' ? 'glossy' : t === 'ha' ? 'ha' : t === 'auto' && light ? 'light' : 'v2';
  if (el.getAttribute('data-theme') === mode) return;
  el.setAttribute('data-theme', mode);
  if (el._reTheme) el._reTheme();
};
const _ISS_THEMES = [
  ['v2', 'Style MyElectricalData (bleu nuit)'],
  ['auto', 'Style MyElectricalData, clair ou sombre selon Home Assistant'],
  ['ha', 'Thème Home Assistant (clair ou sombre)'],
  ['glossy', 'Glossy HC3 Fibaro (orange)'],
];
/** Liste « Couleurs de la carte » dans un éditeur (champ <select id="theme">). */
const _issThemeField = (cur) => `<div class="field"><label>Couleurs de la carte</label><select id="theme" style="width:100%;box-sizing:border-box;padding:7px 8px;border-radius:6px;border:1px solid var(--divider-color,#555);background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#eee);font-size:13px;">${_ISS_THEMES.map(([v, l]) => `<option value="${v}"${(cur || 'v2') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
const _issBindTheme = (ed) => {
  const sel = ed.shadowRoot && ed.shadowRoot.getElementById('theme');
  if (sel) sel.addEventListener('change', (e) => { ed._config = { ...ed._config, theme: e.target.value }; ed._emit(); });
};

/**
 * GLOSSY ISS TRACKER CARD — Position de l'ISS + petite carte
 * type: custom:glossy-iss-tracker-card
 * Thème HC3 Fibaro Glossy
 *
 * YAML (seule "entity" est requise) :
 *
 *   type: custom:glossy-iss-tracker-card
 *   entity: sensor.iss_position          # fournit latitude/longitude en attributs
 *   status_entity: sensor.iss            # optionnel — état utilisé pour le vert/rouge
 *                                         #   (par défaut : "entity" elle-même)
 *   lat_entity: sensor.iss_latitude      # optionnel — repli si l'attribut latitude est absent/à 0
 *   lon_entity: sensor.iss_longitude     # optionnel — repli si l'attribut longitude est absent/à 0
 *   zoom_span: 40                        # optionnel — largeur de la vue carte en degrés (défaut 40)
 *   stadia_api_key: ''                   # une des deux clés requise — client.stadiamaps.com (prioritaire)
 *   carto_api_key: ''                    # ou celle-ci — carto.com/basemaps/apikey (repli)
 *
 * Mini-carte en tuiles Stadia Maps ou CARTO, placées directement (aucune
 * bibliothèque ni script chargé depuis un CDN). Sans clé, la carte affiche un
 * message plutôt qu'une image : les serveurs de tuiles OpenStreetMap bloquent
 * l'usage embarqué dans une appli tierce sans en-têtes d'identification
 * appropriés (cf. osm.wiki/Blocked), donc pas de repli automatique dessus.
 */

const _IS_CSS = _ISS_THEME_CSS + `
  :host{
    --ok:#22dd88;--err:#ff4466;
    font-family:var(--g-font);
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}
  @keyframes is-blink{0%,100%{opacity:1;}50%{opacity:.4;}}

  .w{
    background:var(--g-grad);
    border-radius:16px;border:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);
    padding:8px;
  }

  .bar{
    display:flex;align-items:center;gap:10px;
    background:var(--g-grad);
    border:1px solid color-mix(in srgb,var(--g-edge) 22%,transparent);border-top:2px solid color-mix(in srgb,var(--g-acc) 60%,transparent);
    border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
    padding:0 12px;height:40px;margin-bottom:8px;
  }
  .bar ha-icon{--mdc-icon-size:22px;flex-shrink:0;transition:color .3s ease;}
  .bar ha-icon.ok{color:var(--ok);}
  .bar ha-icon.err{color:var(--err);animation:is-blink 2s ease-in-out infinite;}
  .bar-name{
    font-family:var(--g-font-t);font-weight:700;font-size:13px;letter-spacing:1px;
    color:var(--g-acc2);flex-shrink:0;
  }
  .bar-coords{font-size:14px;transition:color .3s ease;}
  .bar-coords.ok{color:var(--ok);}
  .bar-coords.err{color:var(--err);animation:is-blink 2s ease-in-out infinite;}

  .map-wrap{position:relative;width:100%;height:230px;border-radius:12px;overflow:hidden;background:var(--g-deep);}
  .tiles{position:absolute;inset:0;}
  .tiles img{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none;}
  .dot{
    position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
    background:var(--dc);border:2px solid var(--dc);box-shadow:0 0 0 4px color-mix(in srgb,var(--dc) 25%,transparent),0 0 14px var(--dc);
  }
  .attr{
    position:absolute;right:6px;bottom:4px;font-size:9px;color:color-mix(in srgb,var(--g-muted) 60%,transparent);
    background:color-mix(in srgb,var(--g-deep) 60%,transparent);padding:1px 5px;border-radius:4px;
  }
  .attr a{color:inherit;text-decoration:none;}
  .map-empty{
    display:flex;align-items:center;justify-content:center;height:100%;
    color:color-mix(in srgb,var(--g-muted) 52%,transparent);font-size:0.85rem;text-align:center;padding:0 20px;
  }
`;

// ── Projection Web Mercator (tuiles 256 px) ──
const _issWorldPx = (lat, lon, z) => {
  const n = 256 * 2 ** z, la = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  return { x: ((lon + 180) / 360) * n, y: (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n };
};
// Niveau de zoom des tuiles d'après la largeur de vue voulue, en degrés.
const _issZoom = (span) => Math.max(1, Math.min(10, Math.round(Math.log2(360 / (span || 40)))));
// URL des tuiles : Stadia Maps prioritaire, sinon CARTO, sinon rien (OSM bloque l'usage embarqué).
const _issTileUrl = (c) => c.stadia_api_key
  ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(c.stadia_api_key)}`
  : c.carto_api_key ? `https://basemaps.cartocdn.com/rastertiles/dark-matter/{z}/{x}/{y}.png?key=${encodeURIComponent(c.carto_api_key)}` : null;
const _issAttribution = (c) => c.stadia_api_key
  ? '<a href="https://stadiamaps.com/" target="_blank" rel="noopener">© Stadia Maps</a> <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'
  : '<a href="https://carto.com/attributions" target="_blank" rel="noopener">© CARTO</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
/** Images des tuiles couvrant W×H pixels, le point (lat, lon) au centre. */
const _issTilesHtml = (lat, lon, z, W, H, tileUrl) => {
  const n = 2 ** z, c = _issWorldPx(lat, lon, z);
  const x0 = Math.floor((c.x - W / 2) / 256), x1 = Math.floor((c.x + W / 2) / 256);
  const y0 = Math.max(0, Math.floor((c.y - H / 2) / 256)), y1 = Math.min(n - 1, Math.floor((c.y + H / 2) / 256));
  const r = window.devicePixelRatio > 1 ? '@2x' : '';
  let html = '';
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const wx = ((tx % n) + n) % n; // la carte fait le tour du monde en longitude
    const src = tileUrl.replace('{z}', z).replace('{x}', wx).replace('{y}', ty).replace('{r}', r);
    html += `<img alt="" src="${src}" style="left:${Math.round(tx * 256 - c.x + W / 2)}px;top:${Math.round(ty * 256 - c.y + H / 2)}px">`;
  }
  return html;
};

class GlossyIssTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._h = null;
    this._fp = null;
    this._ok = false;
  }

  setConfig(config) {
    config = config || {};
    this._config = {
      theme: config.theme || 'v2',
      entity: config.entity || '',
      status_entity: config.status_entity || config.entity || '',
      lat_entity: config.lat_entity || '',
      lon_entity: config.lon_entity || '',
      zoom_span: config.zoom_span != null ? config.zoom_span : 40,
      carto_api_key: config.carto_api_key || '',
      stadia_api_key: config.stadia_api_key || '',
    };
    // nouvelle config : tout réafficher au prochain passage de hass
    this._fp = null;
    if (this._ok) { this._buildDom(); if (this._h) this.hass = this._h; }
  }

  getCardSize() { return 4; }
  static getConfigElement() { return document.createElement('glossy-iss-tracker-card-editor'); }
  static getStubConfig() {
    return { entity: '', status_entity: '', lat_entity: '', lon_entity: '', carto_api_key: '', stadia_api_key: '' };
  }

  set hass(h) {
    this._h = h;
    if (!this._config) return; // hass peut arriver avant setConfig()
    _issTheme(this, this._config.theme, h);
    if (!this._ok) this._init();
    const ents = [this._config.entity, this._config.status_entity, this._config.lat_entity, this._config.lon_entity].filter(Boolean);
    const fp = ents.map(e => h.states[e]?.state || 'x').join('|')
      + '|' + JSON.stringify(h.states[this._config.entity]?.attributes || {});
    if (fp === this._fp) return;
    this._fp = fp;
    this._update();
  }

  _init() {
    this._ok = true;
    const sh = this.shadowRoot;
    sh.innerHTML = '';
    const st = document.createElement('style');
    st.textContent = _IS_CSS;
    sh.appendChild(st);
    const w = document.createElement('div'); w.className = 'w';
    sh.appendChild(w);
    this._w = w;
    this._buildDom();
  }

  // (Re)construit le squelette à partir de this._config. Appelé au premier
  // rendu et à chaque changement de config.
  _buildDom() {
    if (!this._w || !this._config) return;
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
    if (!this._config.entity) {
      this._w.innerHTML = '<div class="map-empty">Aucune entité configurée</div>';
      return;
    }
    this._w.innerHTML = `
      <div class="bar">
        <ha-icon id="is-icon" icon="mdi:satellite-variant"></ha-icon>
        <span class="bar-name">ISS TRACKER</span>
        <span class="bar-coords" id="is-coords">—</span>
      </div>
      <div class="map-wrap" id="is-map">
        <div class="map-empty">Position en attente…</div>
      </div>
    `;
  }

  disconnectedCallback() {
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
  }

  _update() {
    if (!this._h || !this._w || !this._config.entity) return;
    const s = this._h.states;
    const cfg = this._config;

    const statusState = s[cfg.status_entity];
    const isBad = !statusState || statusState.state === 'unavailable' || statusState.state === 'unknown';

    const icon = this._w.querySelector('#is-icon');
    if (icon) icon.className = isBad ? 'err' : 'ok';

    const mainEntity = s[cfg.entity];
    let lat = mainEntity?.attributes?.latitude;
    let lon = mainEntity?.attributes?.longitude;
    if (!lat || lat === 0) lat = cfg.lat_entity ? parseFloat(s[cfg.lat_entity]?.state) : NaN;
    if (!lon || lon === 0) lon = cfg.lon_entity ? parseFloat(s[cfg.lon_entity]?.state) : NaN;
    const hasCoords = typeof lat === 'number' && !isNaN(lat) && typeof lon === 'number' && !isNaN(lon) && !(lat === 0 && lon === 0);

    const coordsEl = this._w.querySelector('#is-coords');
    if (coordsEl) {
      coordsEl.textContent = hasCoords ? `Lat: ${lat.toFixed(2)} | Lon: ${lon.toFixed(2)}` : 'Signal perdu…';
      coordsEl.className = 'bar-coords ' + (isBad ? 'err' : 'ok');
    }

    const mapWrap = this._w.querySelector('#is-map');
    if (!mapWrap) return;
    if (!hasCoords) {
      mapWrap.innerHTML = '<div class="map-empty">Signal perdu — pas de position disponible</div>';
      return;
    }
    const tileUrl = _issTileUrl(this._config);
    if (!tileUrl) {
      mapWrap.innerHTML = `<div class="map-empty"><span>Carte désactivée : configure une clé gratuite <a href="https://client.stadiamaps.com/" target="_blank" rel="noopener" style="color:var(--g-acc2);">Stadia Maps</a> ou <a href="https://carto.com/basemaps/apikey" target="_blank" rel="noopener" style="color:var(--g-acc2);">CARTO</a> dans l'éditeur de la carte.</span></div>`;
      return;
    }

    this._pos = { lat, lon, color: isBad ? '#ff4466' : '#22dd88', tileUrl };
    if (!mapWrap.querySelector('.tiles')) {
      const attr = _issAttribution(this._config);
      mapWrap.innerHTML = `<div class="tiles"></div><div class="dot"></div><div class="attr">${attr}</div>`;
      // Le conteneur peut n'avoir sa vraie taille qu'un peu plus tard (onglet
      // ou section pas encore visible) : on redessine à chaque changement.
      if (this._resizeObs) this._resizeObs.disconnect();
      this._resizeObs = new ResizeObserver(() => this._drawTiles());
      this._resizeObs.observe(mapWrap);
    }
    this._drawTiles();
  }

  // Tuiles autour de l'ISS, centrée dans la mini-carte. Le navigateur garde
  // les tuiles en cache : seules les nouvelles sont téléchargées.
  _drawTiles() {
    const mapWrap = this._w && this._w.querySelector('#is-map');
    const layer = mapWrap && mapWrap.querySelector('.tiles');
    if (!layer || !this._pos) return;
    const W = mapWrap.offsetWidth, H = mapWrap.offsetHeight;
    if (!W || !H) return;
    const { lat, lon, color, tileUrl } = this._pos;
    layer.innerHTML = _issTilesHtml(lat, lon, _issZoom(this._config.zoom_span), W, H, tileUrl);
    mapWrap.querySelector('.dot')?.style.setProperty('--dc', color);
  }
}

define('glossy-iss-tracker-card', GlossyIssTrackerCard);

// ── Éditeur visuel de carte ──────────────────────────────────────────────
class GlossyIssTrackerCardEditor extends HTMLElement {
  setConfig(config) {
    const c = config || {};
    this._config = {
      ...c,
      entity: c.entity || '',
      status_entity: c.status_entity || '',
      lat_entity: c.lat_entity || '',
      lon_entity: c.lon_entity || '',
      zoom_span: c.zoom_span != null ? c.zoom_span : 40,
      carto_api_key: c.carto_api_key || '',
      stadia_api_key: c.stadia_api_key || '',
    };
    const echo = this._lastEmitted && JSON.stringify(this._lastEmitted) === JSON.stringify(this._config);
    if (!this._built || !echo) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) this._syncPickers();
    else this._render();
  }

  connectedCallback() { if (this._config) this._render(); }

  _emit() {
    this._lastEmitted = JSON.parse(JSON.stringify(this._config));
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _esc(s) { return (s || '').toString().replace(/"/g, '&quot;'); }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const sh = this.shadowRoot;
    const cfg = this._config;

    if (!this._hass) {
      // setConfig() arrive avant hass dans le cycle de vie HA : construire
      // les ha-entity-picker avec un hass encore vide les fait planter.
      sh.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--secondary-text-color,#888);">Chargement…</div>';
      this._built = false;
      return;
    }

    sh.innerHTML = `
      <style>
        .wrap{padding:4px 0;}
        .field{margin-bottom:12px;}
        label{display:block;font-size:12px;color:var(--secondary-text-color,#999);margin-bottom:3px;}
        input{
          width:100%;box-sizing:border-box;padding:7px 8px;border-radius:6px;
          border:1px solid var(--divider-color,#555);background:var(--card-background-color,#1c1c1c);
          color:var(--primary-text-color,#eee);font-size:13px;
        }
        .hint{font-size:11px;color:var(--secondary-text-color,#888);margin:-6px 0 12px;}
      </style>
      <div class="wrap">
        ${_issThemeField(cfg.theme)}
        <div class="field"><label>Entité position (attributs latitude/longitude)</label><ha-entity-picker id="entity"></ha-entity-picker></div>
        <div class="field"><label>Entité de statut (optionnel — vert/rouge)</label><ha-entity-picker id="status_entity"></ha-entity-picker></div>
        <div class="hint">Laisser vide utilise l'entité position elle-même pour déterminer si le signal est perdu.</div>
        <div class="field"><label>Latitude de repli (optionnel)</label><ha-entity-picker id="lat_entity"></ha-entity-picker></div>
        <div class="field"><label>Longitude de repli (optionnel)</label><ha-entity-picker id="lon_entity"></ha-entity-picker></div>
        <div class="field"><label>Largeur de la vue carte (degrés)</label><input id="zoom_span" type="number" value="${cfg.zoom_span}"></div>
        <div class="field"><label>Clé API Stadia Maps (prioritaire si les deux sont remplies)</label><input id="stadia_api_key" type="text" value="${this._esc(cfg.stadia_api_key)}" placeholder="client.stadiamaps.com"></div>
        <div class="field"><label>Clé API CARTO Basemaps (repli si pas de clé Stadia)</label><input id="carto_api_key" type="text" value="${this._esc(cfg.carto_api_key)}" placeholder="carto.com/basemaps/apikey"></div>
        <div class="hint">L'une des deux clés (gratuites) est requise pour afficher la carte — sans ça, un message s'affiche à la place. OpenStreetMap bloque l'usage embarqué sans clé. Tes clés restent dans ta propre config, jamais dans le fichier partagé.</div>
      </div>
    `;

    ['entity', 'status_entity', 'lat_entity', 'lon_entity'].forEach(key => {
      const picker = sh.getElementById(key);
      requestAnimationFrame(() => {
        if (!picker.isConnected) return;
        picker.hass = this._hass;
        picker.includeDomains = ['sensor'];
        picker.value = cfg[key] || '';
      });
      picker.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        this._config = { ...this._config, [key]: ev.detail.value };
        this._emit();
      });
    });

    sh.getElementById('zoom_span').addEventListener('input', e => {
      this._config = { ...this._config, zoom_span: parseFloat(e.target.value) || 40 };
      this._emit();
    });
    sh.getElementById('carto_api_key').addEventListener('input', e => {
      this._config = { ...this._config, carto_api_key: e.target.value };
      this._emit();
    });
    sh.getElementById('stadia_api_key').addEventListener('input', e => {
      this._config = { ...this._config, stadia_api_key: e.target.value };
      this._emit();
    });

    _issBindTheme(this);
    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-iss-tracker-card-editor', GlossyIssTrackerCardEditor);

/**
 * GLOSSY ISS PASSES CARD — Prochains passages ISS (visible/global) + distance
 * type: custom:glossy-iss-passes-card
 * Thème HC3 Fibaro Glossy
 *
 * YAML (tout est optionnel — chaque section ne s'affiche que si son
 * entité "readable" est configurée) :
 *
 *   type: custom:glossy-iss-passes-card
 *   title: Passages ISS
 *   visible_readable_entity: sensor.iss_prochain_passage_visible_lisible  # état = date déjà formatée
 *   visible_attrs_entity:    sensor.iss_prochain_passage_visible          # attrs: duration, maxEl, startAzCompass, maxAzCompass, endAzCompass
 *   global_readable_entity:  sensor.iss_prochain_passage_global_lisible
 *   global_attrs_entity:     sensor.iss_prochain_passage_global
 *   distance_entity: sensor.distance_iss     # optionnel — affiche un petit graphique
 *   distance_hours: 12                       # optionnel — fenêtre d'historique (défaut 12h)
 */

const _IP_CSS = _ISS_THEME_CSS + `
  :host{
    --c1:var(--g-acc);--c4:var(--g-acc2);
    font-family:var(--g-font);
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}

  .w{
    position:relative;overflow:hidden;
    background:var(--g-grad);
    border-radius:16px;border:1px solid color-mix(in srgb,var(--g-edge) 22%,transparent);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 8px 28px rgba(0,0,0,0.65);
    padding:18px;
  }
  .w::before{
    content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,transparent,var(--c1),transparent);opacity:.8;z-index:1;
  }

  .sec{
    font-family:var(--g-font-t);font-size:0.82rem;font-weight:600;
    letter-spacing:2px;color:color-mix(in srgb,var(--g-acc) 85%,transparent);text-transform:uppercase;
    margin-bottom:12px;display:flex;align-items:center;gap:8px;
    border-bottom:1px solid color-mix(in srgb,var(--g-edge) 25%,transparent);padding-bottom:6px;
  }
  .sec.spaced{margin-top:18px;}

  .pass{margin-bottom:4px;}
  .pass p{color:color-mix(in srgb,var(--g-muted) 75%,transparent);font-size:0.95rem;line-height:1.7;margin:0;}
  .pass strong{color:var(--g-acc2);font-weight:700;}

  .graph-wrap{margin-top:6px;}
  .graph-now{font-family:var(--g-font-t);font-size:1.3rem;font-weight:800;color:var(--g-text);}
  .graph-unit{font-size:0.72rem;color:color-mix(in srgb,var(--g-muted) 55%,transparent);margin-left:4px;}
  svg{width:100%;height:70px;display:block;margin-top:6px;}

  .empty-state{text-align:center;padding:20px 12px;color:color-mix(in srgb,var(--g-muted) 52%,transparent);font-size:0.85rem;}
`;

class GlossyIssPassesCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._h = null;
    this._fp = null;
    this._ok = false;
    this._distHistory = null;
    this._distLastFetch = 0;
  }

  setConfig(config) {
    config = config || {};
    this._config = {
      theme: config.theme || 'v2',
      title: config.title || 'Passages ISS',
      visible_readable_entity: config.visible_readable_entity || '',
      visible_attrs_entity: config.visible_attrs_entity || '',
      global_readable_entity: config.global_readable_entity || '',
      global_attrs_entity: config.global_attrs_entity || '',
      distance_entity: config.distance_entity || '',
      distance_hours: config.distance_hours != null ? config.distance_hours : 12,
    };
    // nouvelle config : tout réafficher au prochain passage de hass
    this._fp = null;
    if (this._ok) { this._buildDom(); if (this._h) this.hass = this._h; }
  }

  getCardSize() { return 4; }
  static getConfigElement() { return document.createElement('glossy-iss-passes-card-editor'); }
  static getStubConfig() {
    return {
      title: 'Passages ISS',
      visible_readable_entity: '', visible_attrs_entity: '',
      global_readable_entity: '', global_attrs_entity: '',
      distance_entity: '',
    };
  }

  set hass(h) {
    this._h = h;
    if (!this._config) return; // hass peut arriver avant setConfig()
    _issTheme(this, this._config.theme, h);
    if (!this._ok) this._init();
    const ents = [
      this._config.visible_readable_entity, this._config.visible_attrs_entity,
      this._config.global_readable_entity, this._config.global_attrs_entity,
      this._config.distance_entity,
    ].filter(Boolean);
    const fp = ents.map(e => {
      const st = h.states[e];
      return st ? st.state + '|' + JSON.stringify(st.attributes) : 'x';
    }).join('||');
    if (fp !== this._fp) {
      this._fp = fp;
      this._update();
    }
    if (this._config.distance_entity) this._maybeLoadDistanceHistory();
  }

  _init() {
    this._ok = true;
    const sh = this.shadowRoot;
    sh.innerHTML = '';
    const lnk = document.createElement('link');
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=Rajdhani:wght@400;600&display=swap';
    sh.appendChild(lnk);
    const st = document.createElement('style');
    st.textContent = _IP_CSS;
    sh.appendChild(st);
    const w = document.createElement('div'); w.className = 'w';
    sh.appendChild(w);
    this._w = w;
    this._buildDom();
  }

  // (Re)construit le squelette à partir de this._config. Appelé au premier
  // rendu et à chaque changement de config.
  _buildDom() {
    if (!this._w || !this._config) return;
    const cfg = this._config;
    let html = `<div class="sec">${this._esc(cfg.title.toUpperCase())}</div>`;
    let any = false;

    if (cfg.visible_readable_entity) {
      any = true;
      html += `<div class="pass" id="pass-visible"></div>`;
    }
    if (cfg.global_readable_entity) {
      any = true;
      html += `<div class="sec spaced">PASSAGE GLOBAL</div><div class="pass" id="pass-global"></div>`;
    }
    if (cfg.distance_entity) {
      any = true;
      html += `
        <div class="sec spaced">DISTANCE</div>
        <div class="graph-wrap">
          <span class="graph-now" id="dist-now">—</span><span class="graph-unit">km</span>
          <svg id="dist-svg" viewBox="0 0 300 70" preserveAspectRatio="none"></svg>
        </div>`;
    }

    if (!any) html += `<div class="empty-state">Aucune entité configurée</div>`;
    this._w.innerHTML = html;
    this._distHistory = null; // force un redessin du graphe au prochain fetch
  }

  _q(id) { return this._w.querySelector('#' + id); }
  _esc(s) { return (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  _renderPass(elId, readableEntity, attrsEntity) {
    const el = this._q(elId);
    if (!el) return;
    const s = this._h.states;
    const readable = readableEntity ? s[readableEntity] : null;
    const attrs = attrsEntity ? s[attrsEntity]?.attributes : null;

    let lines = [`<p><strong>Début :</strong> ${this._esc(readable ? readable.state : '—')}</p>`];
    if (attrs) {
      if (attrs.duration != null) {
        const min = (parseInt(attrs.duration, 10) / 60).toFixed(1);
        if (min !== 'NaN') lines.push(`<p><strong>Durée :</strong> ${min} min</p>`);
      }
      if (attrs.maxEl != null) {
        lines.push(`<p><strong>Élévation max :</strong> ${this._esc(attrs.maxEl)}°</p>`);
      }
      if (attrs.startAzCompass != null || attrs.maxAzCompass != null || attrs.endAzCompass != null) {
        const path = [attrs.startAzCompass, attrs.maxAzCompass, attrs.endAzCompass].filter(Boolean).join(' → ');
        lines.push(`<p><strong>Trajet :</strong> ${this._esc(path)}</p>`);
      }
    }
    el.innerHTML = lines.join('');
  }

  _update() {
    if (!this._h || !this._w) return;
    const cfg = this._config;
    if (cfg.visible_readable_entity) this._renderPass('pass-visible', cfg.visible_readable_entity, cfg.visible_attrs_entity);
    if (cfg.global_readable_entity) this._renderPass('pass-global', cfg.global_readable_entity, cfg.global_attrs_entity);

    if (cfg.distance_entity) {
      const st = this._h.states[cfg.distance_entity];
      const nowEl = this._q('dist-now');
      if (nowEl) {
        const v = st ? parseFloat(st.state) : NaN;
        nowEl.textContent = isNaN(v) ? '—' : Math.round(v).toLocaleString('fr-FR');
      }
      this._drawGraph();
    }
  }

  async _maybeLoadDistanceHistory() {
    if (!this._h || !this._config.distance_entity) return;
    const now = Date.now();
    if (now - this._distLastFetch < 5 * 60 * 1000 && this._distLastFetch !== 0) return;
    this._distLastFetch = now;
    try {
      const startIso = new Date(now - this._config.distance_hours * 3600 * 1000).toISOString();
      const result = await this._h.connection.sendMessagePromise({
        type: 'history/history_during_period',
        start_time: startIso,
        entity_ids: [this._config.distance_entity],
        minimal_response: true,
        no_attributes: true,
      });
      const rows = result?.[this._config.distance_entity] || [];
      this._distHistory = rows
        .map(r => parseFloat(r.s ?? r.state))
        .filter(v => !isNaN(v));
      this._drawGraph();
    } catch (e) {
      console.error('[glossy-iss-passes-card] échec du chargement de l\'historique distance :', e);
    }
  }

  _drawGraph() {
    const svg = this._q('dist-svg');
    if (!svg || !this._distHistory || this._distHistory.length < 2) return;
    const vals = this._distHistory;
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = (max - min) || 1;
    const W = 300, H = 70;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = pts.join(' ');
    const fill = `0,${H} ${line} ${W},${H}`;
    svg.innerHTML = `
      <polygon points="${fill}" style="fill:color-mix(in srgb,var(--g-acc) 15%,transparent)"></polygon>
      <polyline points="${line}" fill="none" stroke-width="2" style="stroke:var(--g-acc)"></polyline>
    `;
  }
}

define('glossy-iss-passes-card', GlossyIssPassesCard);

// ── Éditeur visuel de carte ──────────────────────────────────────────────
class GlossyIssPassesCardEditor extends HTMLElement {
  setConfig(config) {
    const c = config || {};
    this._config = {
      ...c,
      title: c.title || 'Passages ISS',
      visible_readable_entity: c.visible_readable_entity || '',
      visible_attrs_entity: c.visible_attrs_entity || '',
      global_readable_entity: c.global_readable_entity || '',
      global_attrs_entity: c.global_attrs_entity || '',
      distance_entity: c.distance_entity || '',
      distance_hours: c.distance_hours != null ? c.distance_hours : 12,
    };
    const echo = this._lastEmitted && JSON.stringify(this._lastEmitted) === JSON.stringify(this._config);
    if (!this._built || !echo) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) this._syncPickers();
    else this._render();
  }

  connectedCallback() { if (this._config) this._render(); }

  _emit() {
    this._lastEmitted = JSON.parse(JSON.stringify(this._config));
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _esc(s) { return (s || '').toString().replace(/"/g, '&quot;'); }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const sh = this.shadowRoot;
    const cfg = this._config;

    if (!this._hass) {
      sh.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--secondary-text-color,#888);">Chargement…</div>';
      this._built = false;
      return;
    }

    sh.innerHTML = `
      <style>
        .wrap{padding:4px 0;}
        .field{margin-bottom:12px;}
        label{display:block;font-size:12px;color:var(--secondary-text-color,#999);margin-bottom:3px;}
        input{
          width:100%;box-sizing:border-box;padding:7px 8px;border-radius:6px;
          border:1px solid var(--divider-color,#555);background:var(--card-background-color,#1c1c1c);
          color:var(--primary-text-color,#eee);font-size:13px;
        }
        h4{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--secondary-text-color,#999);margin:16px 0 8px;}
        .hint{font-size:11px;color:var(--secondary-text-color,#888);margin:-6px 0 12px;}
      </style>
      <div class="wrap">
        ${_issThemeField(cfg.theme)}
        <div class="field"><label>Titre</label><input id="title" type="text" value="${this._esc(cfg.title)}"></div>

        <h4>Prochain passage visible</h4>
        <div class="field"><label>Entité lisible (texte déjà formaté)</label><ha-entity-picker id="visible_readable_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité attributs (durée, élévation, trajet — optionnel)</label><ha-entity-picker id="visible_attrs_entity"></ha-entity-picker></div>

        <h4>Prochain passage global</h4>
        <div class="hint">Laisser vide masque toute la section.</div>
        <div class="field"><label>Entité lisible (texte déjà formaté)</label><ha-entity-picker id="global_readable_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité attributs (optionnel)</label><ha-entity-picker id="global_attrs_entity"></ha-entity-picker></div>

        <h4>Distance ISS (optionnel)</h4>
        <div class="hint">Laisser vide masque le graphique.</div>
        <div class="field"><label>Entité distance</label><ha-entity-picker id="distance_entity"></ha-entity-picker></div>
        <div class="field"><label>Fenêtre d'historique (heures)</label><input id="distance_hours" type="number" value="${cfg.distance_hours}"></div>
      </div>
    `;

    sh.getElementById('title').addEventListener('input', e => {
      this._config = { ...this._config, title: e.target.value };
      this._emit();
    });
    sh.getElementById('distance_hours').addEventListener('input', e => {
      this._config = { ...this._config, distance_hours: parseFloat(e.target.value) || 12 };
      this._emit();
    });

    ['visible_readable_entity', 'visible_attrs_entity', 'global_readable_entity', 'global_attrs_entity', 'distance_entity'].forEach(key => {
      const picker = sh.getElementById(key);
      requestAnimationFrame(() => {
        if (!picker.isConnected) return;
        picker.hass = this._hass;
        picker.includeDomains = ['sensor'];
        picker.value = cfg[key] || '';
      });
      picker.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        this._config = { ...this._config, [key]: ev.detail.value };
        this._emit();
      });
    });

    _issBindTheme(this);
    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-iss-passes-card-editor', GlossyIssPassesCardEditor);

/**
 * GLOSSY ISS TRANSIT CARD — Prochains transits solaires/lunaires de l'ISS
 * type: custom:glossy-iss-transit-card
 * Thème HC3 Fibaro Glossy
 *
 * Pensée pour l'intégration/capteur qui calcule les prochains transits
 * ISS devant le Soleil et la Lune (attributs : date, duration_seconds,
 * max_elevation_deg, iss_distance_km, closest_approach_deg).
 *
 * YAML (les deux entités sont optionnelles, mais au moins une doit être
 * renseignée pour que la carte affiche quelque chose) :
 *
 *   type: custom:glossy-iss-transit-card
 *   title: Transits ISS
 *   solar_entity: sensor.iss_next_solar_transit
 *   lunar_entity: sensor.iss_next_lunar_transit
 */

const _IT_CSS = _ISS_THEME_CSS + `
  :host{
    --c1:var(--g-acc);--c4:var(--g-acc2);--c5:#4caf50;
    --sun:#ffc857;--moon:#8ab4ff;
    --bg:var(--g-bg);--panel:var(--g-panel);
    --border:color-mix(in srgb,var(--g-edge) 22%,transparent);--muted:color-mix(in srgb,var(--g-muted) 52%,transparent);
    font-family:var(--g-font);
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}
  .w{position:relative;border-radius:16px;overflow:hidden;background:var(--bg);padding:20px;}
  .cv{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;}
  .in{position:relative;z-index:1;}
  .sec{
    font-family:var(--g-font-t);font-size:0.82rem;font-weight:600;
    letter-spacing:2px;color:var(--muted);text-transform:uppercase;
    margin-bottom:14px;display:flex;align-items:center;gap:8px;
  }
  .sec::after{content:'';flex:1;height:1px;background:var(--border);}

  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  @media(max-width:520px){.grid{grid-template-columns:1fr;}}

  .panel{
    background:var(--panel);border:1px solid var(--border);border-radius:14px;
    padding:16px;position:relative;overflow:hidden;
  }
  .panel::before{
    content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,transparent,var(--tc),transparent);opacity:.7;
  }
  .p-head{display:flex;align-items:center;gap:9px;margin-bottom:12px;}
  .p-ico{font-size:1.4rem;}
  .p-title{font-family:var(--g-font-t);font-size:0.74rem;font-weight:700;letter-spacing:1px;color:var(--tc);text-transform:uppercase;}

  .p-empty{font-size:0.82rem;color:var(--muted);line-height:1.5;padding:6px 0 2px;}

  .p-date{font-family:var(--g-font-t);font-size:1.15rem;font-weight:800;color:var(--g-text);line-height:1.3;}
  .p-countdown{
    display:inline-flex;align-items:center;gap:5px;margin-top:7px;
    font-size:0.74rem;font-weight:700;color:var(--tc);
    background:rgba(255,255,255,0.05);border:1px solid var(--border);
    padding:3px 10px;border-radius:20px;
  }

  .p-met{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px;}
  .mi{
    background:rgba(255,255,255,.04);border:1px solid var(--border);
    border-radius:10px;padding:9px 6px;text-align:center;min-width:0;overflow:hidden;
  }
  .mii{font-size:1rem;margin-bottom:3px;}
  .mil{font-size:0.62rem;letter-spacing:.3px;color:var(--muted);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;}
  .miv{font-family:var(--g-font-t);font-size:0.85rem;font-weight:700;line-height:1;color:var(--g-text);}

  .empty-state{text-align:center;padding:26px 12px;color:var(--muted);font-size:0.85rem;}
`;

function _itFmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function _itCountdown(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  let s = Math.round((d.getTime() - Date.now()) / 1000);
  if (s < 0) return 'passé';
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const mins = Math.floor(s / 60);
  if (days > 0) return `dans ${days}j ${hours}h`;
  if (hours > 0) return `dans ${hours}h ${mins}m`;
  return `dans ${mins}m`;
}

const _issDuration = (sec) => _itFmtDuration(sec);
function _itFmtDuration(sec) {
  const n = parseFloat(sec);
  if (isNaN(n)) return '—';
  if (n >= 60) return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`;
  // un transit devant le Soleil ou la Lune dure souvent moins d'une seconde
  if (n < 10) return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  return `${Math.round(n)}s`;
}

class GlossyIssTransitCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._h = null;
    this._fp = null;
    this._ok = false;
  }

  setConfig(config) {
    config = config || {};
    this._config = {
      theme: config.theme || 'v2',
      title: config.title || 'Transits ISS',
      solar_entity: config.solar_entity || '',
      lunar_entity: config.lunar_entity || '',
    };
    // nouvelle config : tout réafficher au prochain passage de hass
    this._fp = null;
    if (this._ok) { this._buildDom(); if (this._h) this.hass = this._h; }
  }

  getCardSize() { return 4; }
  static getConfigElement() { return document.createElement('glossy-iss-transit-card-editor'); }
  static getStubConfig() {
    return { title: 'Transits ISS', solar_entity: '', lunar_entity: '' };
  }

  set hass(h) {
    this._h = h;
    if (!this._config) return; // hass peut arriver avant setConfig()
    _issTheme(this, this._config.theme, h);
    if (!this._ok) this._init();
    const ents = [this._config.solar_entity, this._config.lunar_entity].filter(Boolean);
    const fp = ents.map(e => {
      const st = h.states[e];
      return st ? st.state + '|' + JSON.stringify(st.attributes) : 'x';
    }).join('||');
    if (fp === this._fp) return;
    this._fp = fp;
    this._update();
  }

  _init() {
    this._ok = true;
    const sh = this.shadowRoot;
    sh.innerHTML = '';
    const lnk = document.createElement('link');
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=Rajdhani:wght@400;600&display=swap';
    sh.appendChild(lnk);
    const st = document.createElement('style');
    st.textContent = _IT_CSS;
    sh.appendChild(st);
    const w = document.createElement('div'); w.className = 'w';
    const cv = document.createElement('canvas'); cv.className = 'cv';
    w.appendChild(cv);
    const inn = document.createElement('div'); inn.className = 'in';
    w.appendChild(inn);
    sh.appendChild(w);
    this._inn = inn;
    this._particles(cv, w);
    this._buildDom();
  }

  // (Re)construit tout le contenu à partir de this._config. Appelé au
  // premier rendu et à chaque changement de config.
  _buildDom() {
    if (!this._inn || !this._config) return;
    const cfg = this._config;
    const panels = [];
    if (cfg.solar_entity) panels.push({ kind: 'solar', icon: '☀️', label: 'TRANSIT SOLAIRE', color: 'var(--sun)' });
    if (cfg.lunar_entity) panels.push({ kind: 'lunar', icon: '🌙', label: 'TRANSIT LUNAIRE', color: 'var(--moon)' });

    if (!panels.length) {
      this._inn.innerHTML = `
        <div class="sec">${this._esc(cfg.title.toUpperCase())}</div>
        <div class="empty-state">Aucune entité configurée</div>`;
      return;
    }

    this._inn.innerHTML = `
      <div class="sec">${this._esc(cfg.title.toUpperCase())}</div>
      <div class="grid">
        ${panels.map(p => `
          <div class="panel" id="p-${p.kind}" style="--tc:${p.color}">
            <div class="p-head">
              <span class="p-ico">${p.icon}</span>
              <span class="p-title">${p.label}</span>
            </div>
            <div id="body-${p.kind}"></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _particles(cv, w) {
    const cx = cv.getContext('2d'); let W, H, S = [];
    let P = [], L = '';
    const ri = () => {
      const g = getComputedStyle(this);
      P = [g.getPropertyValue('--g-acc').trim() || '#1d93e3', g.getPropertyValue('--g-acc2').trim() || '#7cc4ff'];
      L = P[0];
      const r = w.getBoundingClientRect();
      W = cv.width = r.width || 400; H = cv.height = r.height || 300;
      const n = Math.min(80, Math.floor(H / 6)); S = [];
      for (let i = 0; i < n; i++) S.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.2 + .3,
        dx: (Math.random() - .5) * .18, dy: (Math.random() - .5) * .18,
        a: Math.random(), da: Math.random() * .005 + .002,
        c: P[Math.floor(Math.random() * P.length)],
      });
    };
    const dr = () => {
      if (!cv.isConnected) return;
      cx.clearRect(0, 0, W, H);
      S.forEach(s => {
        s.a += s.da; if (s.a > 1 || s.a < 0) s.da *= -1;
        s.x += s.dx; s.y += s.dy;
        if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
        if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
        cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        cx.fillStyle = s.c; cx.globalAlpha = s.a * .7; cx.fill();
      });
      cx.globalAlpha = 1;
      for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
        const dx = S[i].x - S[j].x, dy = S[i].y - S[j].y;
        if (dx * dx + dy * dy < 6000) {
          cx.beginPath(); cx.moveTo(S[i].x, S[i].y); cx.lineTo(S[j].x, S[j].y);
          cx.globalAlpha = .07; cx.strokeStyle = L; cx.lineWidth = .4; cx.stroke(); cx.globalAlpha = 1;
        }
      }
      requestAnimationFrame(dr);
    };
    this._reTheme = ri;
    new ResizeObserver(ri).observe(w); ri(); dr();
  }

  _q(id) { return this._inn.querySelector('#' + id); }
  _esc(s) { return (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  _update() {
    if (!this._h) return;
    const s = this._h.states;
    const cfg = this._config;

    [
      { kind: 'solar', entity: cfg.solar_entity, showDistance: false },
      { kind: 'lunar', entity: cfg.lunar_entity, showDistance: true },
    ].forEach(({ kind, entity, showDistance }) => {
      if (!entity) return;
      const body = this._q(`body-${kind}`);
      if (!body) return;

      const st = s[entity];
      const attrs = st?.attributes || {};
      const date = attrs.date;
      const closest = attrs.closest_approach_deg;

      if (!date) {
        body.innerHTML = `
          <div class="p-empty">
            Aucun transit prévu dans l'année.
            ${closest != null ? `<br>Approche la plus proche : <strong>${Number(closest).toFixed(1)}°</strong>` : ''}
          </div>`;
        return;
      }

      const countdown = _itCountdown(date);
      const elevation = attrs.max_elevation_deg;
      const distance = attrs.iss_distance_km;

      let metrics = `
        <div class="mi"><div class="mii">⏱️</div><div class="mil">Durée</div><div class="miv">${this._esc(_itFmtDuration(attrs.duration_seconds))}</div></div>
        <div class="mi"><div class="mii">📐</div><div class="mil">Élévation</div><div class="miv">${elevation != null ? Number(elevation).toFixed(1) + '°' : '—'}</div></div>
      `;
      if (showDistance) {
        metrics += `<div class="mi" style="grid-column:1 / -1;"><div class="mii">🛰️</div><div class="mil">Distance ISS</div><div class="miv">${distance != null ? Math.round(distance).toLocaleString('fr-FR') + ' km' : '—'}</div></div>`;
      }

      body.innerHTML = `
        <div class="p-date">${this._esc(_itFmtDate(date))}</div>
        ${countdown ? `<div class="p-countdown">${countdown === 'passé' ? '✓ passé' : '⏳ ' + countdown}</div>` : ''}
        <div class="p-met">${metrics}</div>
      `;
    });
  }
}

define('glossy-iss-transit-card', GlossyIssTransitCard);

// ── Éditeur visuel de carte ──────────────────────────────────────────────
class GlossyIssTransitCardEditor extends HTMLElement {
  setConfig(config) {
    const c = config || {};
    this._config = {
      ...c,
      title: c.title || 'Transits ISS',
      solar_entity: c.solar_entity || '',
      lunar_entity: c.lunar_entity || '',
    };
    const echo = this._lastEmitted && JSON.stringify(this._lastEmitted) === JSON.stringify(this._config);
    if (!this._built || !echo) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) this._syncPickers();
    else this._render();
  }

  connectedCallback() { if (this._config) this._render(); }

  _emit() {
    this._lastEmitted = JSON.parse(JSON.stringify(this._config));
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _esc(s) { return (s || '').toString().replace(/"/g, '&quot;'); }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const sh = this.shadowRoot;
    const cfg = this._config;

    if (!this._hass) {
      // setConfig() arrive avant hass dans le cycle de vie HA : construire
      // les ha-entity-picker avec un hass encore vide les fait planter.
      sh.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--secondary-text-color,#888);">Chargement…</div>';
      this._built = false;
      return;
    }

    sh.innerHTML = `
      <style>
        .wrap{padding:4px 0;}
        .field{margin-bottom:12px;}
        label{display:block;font-size:12px;color:var(--secondary-text-color,#999);margin-bottom:3px;}
        input{
          width:100%;box-sizing:border-box;padding:7px 8px;border-radius:6px;
          border:1px solid var(--divider-color,#555);background:var(--card-background-color,#1c1c1c);
          color:var(--primary-text-color,#eee);font-size:13px;
        }
        .hint{font-size:11px;color:var(--secondary-text-color,#888);margin:-6px 0 12px;}
      </style>
      <div class="wrap">
        ${_issThemeField(cfg.theme)}
        <div class="field"><label>Titre</label><input id="title" type="text" value="${this._esc(cfg.title)}"></div>
        <div class="hint">Les deux entités sont optionnelles, mais il en faut au moins une pour que la carte affiche quelque chose.</div>
        <div class="field"><label>Entité transit solaire</label><ha-entity-picker id="solar_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité transit lunaire</label><ha-entity-picker id="lunar_entity"></ha-entity-picker></div>
      </div>
    `;

    sh.getElementById('title').addEventListener('input', e => {
      this._config = { ...this._config, title: e.target.value };
      this._emit();
    });

    ['solar_entity', 'lunar_entity'].forEach(key => {
      const picker = sh.getElementById(key);
      requestAnimationFrame(() => {
        if (!picker.isConnected) return;
        picker.hass = this._hass;
        picker.includeDomains = ['sensor'];
        picker.value = cfg[key] || '';
      });
      picker.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        this._config = { ...this._config, [key]: ev.detail.value };
        this._emit();
      });
    });

    _issBindTheme(this);
    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-iss-transit-card-editor', GlossyIssTransitCardEditor);

/**
 * GLOSSY LAUNCH CARD — Prochain lancement (Next Launch)
 * type: custom:glossy-launch-card
 * Thème HC3 Fibaro Glossy
 *
 * Pensée pour l'intégration HACS "Next Launch" (plusieurs capteurs :
 * infos générales, mission, date, probabilité météo, statut).
 *
 * YAML (seule "entity" est requise) :
 *
 *   type: custom:glossy-launch-card
 *   entity: sensor.next_launch_prochain_lancement          # provider, pad, facility (attributs)
 *   mission_entity: sensor.next_launch_mission_de_lancement # nom mission, target_orbit, rocket_name, description
 *   date_entity: sensor.next_launch_date_de_lancement       # date/heure ISO
 *   probability_entity: sensor.next_launch_probabilite_de_lancement  # optionnel
 *   status_entity: sensor.next_launch_statut_de_lancement   # optionnel
 *   imminent_minutes: 15   # optionnel — glow rouge clignotant sous ce seuil (défaut 15)
 */

const _LC_CSS = _ISS_THEME_CSS + `
  :host{
    --c1:var(--g-acc);--c4:var(--g-acc2);--ok:#22dd88;--err:#ff4466;
    --bg:var(--g-bg);
    font-family:var(--g-font);
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}
  @keyframes lc-blink{0%,100%{opacity:1;}50%{opacity:.35;}}

  .w{
    position:relative;border-radius:16px;overflow:hidden;
    background:var(--g-grad);
    border:1px solid color-mix(in srgb,var(--g-edge) 22%,transparent);
    border-top:2px solid color-mix(in srgb,var(--g-acc) 75%,transparent);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 8px 28px rgba(0,0,0,0.65);
    padding:16px;transition:background .5s ease,border-color .5s ease,box-shadow .5s ease;
  }
  .w.imminent{
    background:rgba(255,68,102,0.08);
    border:2px solid rgba(255,68,102,0.9);
    box-shadow:inset 0 0 4px rgba(255,68,102,0.8),inset 0 0 10px rgba(255,68,102,0.35);
  }

  .provider{
    color:var(--g-acc2);font-size:11px;font-weight:700;text-transform:uppercase;
    font-family:var(--g-font-t);letter-spacing:1px;
  }
  .mission{font-size:18px;font-weight:700;line-height:1.2;color:var(--g-text);margin-top:2px;}

  .launch-time{
    display:flex;align-items:center;gap:6px;margin-top:10px;
    color:var(--g-acc2);font-size:14px;font-weight:700;font-family:var(--g-font-t);
  }
  .launch-time ha-icon{--mdc-icon-size:16px;color:var(--g-acc2);}
  .launch-time.blink{animation:lc-blink 1s infinite;color:var(--err);}
  .launch-time.blink ha-icon{color:var(--err);}

  .info{color:color-mix(in srgb,var(--g-muted) 75%,transparent);font-size:12px;margin-top:8px;line-height:1.3;}
  .info ha-icon{--mdc-icon-size:14px;color:color-mix(in srgb,var(--g-muted) 75%,transparent);vertical-align:-2px;}
  .info .facility{font-size:10px;opacity:.8;margin-left:18px;display:block;margin-top:1px;}

  .stats{
    display:flex;flex-direction:column;gap:6px;font-size:14px;text-align:left;color:var(--g-text);
    padding:10px 0;border-top:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);border-bottom:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);
    margin:10px 0;
  }
  .stats .row{display:flex;justify-content:space-between;}
  .stats .row b{font-weight:700;}
  .stats .row.status.go{color:var(--ok);}
  .stats .row.status.nogo{color:var(--c4);}

  .desc{
    font-size:12px;color:color-mix(in srgb,var(--g-muted) 65%,transparent);text-align:left;white-space:normal;
    display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden;
  }

  .empty-state{text-align:center;padding:26px 12px;color:color-mix(in srgb,var(--g-muted) 52%,transparent);font-size:0.85rem;}
`;

class GlossyLaunchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._h = null;
    this._fp = null;
    this._ok = false;
  }

  setConfig(config) {
    config = config || {};
    this._config = {
      theme: config.theme || 'v2',
      entity: config.entity || '',
      mission_entity: config.mission_entity || '',
      date_entity: config.date_entity || '',
      probability_entity: config.probability_entity || '',
      status_entity: config.status_entity || '',
      imminent_minutes: config.imminent_minutes != null ? config.imminent_minutes : 15,
    };
    // nouvelle config : tout réafficher au prochain passage de hass
    this._fp = null;
    if (this._ok) { this._buildDom(); if (this._h) this.hass = this._h; }
  }

  getCardSize() { return 4; }
  static getConfigElement() { return document.createElement('glossy-launch-card-editor'); }
  static getStubConfig() {
    return { entity: '', mission_entity: '', date_entity: '', probability_entity: '', status_entity: '' };
  }

  set hass(h) {
    this._h = h;
    if (!this._config) return; // hass peut arriver avant setConfig()
    _issTheme(this, this._config.theme, h);
    if (!this._ok) this._init();
    const ents = [this._config.entity, this._config.mission_entity, this._config.date_entity,
      this._config.probability_entity, this._config.status_entity].filter(Boolean);
    const fp = ents.map(e => {
      const st = h.states[e];
      return st ? st.state + '|' + JSON.stringify(st.attributes) : 'x';
    }).join('||');
    if (fp === this._fp) return;
    this._fp = fp;
    this._update();
  }

  _init() {
    this._ok = true;
    const sh = this.shadowRoot;
    sh.innerHTML = '';
    const lnk = document.createElement('link');
    lnk.rel = 'stylesheet';
    lnk.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=Rajdhani:wght@400;600&display=swap';
    sh.appendChild(lnk);
    const st = document.createElement('style');
    st.textContent = _LC_CSS;
    sh.appendChild(st);
    const w = document.createElement('div'); w.className = 'w';
    sh.appendChild(w);
    this._w = w;
    this._buildDom();
  }

  // (Re)construit le squelette à partir de this._config. Appelé au premier
  // rendu et à chaque changement de config.
  _buildDom() {
    if (!this._w || !this._config) return;
    if (!this._config.entity) {
      this._w.innerHTML = '<div class="empty-state">Aucune entité configurée</div>';
      return;
    }
    this._w.innerHTML = `
      <div class="provider" id="lc-provider">—</div>
      <div class="mission" id="lc-mission">—</div>
      <div class="launch-time" id="lc-time"><ha-icon icon="mdi:clock-outline"></ha-icon><span id="lc-time-text">—</span></div>
      <div class="info" id="lc-info"></div>
      <div class="stats" id="lc-stats"></div>
      <div class="desc" id="lc-desc"></div>
    `;
  }

  _q(id) { return this._w.querySelector('#' + id); }
  _esc(s) { return (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  _update() {
    if (!this._h || !this._w || !this._config.entity) return;
    const s = this._h.states;
    const cfg = this._config;

    const main = s[cfg.entity];
    const mission = cfg.mission_entity ? s[cfg.mission_entity] : null;
    const dateSt = cfg.date_entity ? s[cfg.date_entity] : null;
    const proba = cfg.probability_entity ? s[cfg.probability_entity] : null;
    const status = cfg.status_entity ? s[cfg.status_entity] : null;

    const provEl = this._q('lc-provider');
    if (provEl) provEl.textContent = main?.attributes?.provider || '—';
    const missEl = this._q('lc-mission');
    if (missEl) missEl.textContent = mission ? mission.state : (main ? main.state : '—');

    // ── Heure de lancement + statut imminent ──
    let isImminent = false;
    const timeText = this._q('lc-time-text');
    const timeWrap = this._q('lc-time');
    if (dateSt && dateSt.state) {
      const d = new Date(dateSt.state);
      if (!isNaN(d.getTime())) {
        const opts = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
        if (timeText) timeText.textContent = d.toLocaleString('fr-FR', opts);
        const diffMin = (d.getTime() - Date.now()) / 60000;
        isImminent = diffMin > 0 && diffMin < cfg.imminent_minutes;
      } else if (timeText) {
        timeText.textContent = '—';
      }
    } else if (timeText) {
      timeText.textContent = '—';
    }
    if (timeWrap) timeWrap.classList.toggle('blink', isImminent);
    this._w.classList.toggle('imminent', isImminent);

    // ── Pas de tir + installation ──
    const infoEl = this._q('lc-info');
    if (infoEl) {
      const pad = main?.attributes?.pad;
      const facility = main?.attributes?.facility;
      infoEl.innerHTML = pad
        ? `<ha-icon icon="mdi:map-marker"></ha-icon> <b>${this._esc(pad)}</b>${facility ? `<span class="facility">${this._esc(facility)}</span>` : ''}`
        : '';
    }

    // ── Stats ──
    const statsEl = this._q('lc-stats');
    if (statsEl) {
      const missionAttrs = mission?.attributes || {};
      const orbit = missionAttrs.target_orbit || '—';
      const rocket = missionAttrs.rocket_name || '—';
      const statusText = status ? status.state : '';
      const probaVal = proba ? proba.state : null;
      const probaDisplay = (!probaVal || probaVal === 'unknown' || probaVal === 'unavailable')
        ? 'Pas de donnée' : probaVal + '%';
      const isGo = /go/i.test(statusText);
      let rows = '';
      if (cfg.probability_entity) rows += `<div class="row"><span><b>Météo</b></span><span>${this._esc(probaDisplay)}</span></div>`;
      rows += `<div class="row"><span><b>Lanceur</b></span><span>${this._esc(rocket)}</span></div>`;
      rows += `<div class="row"><span><b>Orbite</b></span><span>${this._esc(orbit)}</span></div>`;
      if (cfg.status_entity) rows += `<div class="row status ${isGo ? 'go' : 'nogo'}"><span><b>Statut</b></span><span><b>${this._esc(statusText)}</b></span></div>`;
      statsEl.innerHTML = rows;
    }

    // ── Description ──
    const descEl = this._q('lc-desc');
    if (descEl) descEl.textContent = mission?.attributes?.description || '';
  }
}

define('glossy-launch-card', GlossyLaunchCard);

// ── Éditeur visuel de carte ──────────────────────────────────────────────
class GlossyLaunchCardEditor extends HTMLElement {
  setConfig(config) {
    const c = config || {};
    this._config = {
      ...c,
      entity: c.entity || '',
      mission_entity: c.mission_entity || '',
      date_entity: c.date_entity || '',
      probability_entity: c.probability_entity || '',
      status_entity: c.status_entity || '',
      imminent_minutes: c.imminent_minutes != null ? c.imminent_minutes : 15,
    };
    const echo = this._lastEmitted && JSON.stringify(this._lastEmitted) === JSON.stringify(this._config);
    if (!this._built || !echo) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._built) this._syncPickers();
    else this._render();
  }

  connectedCallback() { if (this._config) this._render(); }

  _emit() {
    this._lastEmitted = JSON.parse(JSON.stringify(this._config));
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config } }));
  }

  _esc(s) { return (s || '').toString().replace(/"/g, '&quot;'); }

  _render() {
    if (!this._config) return;
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const sh = this.shadowRoot;
    const cfg = this._config;

    if (!this._hass) {
      // setConfig() arrive avant hass dans le cycle de vie HA : construire
      // les ha-entity-picker avec un hass encore vide les fait planter.
      sh.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--secondary-text-color,#888);">Chargement…</div>';
      this._built = false;
      return;
    }

    sh.innerHTML = `
      <style>
        .wrap{padding:4px 0;}
        .field{margin-bottom:12px;}
        label{display:block;font-size:12px;color:var(--secondary-text-color,#999);margin-bottom:3px;}
        input{
          width:100%;box-sizing:border-box;padding:7px 8px;border-radius:6px;
          border:1px solid var(--divider-color,#555);background:var(--card-background-color,#1c1c1c);
          color:var(--primary-text-color,#eee);font-size:13px;
        }
        .hint{font-size:11px;color:var(--secondary-text-color,#888);margin:-6px 0 12px;}
      </style>
      <div class="wrap">
        ${_issThemeField(cfg.theme)}
        <div class="field"><label>Entité principale (provider / pad / facility)</label><ha-entity-picker id="entity"></ha-entity-picker></div>
        <div class="field"><label>Entité mission (nom, orbite, lanceur, description)</label><ha-entity-picker id="mission_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité date de lancement</label><ha-entity-picker id="date_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité probabilité météo (optionnel)</label><ha-entity-picker id="probability_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité statut (optionnel)</label><ha-entity-picker id="status_entity"></ha-entity-picker></div>
        <div class="field"><label>Seuil "imminent" (minutes)</label><input id="imminent_minutes" type="number" value="${cfg.imminent_minutes}"></div>
        <div class="hint">Sous ce seuil avant le décollage, la carte passe en glow rouge clignotant.</div>
      </div>
    `;

    ['entity', 'mission_entity', 'date_entity', 'probability_entity', 'status_entity'].forEach(key => {
      const picker = sh.getElementById(key);
      requestAnimationFrame(() => {
        if (!picker.isConnected) return;
        picker.hass = this._hass;
        picker.includeDomains = ['sensor'];
        picker.value = cfg[key] || '';
      });
      picker.addEventListener('value-changed', ev => {
        ev.stopPropagation();
        this._config = { ...this._config, [key]: ev.detail.value };
        this._emit();
      });
    });

    sh.getElementById('imminent_minutes').addEventListener('input', e => {
      this._config = { ...this._config, imminent_minutes: parseFloat(e.target.value) || 15 };
      this._emit();
    });

    _issBindTheme(this);
    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-launch-card-editor', GlossyLaunchCardEditor);

// ── Tableau de bord complet (les quatre cartes en une) ──────────────────
const _GS_CSS = _ISS_THEME_CSS + `
:host{display:block;font-family:var(--g-font);color:var(--g-text);font-size:16px;--orange:var(--g-acc);--amber:var(--g-acc2);--muted:color-mix(in srgb,var(--g-muted) 62%,transparent);--ok:#22dd88;--err:#ff4466;--panel:var(--g-panel)}
*{box-sizing:border-box}.shell{container-type:inline-size;position:relative;overflow:hidden;padding:10px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:18px;background:var(--g-grad);box-shadow:inset 0 1px rgba(255,255,255,.06),0 10px 32px rgba(0,0,0,.55)}
.shell:before{content:'';position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,var(--g-acc),transparent);opacity:.8}.top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;margin-bottom:10px;border:1px solid color-mix(in srgb,var(--g-edge) 22%,transparent);border-top:2px solid color-mix(in srgb,var(--g-acc) 65%,transparent);border-radius:12px;background:var(--g-grad)}.brand{display:flex;align-items:center;gap:10px;color:var(--amber)}.brand ha-icon{--mdc-icon-size:21px}.brand strong{font:700 13px var(--g-font-t);letter-spacing:1px}.top-status{color:var(--ok);font:12px var(--g-font-m)}.top-status.bad{color:var(--err)}.grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:10px}.left,.right{display:flex;flex-direction:column;gap:10px}.panel{position:relative;overflow:hidden;padding:15px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:14px;background:var(--g-panel);box-shadow:inset 0 1px rgba(255,255,255,.04)}.section-title{display:flex;align-items:center;gap:8px;margin-bottom:11px;padding-bottom:6px;border-bottom:1px solid color-mix(in srgb,var(--g-edge) 24%,transparent);color:color-mix(in srgb,var(--g-acc) 90%,transparent);font:600 11px var(--g-font-t);letter-spacing:1.6px;text-transform:uppercase}.section-title:after{content:'';flex:1;height:1px;background:color-mix(in srgb,var(--g-edge) 18%,transparent)}.tracker-bar{display:flex;align-items:center;gap:9px;margin-bottom:8px;color:var(--amber);font:700 12px var(--g-font-t);letter-spacing:1px}.tracker-bar .coords{margin-left:auto;color:var(--ok);font:12px var(--g-font-m);letter-spacing:0}.map{position:relative;width:100%;height:260px;overflow:hidden;border-radius:11px;background:var(--g-deep)}.map-empty{height:100%;display:grid;place-items:center;text-align:center;padding:20px;color:var(--muted);font-size:13px}.tiles{position:absolute;inset:0}.tiles img{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none}.dot{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--dc,#22dd88);box-shadow:0 0 0 4px color-mix(in srgb,var(--dc,#22dd88) 25%,transparent),0 0 14px var(--dc,#22dd88)}.attr{position:absolute;right:6px;bottom:4px;font-size:9px;color:color-mix(in srgb,var(--g-muted) 60%,transparent);background:color-mix(in srgb,var(--g-deep) 60%,transparent);padding:1px 5px;border-radius:4px}.attr a{color:inherit;text-decoration:none}@keyframes gs-blink{0%,100%{opacity:1}50%{opacity:.35}}.panel.imminent{background:rgba(255,68,102,.08);border:2px solid rgba(255,68,102,.9);box-shadow:inset 0 0 4px rgba(255,68,102,.8),inset 0 0 10px rgba(255,68,102,.35)}.panel.imminent .launch-date{color:var(--err);animation:gs-blink 1s infinite}.statline{display:flex;justify-content:space-between;gap:10px;margin-top:9px;color:var(--muted);font-size:12px}.statline b{color:var(--g-text)}.good{color:var(--ok)!important}.bad{color:var(--err)!important}.warn{color:var(--amber)!important}.pass p{margin:4px 0;color:var(--muted);font-size:13px;line-height:1.45}.pass strong{color:var(--amber)}.pass+.pass{margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--g-edge) 15%,transparent)}.graph-now{color:var(--g-text);font:800 20px var(--g-font-t)}.graph-unit{margin-left:5px;color:var(--muted);font-size:11px}.graph{width:100%;height:55px;margin-top:6px}.launch-provider{color:var(--amber);font:700 11px var(--g-font-t);letter-spacing:1px;text-transform:uppercase}.launch-mission{margin-top:3px;color:var(--g-text);font-size:18px;font-weight:700}.launch-date{margin-top:8px;color:var(--amber);font:700 13px var(--g-font-t)}.launch-info{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.launch-stats{display:flex;flex-direction:column;gap:5px;margin:10px 0;padding:9px 0;border-top:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);border-bottom:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);font-size:13px}.launch-stats div{display:flex;justify-content:space-between;gap:8px}.launch-desc{color:var(--muted);font-size:11px;line-height:1.35}.transit-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.transit{padding:12px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:11px;background:rgba(255,255,255,.025)}.transit h4{display:flex;align-items:center;gap:7px;margin:0 0 9px;color:var(--amber);font:700 11px var(--g-font-t);letter-spacing:.7px}.transit.lunar h4{color:#8ab4ff}.transit-date{font:700 13px var(--g-font-t);line-height:1.35}.transit-count{display:inline-block;margin-top:7px;padding:3px 8px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:20px;color:var(--amber);font-size:11px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:10px}.metric{padding:7px 4px;text-align:center;border:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);border-radius:8px;background:rgba(255,255,255,.03)}.metric small{display:block;color:var(--muted);font-size:9px;text-transform:uppercase}.metric b{font:700 12px var(--g-font-t)}.empty{padding:12px;color:var(--muted);font-size:12px;text-align:center}.footer{position:relative;z-index:1;display:flex;justify-content:space-between;gap:10px;margin-top:9px;padding:2px 4px;color:color-mix(in srgb,var(--g-muted) 42%,transparent);font:10px var(--g-font-m);letter-spacing:.5px}/* selon la largeur de la carte, pas de l'écran : une carte dans une colonne étroite se met sur une colonne */@container (max-width:760px){.grid{grid-template-columns:1fr}.map{height:230px}}@container (max-width:420px){.top{align-items:flex-start;flex-direction:column}.tracker-bar{flex-wrap:wrap}.tracker-bar .coords{margin-left:0;flex-basis:100%}.transit-grid{grid-template-columns:1fr}.footer{flex-direction:column}}
`;

function _gsEsc(v){return (v??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function _gsDate(v){const d=new Date(v);return isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})}
function _gsCountdown(v){const d=new Date(v);if(isNaN(d.getTime()))return '';let s=Math.round((d-Date.now())/1000);if(s<0)return 'passé';const day=Math.floor(s/86400);s-=day*86400;const hour=Math.floor(s/3600);s-=hour*3600;const min=Math.floor(s/60);return day?`dans ${day}j ${hour}h`:hour?`dans ${hour}h ${min}m`:`dans ${min}m`}
const _gsDuration=_issDuration;

class GlossySpaceDashboardCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._ok=false;this._h=null;this._resize=null;this._history=null;this._historyAt=0}
 setConfig(c){c=c||{};this._config={theme:c.theme||'v2',title:c.title||'SPACE OPERATIONS',tracker:{...(c.tracker||{}),lat_entity:'',lon_entity:''},passes:{...(c.passes||{})},launch:{...(c.launch||{})},transits:{...(c.transits||{})}};this._fp=null;this._history=null;if(this._ok){this._build();if(this._h)this.hass=this._h}}
 getCardSize(){return 8}
 static getConfigElement(){return document.createElement('glossy-space-dashboard-card-editor')}
 static getStubConfig(){return {title:'SPACE OPERATIONS',tracker:{entity:''},passes:{},launch:{entity:''},transits:{}}}
 set hass(h){this._h=h;if(!this._config)return;_issTheme(this,this._config.theme,h);const t=this._config.tracker||{};let cleaned=false;for(const key of ['lat_entity','lon_entity']){if(t[key]&&!h.states[t[key]]){t[key]='';cleaned=true}}if(cleaned)this._config={...this._config,tracker:{...t}};if(!this._ok)this._init();const ids=this._ids();const fp=ids.map(id=>{const s=h.states[id];return id+'|'+(s?.state||'x')+'|'+JSON.stringify(s?.attributes||{})}).join('||');if(fp===this._fp)return;this._fp=fp;this._update()}
 _ids(){const c=this._config||{};return [c.tracker.entity,c.tracker.status_entity,c.passes.visible_readable_entity,c.passes.visible_attrs_entity,c.passes.global_readable_entity,c.passes.global_attrs_entity,c.passes.distance_entity,c.launch.entity,c.launch.mission_entity,c.launch.date_entity,c.launch.probability_entity,c.launch.status_entity,c.transits.solar_entity,c.transits.lunar_entity].filter(Boolean)}
 _init(){this._ok=true;const sh=this.shadowRoot;sh.innerHTML=`<style>${_GS_CSS}</style><div class="shell"><div class="top"><div class="brand"><ha-icon icon="mdi:satellite-variant"></ha-icon><strong id="title"></strong></div><span class="top-status" id="top-status">SYSTEM READY</span></div><div class="grid"><div class="left"><div class="panel" id="tracker-panel"></div><div class="panel" id="passes-panel"></div></div><div class="right"><div class="panel" id="launch-panel"></div><div class="panel" id="transits-panel"></div></div></div><div class="footer"><span>LIVE SPACE TELEMETRY</span><span>GLOSSY HC3 / HOME ASSISTANT</span></div></div>`;this._w=sh.querySelector('.shell');this._build();if(!this._tick)this._tick=setInterval(()=>this._h&&this._updateLaunch(),30000)}
 _build(){if(!this._w)return;this._w.querySelector('#title').textContent=this._config.title;this._buildTracker();this._buildPasses();this._buildLaunch();this._buildTransits()}
 _buildTracker(){const c=this._config.tracker||{};const el=this._w.querySelector('#tracker-panel');if(!c.entity){el.innerHTML='<div class="section-title">ISS TRACKER</div><div class="empty">Aucune entité tracker configurée</div>';return}el.innerHTML='<div class="tracker-bar"><ha-icon icon="mdi:satellite-variant"></ha-icon><span>ISS TRACKER</span><span class="coords" id="tracker-coords">—</span></div><div class="map" id="map"><div class="map-empty">Position en attente…</div></div><div class="statline"><span>STATUS</span><b id="tracker-status">—</b><span>ZOOM <b id="tracker-zoom">—</b></span></div>';this._pos=null}
 _buildPasses(){const c=this._config.passes||{};const el=this._w.querySelector('#passes-panel');let html='<div class="section-title">PASSAGES ISS</div>';if(c.visible_readable_entity)html+='<div class="pass" id="pass-visible"></div>';if(c.global_readable_entity)html+='<div class="pass" id="pass-global"></div>';if(c.distance_entity)html+='<div class="pass" id="distance-box"><div><span class="graph-now" id="distance-now">—</span><span class="graph-unit">km</span></div><svg class="graph" id="distance-graph" viewBox="0 0 300 55" preserveAspectRatio="none"></svg></div>';if(!c.visible_readable_entity&&!c.global_readable_entity&&!c.distance_entity)html+='<div class="empty">Aucune donnée de passage configurée</div>';el.innerHTML=html}
 _buildLaunch(){const c=this._config.launch||{};const el=this._w.querySelector('#launch-panel');if(!c.entity){el.innerHTML='<div class="section-title">ROCKET LAUNCH</div><div class="empty">Aucune entité de lancement configurée</div>';return}el.innerHTML='<div class="section-title">ROCKET LAUNCH</div><div class="launch-provider" id="launch-provider">—</div><div class="launch-mission" id="launch-mission">—</div><div class="launch-date" id="launch-date">—</div><div class="launch-info" id="launch-info"></div><div class="launch-stats" id="launch-stats"></div><div class="launch-desc" id="launch-desc"></div>'}
 _buildTransits(){const c=this._config.transits||{};const el=this._w.querySelector('#transits-panel');let html='<div class="section-title">TRANSITS ISS</div><div class="transit-grid">';for(const type of ['solar','lunar']){const id=c[type+'_entity'];if(!id)continue;html+=`<div class="transit ${type}" id="transit-${type}"><h4>${type==='solar'?'☀️':'🌙'} ${type==='solar'?'TRANSIT SOLAIRE':'TRANSIT LUNAIRE'}</h4><div id="transit-body-${type}"></div></div>`}html+='</div>';if(!c.solar_entity&&!c.lunar_entity)html+='<div class="empty">Aucune entité de transit configurée</div>';el.innerHTML=html}
 _update(){if(!this._h)return;this._updateTracker();this._updatePasses();this._updateLaunch();this._updateTransits()}
 _updateTracker(){const c=this._config.tracker||{},s=this._h.states,main=s[c.entity],status=s[c.status_entity||c.entity],bad=!status||['unknown','unavailable'].includes(status.state);const lat0=main?.attributes?.latitude,lon0=main?.attributes?.longitude;const lat=Number(lat0),lon=Number(lon0),has=Number.isFinite(lat)&&Number.isFinite(lon)&&!(lat===0&&lon===0);const statusEl=this._w.querySelector('#tracker-status'),coordEl=this._w.querySelector('#tracker-coords');if(statusEl){statusEl.textContent=bad?'SIGNAL LOST':'SIGNAL LOCKED';statusEl.className=bad?'bad':'good'}if(coordEl)coordEl.textContent=has?`Lat: ${lat.toFixed(2)} | Lon: ${lon.toFixed(2)}`:'—';const zEl=this._w.querySelector('#tracker-zoom');if(zEl)zEl.textContent=String(_issZoom(c.zoom_span));const map=this._w.querySelector('#map');if(!map||!has)return;const tile=_issTileUrl(c);if(!tile){this._pos=null;map.innerHTML='<div class="map-empty">Carte désactivée : configure une clé Stadia Maps ou CARTO.</div>';return}this._pos={lat,lon,color:bad?'#ff4466':'#22dd88',tile};if(!map.querySelector('.tiles')){map.innerHTML=`<div class="tiles"></div><div class="dot"></div><div class="attr">${_issAttribution(c)}</div>`;if(this._resize)this._resize.disconnect();this._resize=new ResizeObserver(()=>this._drawTiles());this._resize.observe(map)}this._drawTiles()}
 _drawTiles(){const map=this._w&&this._w.querySelector('#map'),layer=map&&map.querySelector('.tiles');if(!layer||!this._pos)return;const W=map.offsetWidth,H=map.offsetHeight;if(!W||!H)return;const p=this._pos;layer.innerHTML=_issTilesHtml(p.lat,p.lon,_issZoom(this._config.tracker.zoom_span),W,H,p.tile);map.querySelector('.dot')?.style.setProperty('--dc',p.color)}
 _updatePasses(){const c=this._config.passes||{},s=this._h.states;const render=(id,readId,attrId)=>{const el=this._w.querySelector('#'+id);if(!el)return;const read=s[readId],a=s[attrId]?.attributes||{};let h=`<p><strong>Début :</strong> ${_gsEsc(read?.state||'—')}</p>`;if(a.duration!=null)h+=`<p><strong>Durée :</strong> ${(parseFloat(a.duration)/60).toFixed(1)} min</p>`;if(a.maxEl!=null)h+=`<p><strong>Élévation max :</strong> ${_gsEsc(a.maxEl)}°</p>`;const path=[a.startAzCompass,a.maxAzCompass,a.endAzCompass].filter(Boolean).join(' → ');if(path)h+=`<p><strong>Trajet :</strong> ${_gsEsc(path)}</p>`;el.innerHTML=h};render('pass-visible',c.visible_readable_entity,c.visible_attrs_entity);render('pass-global',c.global_readable_entity,c.global_attrs_entity);const st=s[c.distance_entity],now=this._w.querySelector('#distance-now');if(now&&st){const n=parseFloat(st.state);now.textContent=Number.isFinite(n)?Math.round(n).toLocaleString('fr-FR'):'—'}if(c.distance_entity)this._loadHistory()}
 async _loadHistory(){const c=this._config.passes||{};if(!this._h?.connection||!c.distance_entity)return;if(Date.now()-this._historyAt<300000&&this._history)return;this._historyAt=Date.now();try{const start=new Date(Date.now()-(c.distance_hours||12)*3600000).toISOString();const r=await this._h.connection.sendMessagePromise({type:'history/history_during_period',start_time:start,entity_ids:[c.distance_entity],minimal_response:true,no_attributes:true});this._history=(r?.[c.distance_entity]||[]).map(x=>parseFloat(x.s??x.state)).filter(Number.isFinite);this._drawHistory()}catch(e){console.warn('[glossy-space-dashboard-card] history unavailable',e)}}
 _drawHistory(){const svg=this._w.querySelector('#distance-graph'),v=this._history;if(!svg||!v||v.length<2)return;const min=Math.min(...v),range=Math.max(...v)-min||1,W=300,H=55,p=v.map((n,i)=>`${(i/(v.length-1)*W).toFixed(1)},${(H-5-((n-min)/range)*(H-10)).toFixed(1)}`).join(' ');svg.innerHTML=`<polygon points="0,${H} ${p} ${W},${H}" style="fill:color-mix(in srgb,var(--g-acc) 15%,transparent)"/><polyline points="${p}" fill="none" stroke-width="2" style="stroke:var(--g-acc)"/>`}
 _updateLaunch(){const c=this._config.launch||{},s=this._h.states,main=s[c.entity],mission=s[c.mission_entity],date=s[c.date_entity],proba=s[c.probability_entity],status=s[c.status_entity];const q=id=>this._w.querySelector('#'+id);if(q('launch-provider'))q('launch-provider').textContent=main?.attributes?.provider||'—';if(q('launch-mission'))q('launch-mission').textContent=mission?.state||main?.state||'—';if(q('launch-date'))q('launch-date').textContent=date?.state?_gsDate(date.state):'—';{const m=(new Date(date?.state).getTime()-Date.now())/60000;this._w.querySelector('#launch-panel')?.classList.toggle('imminent',Number.isFinite(m)&&m>0&&m<(c.imminent_minutes??15))}if(q('launch-info')){const a=main?.attributes||{};q('launch-info').innerHTML=a.pad?`📍 <b>${_gsEsc(a.pad)}</b>${a.facility?`<br><small>${_gsEsc(a.facility)}</small>`:''}`:''}if(q('launch-stats')){const a=mission?.attributes||{};q('launch-stats').innerHTML=`<div><b>Météo</b><span>${proba?.state&&!['unknown','unavailable'].includes(proba.state)?_gsEsc(proba.state)+'%':'Pas de donnée'}</span></div><div><b>Lanceur</b><span>${_gsEsc(a.rocket_name||'—')}</span></div><div><b>Orbite</b><span>${_gsEsc(a.target_orbit||'—')}</span></div>${c.status_entity?`<div class="${/go/i.test(status?.state||'')?'good':'warn'}"><b>Statut</b><b>${_gsEsc(status?.state||'—')}</b></div>`:''}`}if(q('launch-desc'))q('launch-desc').textContent=mission?.attributes?.description||''}
 _updateTransits(){const c=this._config.transits||{},s=this._h.states;for(const type of ['solar','lunar']){const body=this._w.querySelector('#transit-body-'+type),st=s[c[type+'_entity']];if(!body||!st)continue;const a=st.attributes||{},date=a.date;if(!date){body.innerHTML=`<div class="empty">Aucun transit prévu dans l'année.${a.closest_approach_deg!=null?`<br>Approche : <b>${Number(a.closest_approach_deg).toFixed(1)}°</b>`:''}</div>`;continue}body.innerHTML=`<div class="transit-date">${_gsEsc(_gsDate(date))}</div><span class="transit-count">${_gsEsc(_gsCountdown(date))}</span><div class="metrics"><div class="metric"><small>Durée</small><b>${_gsDuration(a.duration_seconds)}</b></div><div class="metric"><small>Élévation</small><b>${a.max_elevation_deg!=null?Number(a.max_elevation_deg).toFixed(1)+'°':'—'}</b></div>${type==='lunar'?`<div class="metric" style="grid-column:1/-1"><small>Distance ISS</small><b>${a.iss_distance_km!=null?Math.round(a.iss_distance_km).toLocaleString('fr-FR')+' km':'—'}</b></div>`:''}</div>`}}
 connectedCallback(){if(this._ok&&!this._tick)this._tick=setInterval(()=>this._h&&this._updateLaunch(),30000)}
 disconnectedCallback(){if(this._resize){this._resize.disconnect();this._resize=null}clearInterval(this._tick);this._tick=null}
}
define('glossy-space-dashboard-card', GlossySpaceDashboardCard);

class GlossySpaceDashboardCardEditor extends HTMLElement{
 setConfig(config){const c=config||{};this._config={type:'custom:glossy-space-dashboard-card',theme:c.theme||'v2',title:c.title||'SPACE OPERATIONS',tracker:{...(c.tracker||{}),lat_entity:'',lon_entity:''},passes:{...(c.passes||{})},launch:{...(c.launch||{})},transits:{...(c.transits||{})}};if(this._hass&&!this._built)this._render()}
 set hass(hass){this._hass=hass;if(!this._built)this._render();else this._syncPickers()}
 connectedCallback(){if(this._config)this._render()}
 _emit(){this._config={...this._config,type:'custom:glossy-space-dashboard-card'};this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true}))}
 _esc(v){return (v??'').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
 _render(){if(!this._config||!this._hass)return;if(!this.shadowRoot)this.attachShadow({mode:'open'});const c=this._config,t=c.tracker||{},p=c.passes||{},l=c.launch||{},x=c.transits||{};this.shadowRoot.innerHTML=`<style>
  .wrap{padding:4px 0;font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}.group{margin:16px 0 20px;padding:12px;border:1px solid var(--divider-color,#555);border-radius:10px}.group h3{margin:0 0 12px;font-size:13px;color:var(--primary-text-color,#eee)}.field{margin:0 0 11px}.field:last-child{margin-bottom:0}label{display:block;margin:0 0 4px;font-size:12px;color:var(--secondary-text-color,#999)}input{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--divider-color,#555);border-radius:6px;background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#eee)}.hint{font-size:11px;line-height:1.4;color:var(--secondary-text-color,#888);margin-top:-4px;margin-bottom:12px}
 </style><div class="wrap">${_issThemeField(c.theme)}<div class="field"><label>Titre du dashboard</label><input id="title" value="${this._esc(c.title)}"></div>
 <div class="group"><h3>ISS Tracker</h3><div class="field"><label>Entité position (latitude / longitude)</label><ha-entity-picker id="tracker.entity"></ha-entity-picker></div><div class="field"><label>Entité statut</label><ha-entity-picker id="tracker.status_entity"></ha-entity-picker></div><div class="field"><label>Largeur de vue carte (degrés)</label><input id="tracker.zoom_span" type="number" value="${this._esc(t.zoom_span??40)}"></div><div class="field"><label>Clé Stadia Maps (optionnelle)</label><input id="tracker.stadia_api_key" type="text" value="${this._esc(t.stadia_api_key||'')}"></div><div class="field"><label>Clé CARTO (optionnelle)</label><input id="tracker.carto_api_key" type="text" value="${this._esc(t.carto_api_key||'')}"></div><div class="hint">Une clé cartographique est nécessaire pour afficher les tuiles. Les contrôles +/− et l’attribution restent masqués dans la card.</div></div>
 <div class="group"><h3>Passages ISS</h3><div class="field"><label>Passage visible — texte</label><ha-entity-picker id="passes.visible_readable_entity"></ha-entity-picker></div><div class="field"><label>Passage visible — attributs</label><ha-entity-picker id="passes.visible_attrs_entity"></ha-entity-picker></div><div class="field"><label>Passage global — texte</label><ha-entity-picker id="passes.global_readable_entity"></ha-entity-picker></div><div class="field"><label>Passage global — attributs</label><ha-entity-picker id="passes.global_attrs_entity"></ha-entity-picker></div><div class="field"><label>Distance ISS</label><ha-entity-picker id="passes.distance_entity"></ha-entity-picker></div><div class="field"><label>Historique distance (heures)</label><input id="passes.distance_hours" type="number" value="${this._esc(p.distance_hours??12)}"></div></div>
 <div class="group"><h3>Prochain lancement</h3><div class="field"><label>Entité principale</label><ha-entity-picker id="launch.entity"></ha-entity-picker></div><div class="field"><label>Mission</label><ha-entity-picker id="launch.mission_entity"></ha-entity-picker></div><div class="field"><label>Date de lancement</label><ha-entity-picker id="launch.date_entity"></ha-entity-picker></div><div class="field"><label>Probabilité météo</label><ha-entity-picker id="launch.probability_entity"></ha-entity-picker></div><div class="field"><label>Statut du lancement</label><ha-entity-picker id="launch.status_entity"></ha-entity-picker></div><div class="field"><label>Seuil imminent (minutes)</label><input id="launch.imminent_minutes" type="number" value="${this._esc(l.imminent_minutes??15)}"></div></div>
 <div class="group"><h3>Transits ISS</h3><div class="field"><label>Transit solaire</label><ha-entity-picker id="transits.solar_entity"></ha-entity-picker></div><div class="field"><label>Transit lunaire</label><ha-entity-picker id="transits.lunar_entity"></ha-entity-picker></div></div></div>`;
 const paths=['tracker.entity','tracker.status_entity','passes.visible_readable_entity','passes.visible_attrs_entity','passes.global_readable_entity','passes.global_attrs_entity','passes.distance_entity','launch.entity','launch.mission_entity','launch.date_entity','launch.probability_entity','launch.status_entity','transits.solar_entity','transits.lunar_entity'];
 const get=(path)=>path.split('.').reduce((o,k)=>o?.[k],this._config)||'';const set=(path,value)=>{const [section,key]=path.split('.');this._config={...this._config,[section]:{...(this._config[section]||{}),[key]:value}};this._emit()};
 paths.forEach(path=>{const picker=this.shadowRoot.getElementById(path);if(!picker)return;picker.hass=this._hass;picker.includeDomains=['sensor'];picker.value=get(path);picker.addEventListener('value-changed',e=>{e.stopPropagation();set(path,e.detail.value)})});
 const bind=(id,path,number=false)=>{const el=this.shadowRoot.getElementById(id);if(!el)return;el.addEventListener('input',e=>{const value=number?(parseFloat(e.target.value)||0):e.target.value;if(path==='title')this._config={...this._config,title:value};else{const [section,key]=path.split('.');this._config={...this._config,[section]:{...(this._config[section]||{}),[key]:value}}}this._emit()})};bind('title','title');bind('tracker.zoom_span','tracker.zoom_span',true);bind('tracker.stadia_api_key','tracker.stadia_api_key');bind('tracker.carto_api_key','tracker.carto_api_key');bind('passes.distance_hours','passes.distance_hours',true);bind('launch.imminent_minutes','launch.imminent_minutes',true);_issBindTheme(this);this._built=true
 }
 _syncPickers(){if(!this.shadowRoot)return;this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p=>{p.hass=this._hass})}
}
define('glossy-space-dashboard-card-editor', GlossySpaceDashboardCardEditor);

window.customCards = window.customCards || [];
for (const card of [
  { type: 'glossy-iss-tracker-card', name: 'Glossy ISS Tracker Card', description: "Position de l'ISS en direct avec petite carte · HC3 Fibaro" },
  { type: 'glossy-iss-passes-card', name: 'Glossy ISS Passes Card', description: 'Prochains passages ISS (visible/global) + graphique de distance · HC3 Fibaro' },
  { type: 'glossy-iss-transit-card', name: 'Glossy ISS Transit Card', description: 'Prochains transits ISS devant le Soleil et la Lune · HC3 Fibaro' },
  { type: 'glossy-space-dashboard-card', name: 'Glossy Space Dashboard Card', description: 'Tableau de bord complet : ISS, passages, lancement et transits · HC3 Fibaro' },
  { type: 'glossy-launch-card', name: 'Glossy Launch Card', description: 'Prochain lancement (Next Launch) : mission, compte à rebours, pad, météo, statut · HC3 Fibaro' },
]) if (!window.customCards.some((c) => c.type === card.type)) window.customCards.push({ ...card, preview: true });

console.info(
  `%c CARTES ISS %c ${CARD_VERSION} `,
  'background:#e6750a;color:#1a1a1a;font-weight:bold;',
  'background:#1a1a1a;color:#e6750a;'
);
