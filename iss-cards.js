/**
 * CARTES ISS ET ESPACE — Thème HC3 Fibaro Glossy
 * https://github.com/Marlboro62/ISS
 *
 * Quatre cartes dans un seul fichier :
 *   custom:glossy-iss-tracker-card   position de l'ISS sur une mini-carte
 *   custom:glossy-iss-passes-card    prochains passages ISS + graphique de distance
 *   custom:glossy-iss-transit-card   prochains transits ISS devant le Soleil et la Lune
 *   custom:glossy-launch-card        prochain lancement (intégration Next Launch)
 */

const CARD_VERSION = "0.1.0-beta.1";

// Enregistrement sans erreur si une ancienne copie de la carte est encore
// chargée comme ressource à côté de celle de HACS.
const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };

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

const _IS_CSS = `
  :host{
    --ok:#22dd88;--err:#ff4466;
    font-family:'Rajdhani','Nunito',sans-serif;
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}
  @keyframes is-blink{0%,100%{opacity:1;}50%{opacity:.4;}}

  .w{
    background:linear-gradient(175deg,#1e1e1e 0%,#141414 55%,#0f0f0f 100%);
    border-radius:16px;border:1px solid rgba(230,117,10,0.14);
    padding:8px;
  }

  .bar{
    display:flex;align-items:center;gap:10px;
    background:linear-gradient(175deg,#1e1e1e 0%,#141414 55%,#0f0f0f 100%);
    border:1px solid rgba(230,117,10,0.22);border-top:2px solid rgba(230,117,10,0.6);
    border-radius:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
    padding:0 12px;height:40px;margin-bottom:8px;
  }
  .bar ha-icon{--mdc-icon-size:22px;flex-shrink:0;transition:color .3s ease;}
  .bar ha-icon.ok{color:var(--ok);}
  .bar ha-icon.err{color:var(--err);animation:is-blink 2s ease-in-out infinite;}
  .bar-name{
    font-family:'Orbitron',monospace;font-weight:700;font-size:13px;letter-spacing:1px;
    color:#ffc06a;flex-shrink:0;
  }
  .bar-coords{font-size:14px;transition:color .3s ease;}
  .bar-coords.ok{color:var(--ok);}
  .bar-coords.err{color:var(--err);animation:is-blink 2s ease-in-out infinite;}

  .map-wrap{position:relative;width:100%;height:230px;border-radius:12px;overflow:hidden;background:#0e0e0e;}
  .tiles{position:absolute;inset:0;}
  .tiles img{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none;}
  .dot{
    position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
    background:var(--dc);border:2px solid var(--dc);box-shadow:0 0 0 4px color-mix(in srgb,var(--dc) 25%,transparent),0 0 14px var(--dc);
  }
  .attr{
    position:absolute;right:6px;bottom:4px;font-size:9px;color:rgba(210,180,140,0.6);
    background:rgba(14,14,14,0.6);padding:1px 5px;border-radius:4px;
  }
  .attr a{color:inherit;text-decoration:none;}
  .map-empty{
    display:flex;align-items:center;justify-content:center;height:100%;
    color:rgba(210,180,140,0.52);font-size:0.85rem;text-align:center;padding:0 20px;
  }
`;

// ── Projection Web Mercator (tuiles 256 px) ──
const _issWorldPx = (lat, lon, z) => {
  const n = 256 * 2 ** z, la = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  return { x: ((lon + 180) / 360) * n, y: (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n };
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
    // Stadia Maps prioritaire s'il est configuré, sinon CARTO. Les serveurs
    // de tuiles OpenStreetMap bloquent l'usage embarqué dans une appli
    // tierce sans en-têtes d'identification appropriés (voir
    // osm.wiki/Blocked) — pas de repli automatique dessus, une clé d'un des
    // deux fournisseurs (gratuite) est requise pour afficher la carte.
    const tileUrl = this._config.stadia_api_key
      ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(this._config.stadia_api_key)}`
      : this._config.carto_api_key
      ? `https://basemaps.cartocdn.com/rastertiles/dark-matter/{z}/{x}/{y}.png?key=${encodeURIComponent(this._config.carto_api_key)}`
      : null;
    if (!tileUrl) {
      mapWrap.innerHTML = `<div class="map-empty"><span>Carte désactivée : configure une clé gratuite <a href="https://client.stadiamaps.com/" target="_blank" rel="noopener" style="color:#ffc06a;">Stadia Maps</a> ou <a href="https://carto.com/basemaps/apikey" target="_blank" rel="noopener" style="color:#ffc06a;">CARTO</a> dans l'éditeur de la carte.</span></div>`;
      return;
    }

    this._pos = { lat, lon, color: isBad ? '#ff4466' : '#22dd88', tileUrl };
    if (!mapWrap.querySelector('.tiles')) {
      const attr = this._config.stadia_api_key
        ? '<a href="https://stadiamaps.com/" target="_blank" rel="noopener">© Stadia Maps</a> <a href="https://openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>'
        : '<a href="https://carto.com/attributions" target="_blank" rel="noopener">© CARTO</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
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
    const z = Math.max(1, Math.min(10, Math.round(Math.log2(360 / (this._config.zoom_span || 40)))));
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
    layer.innerHTML = html;
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

const _IP_CSS = `
  :host{
    --c1:#e6750a;--c4:#ffc06a;
    font-family:'Rajdhani','Nunito',sans-serif;
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}

  .w{
    position:relative;overflow:hidden;
    background:linear-gradient(175deg,#1e1e1e 0%,#141414 55%,#0f0f0f 100%);
    border-radius:16px;border:1px solid rgba(230,117,10,0.22);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 8px 28px rgba(0,0,0,0.65);
    padding:18px;
  }
  .w::before{
    content:'';position:absolute;top:0;left:0;right:0;height:2px;
    background:linear-gradient(90deg,transparent,var(--c1),transparent);opacity:.8;z-index:1;
  }

  .sec{
    font-family:'Orbitron',monospace;font-size:0.82rem;font-weight:600;
    letter-spacing:2px;color:rgba(230,117,10,0.85);text-transform:uppercase;
    margin-bottom:12px;display:flex;align-items:center;gap:8px;
    border-bottom:1px solid rgba(230,117,10,0.25);padding-bottom:6px;
  }
  .sec.spaced{margin-top:18px;}

  .pass{margin-bottom:4px;}
  .pass p{color:rgba(210,180,140,0.75);font-size:0.95rem;line-height:1.7;margin:0;}
  .pass strong{color:#ffc06a;font-weight:700;}

  .graph-wrap{margin-top:6px;}
  .graph-now{font-family:'Orbitron',monospace;font-size:1.3rem;font-weight:800;color:#f2f2f2;}
  .graph-unit{font-size:0.72rem;color:rgba(210,180,140,0.55);margin-left:4px;}
  svg{width:100%;height:70px;display:block;margin-top:6px;}

  .empty-state{text-align:center;padding:20px 12px;color:rgba(210,180,140,0.52);font-size:0.85rem;}
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
      <polygon points="${fill}" fill="rgba(230,117,10,0.15)"></polygon>
      <polyline points="${line}" fill="none" stroke="#ff8c33" stroke-width="2"></polyline>
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

const _IT_CSS = `
  :host{
    --c1:#e6750a;--c4:#ffc06a;--c5:#4caf50;
    --sun:#ffc857;--moon:#8ab4ff;
    --bg:#1a1a1a;--panel:rgba(28,28,28,0.96);
    --border:rgba(230,117,10,0.22);--muted:rgba(210,180,140,0.52);
    font-family:'Rajdhani','Nunito',sans-serif;
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}
  .w{position:relative;border-radius:16px;overflow:hidden;background:var(--bg);padding:20px;}
  .cv{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;}
  .in{position:relative;z-index:1;}
  .sec{
    font-family:'Orbitron',monospace;font-size:0.82rem;font-weight:600;
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
  .p-title{font-family:'Orbitron',monospace;font-size:0.74rem;font-weight:700;letter-spacing:1px;color:var(--tc);text-transform:uppercase;}

  .p-empty{font-size:0.82rem;color:var(--muted);line-height:1.5;padding:6px 0 2px;}

  .p-date{font-family:'Orbitron',monospace;font-size:1.15rem;font-weight:800;color:#f2f2f2;line-height:1.3;}
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
  .miv{font-family:'Orbitron',monospace;font-size:0.85rem;font-weight:700;line-height:1;color:#f2f2f2;}

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
    const P = ['#e6750a', '#f09a3e', '#ffc06a'], L = 'rgba(230,117,10,0.07)';
    const ri = () => {
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
          cx.strokeStyle = L; cx.lineWidth = .4; cx.stroke();
        }
      }
      requestAnimationFrame(dr);
    };
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

const _LC_CSS = `
  :host{
    --c1:#e6750a;--c4:#ffc06a;--ok:#22dd88;--err:#ff4466;
    --bg:#1a1a1a;
    font-family:'Rajdhani','Nunito',sans-serif;
    font-size:16px;display:block;
  }
  *{box-sizing:border-box;}
  @keyframes lc-blink{0%,100%{opacity:1;}50%{opacity:.35;}}

  .w{
    position:relative;border-radius:16px;overflow:hidden;
    background:linear-gradient(175deg,#1e1e1e 0%,#141414 55%,#0f0f0f 100%);
    border:1px solid rgba(230,117,10,0.22);
    border-top:2px solid rgba(230,117,10,0.75);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 8px 28px rgba(0,0,0,0.65);
    padding:16px;transition:background .5s ease,border-color .5s ease,box-shadow .5s ease;
  }
  .w.imminent{
    background:rgba(255,68,102,0.08);
    border:2px solid rgba(255,68,102,0.9);
    box-shadow:inset 0 0 4px rgba(255,68,102,0.8),inset 0 0 10px rgba(255,68,102,0.35);
  }

  .provider{
    color:#ffc06a;font-size:11px;font-weight:700;text-transform:uppercase;
    font-family:'Orbitron',monospace;letter-spacing:1px;
  }
  .mission{font-size:18px;font-weight:700;line-height:1.2;color:#f2f2f2;margin-top:2px;}

  .launch-time{
    display:flex;align-items:center;gap:6px;margin-top:10px;
    color:#ffc06a;font-size:14px;font-weight:700;font-family:'Orbitron',monospace;
  }
  .launch-time ha-icon{--mdc-icon-size:16px;color:#ffc06a;}
  .launch-time.blink{animation:lc-blink 1s infinite;color:var(--err);}
  .launch-time.blink ha-icon{color:var(--err);}

  .info{color:rgba(210,180,140,0.75);font-size:12px;margin-top:8px;line-height:1.3;}
  .info ha-icon{--mdc-icon-size:14px;color:rgba(210,180,140,0.75);vertical-align:-2px;}
  .info .facility{font-size:10px;opacity:.8;margin-left:18px;display:block;margin-top:1px;}

  .stats{
    display:flex;flex-direction:column;gap:6px;font-size:14px;text-align:left;color:#f2f2f2;
    padding:10px 0;border-top:1px solid rgba(230,117,10,0.14);border-bottom:1px solid rgba(230,117,10,0.14);
    margin:10px 0;
  }
  .stats .row{display:flex;justify-content:space-between;}
  .stats .row b{font-weight:700;}
  .stats .row.status.go{color:var(--ok);}
  .stats .row.status.nogo{color:var(--c4);}

  .desc{
    font-size:12px;color:rgba(210,180,140,0.65);text-align:left;white-space:normal;
    display:-webkit-box;-webkit-line-clamp:8;-webkit-box-orient:vertical;overflow:hidden;
  }

  .empty-state{text-align:center;padding:26px 12px;color:rgba(210,180,140,0.52);font-size:0.85rem;}
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

    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-launch-card-editor', GlossyLaunchCardEditor);

window.customCards = window.customCards || [];
for (const card of [
  { type: 'glossy-iss-tracker-card', name: 'Glossy ISS Tracker Card', description: "Position de l'ISS en direct avec petite carte · HC3 Fibaro" },
  { type: 'glossy-iss-passes-card', name: 'Glossy ISS Passes Card', description: 'Prochains passages ISS (visible/global) + graphique de distance · HC3 Fibaro' },
  { type: 'glossy-iss-transit-card', name: 'Glossy ISS Transit Card', description: 'Prochains transits ISS devant le Soleil et la Lune · HC3 Fibaro' },
  { type: 'glossy-launch-card', name: 'Glossy Launch Card', description: 'Prochain lancement (Next Launch) : mission, compte à rebours, pad, météo, statut · HC3 Fibaro' },
]) if (!window.customCards.some((c) => c.type === card.type)) window.customCards.push({ ...card, preview: true });

console.info(
  `%c CARTES ISS %c ${CARD_VERSION} `,
  'background:#e6750a;color:#1a1a1a;font-weight:bold;',
  'background:#1a1a1a;color:#e6750a;'
);
