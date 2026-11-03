/**
 * CARTES ISS ET ESPACE — aux couleurs des cartes MyElectricalData
 * https://github.com/Marlboro62/ISS
 *
 * Cinq cartes dans un seul fichier :
 *   custom:glossy-iss-tracker-card   position de l'ISS sur une mini-carte
 *   custom:glossy-iss-passes-card    prochains passages ISS + graphique de distance
 *   custom:glossy-iss-transit-card   prochains transits ISS devant le Soleil et la Lune
 *   custom:glossy-launch-card        prochain lancement (intégration Next Launch)
 *   custom:glossy-space-dashboard-card  les quatre en un seul tableau de bord
 */

const CARD_VERSION = "1.0.0";

// Enregistrement sans erreur si une ancienne copie de la carte est encore
// chargée comme ressource à côté de celle de HACS.
const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };

// ── Couleurs : variables partagées par les cinq cartes ──
// v2 (défaut) : bleu nuit des autres cartes (MyElectricalData, Météo, Serveur HA…)
// light : version claire (thème « auto » quand Home Assistant est en clair)
// ha : couleurs du thème Home Assistant
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
`;
/** Applique le thème choisi (et le mode clair de Home Assistant pour « auto »). */
const _issTheme = (el, theme, hass) => {
  const t = theme || 'v2', light = hass?.themes?.darkMode === false;
  const mode = t === 'ha' ? 'ha' : t === 'auto' && light ? 'light' : 'v2';
  if (el.getAttribute('data-theme') === mode) return;
  el.setAttribute('data-theme', mode);
  if (el._reTheme) el._reTheme();
};
// ── Calcul d'orbite intégré : SGP4 (proche Terre, constantes WGS72) ──
// Positions, distance et passages calculés dans le navigateur à partir des
// éléments orbitaux (TLE) de l'ISS, sans capteur ni clé d'API.
const _ISS = (() => {
  const D2R = Math.PI / 180, TAU = 2 * Math.PI;
  const RE = 6378.135, XKE = 60 / Math.sqrt((RE ** 3) / 398600.8), J2 = 0.001082616, J3 = -0.00000253881, J4 = -0.00000165597, J3OJ2 = J3 / J2, X2O3 = 2 / 3;
  const mod = (a, b) => ((a % b) + b) % b;

  const jday = (ms) => ms / 86400000 + 2440587.5;
  const gmst = (jd) => {
    const t = (jd - 2451545) / 36525;
    const s = -6.2e-6 * t ** 3 + 0.093104 * t * t + (876600 * 3600 + 8640184.812866) * t + 67310.54841;
    return mod(s * D2R / 240, TAU);
  };

  /** Lecture des deux lignes TLE et initialisation SGP4. */
  const parse = (l1, l2) => {
    const n = (s) => parseFloat(s);
    const expo = (s) => { const t = s.trim(); if (!t) return 0; const m = /^([+-]?)(\d+)([+-]\d)$/.exec(t.replace(/\s/g, '')); return m ? parseFloat(`${m[1]}0.${m[2]}e${m[3]}`) : 0; };
    const yy = parseInt(l1.slice(18, 20), 10), doy = n(l1.slice(20, 32));
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    const epochMs = Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
    const r = {
      epochMs, jdepoch: jday(epochMs), bstar: expo(l1.slice(53, 61)),
      inclo: n(l2.slice(8, 16)) * D2R, nodeo: n(l2.slice(17, 25)) * D2R, ecco: n(`0.${l2.slice(26, 33).trim()}`),
      argpo: n(l2.slice(34, 42)) * D2R, mo: n(l2.slice(43, 51)) * D2R, no: n(l2.slice(52, 63)) * TAU / 1440,
    };
    if (![r.inclo, r.nodeo, r.ecco, r.argpo, r.mo, r.no].every(Number.isFinite) || r.no <= 0) throw new Error('TLE illisible');
    // initl
    const { ecco, inclo, argpo, mo, bstar } = r;
    const eccsq = ecco * ecco, omeosq = 1 - eccsq, rteosq = Math.sqrt(omeosq);
    const cosio = Math.cos(inclo), cosio2 = cosio * cosio;
    const ak = (XKE / r.no) ** X2O3;
    const d1 = 0.75 * J2 * (3 * cosio2 - 1) / (rteosq * omeosq);
    let del = d1 / (ak * ak);
    const adel = ak * (1 - del * del - del * (1 / 3 + 134 * del * del / 81));
    del = d1 / (adel * adel);
    const nu = r.no / (1 + del);
    const ao = (XKE / nu) ** X2O3, sinio = Math.sin(inclo), po = ao * omeosq;
    const con42 = 1 - 5 * cosio2, con41 = -con42 - cosio2 - cosio2, posq = po * po, rp = ao * (1 - ecco);
    // sgp4init
    let sfour = 78 / RE + 1, qzms24 = ((120 - 78) / RE) ** 4;
    const isimp = rp < 220 / RE + 1;
    const perige = (rp - 1) * RE;
    if (perige < 156) { sfour = perige < 98 ? 20 : perige - 78; qzms24 = ((120 - sfour) / RE) ** 4; sfour = sfour / RE + 1; }
    const pinvsq = 1 / posq, tsi = 1 / (ao - sfour), eta = ao * ecco * tsi, etasq = eta * eta, eeta = ecco * eta;
    const psisq = Math.abs(1 - etasq), coef = qzms24 * tsi ** 4, coef1 = coef / psisq ** 3.5;
    const cc2 = coef1 * nu * (ao * (1 + 1.5 * etasq + eeta * (4 + etasq)) + 0.375 * J2 * tsi / psisq * con41 * (8 + 3 * etasq * (8 + etasq)));
    const cc1 = bstar * cc2;
    const cc3 = ecco > 1e-4 ? -2 * coef * tsi * J3OJ2 * nu * sinio / ecco : 0;
    const x1mth2 = 1 - cosio2;
    const cc4 = 2 * nu * coef1 * ao * omeosq * (eta * (2 + 0.5 * etasq) + ecco * (0.5 + 2 * etasq)
      - J2 * tsi / (ao * psisq) * (-3 * con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) + 0.75 * x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)));
    const cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq);
    const cosio4 = cosio2 * cosio2;
    const temp1 = 1.5 * J2 * pinvsq * nu, temp2 = 0.5 * temp1 * J2 * pinvsq, temp3 = -0.46875 * J4 * pinvsq * pinvsq * nu;
    const mdot = nu + 0.5 * temp1 * rteosq * con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4);
    const argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) + temp3 * (3 - 36 * cosio2 + 49 * cosio4);
    const xhdot1 = -temp1 * cosio;
    const nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio;
    const omgcof = bstar * cc3 * Math.cos(argpo);
    const xmcof = ecco > 1e-4 ? -X2O3 * coef * bstar / eeta : 0;
    const nodecf = 3.5 * omeosq * xhdot1 * cc1, t2cof = 1.5 * cc1;
    const xlcof = -0.25 * J3OJ2 * sinio * (3 + 5 * cosio) / (Math.abs(cosio + 1) > 1.5e-12 ? 1 + cosio : 1.5e-12);
    const aycof = -0.5 * J3OJ2 * sinio, delmo = (1 + eta * Math.cos(mo)) ** 3, sinmao = Math.sin(mo), x7thm1 = 7 * cosio2 - 1;
    let d2 = 0, d3 = 0, d4 = 0, t3cof = 0, t4cof = 0, t5cof = 0;
    if (!isimp) {
      const cc1sq = cc1 * cc1; d2 = 4 * ao * tsi * cc1sq;
      const tmp = d2 * tsi * cc1 / 3; d3 = (17 * ao + sfour) * tmp; d4 = 0.5 * tmp * ao * tsi * (221 * ao + 31 * sfour) * cc1;
      t3cof = d2 + 2 * cc1sq; t4cof = 0.25 * (3 * d3 + cc1 * (12 * d2 + 10 * cc1sq));
      t5cof = 0.2 * (3 * d4 + 12 * cc1 * d3 + 6 * d2 * d2 + 15 * cc1sq * (2 * d2 + cc1sq));
    }
    return Object.assign(r, { nu, isimp, eta, cc1, cc4, cc5, mdot, argpdot, nodedot, omgcof, xmcof, nodecf, t2cof, xlcof, aycof, delmo, sinmao, x7thm1, x1mth2, con41, d2, d3, d4, t3cof, t4cof, t5cof });
  };

  /** Position TEME (km) à t minutes de l'époque du TLE. */
  const sgp4 = (s, t) => {
    const xmdf = s.mo + s.mdot * t, argpdf = s.argpo + s.argpdot * t, nodedf = s.nodeo + s.nodedot * t;
    let argpm = argpdf, mm = xmdf; const t2 = t * t; let nodem = nodedf + s.nodecf * t2;
    let tempa = 1 - s.cc1 * t, tempe = s.bstar * s.cc4 * t, templ = s.t2cof * t2;
    if (!s.isimp) {
      const delomg = s.omgcof * t, delm = s.xmcof * ((1 + s.eta * Math.cos(xmdf)) ** 3 - s.delmo), tmp = delomg + delm;
      mm = xmdf + tmp; argpm = argpdf - tmp;
      const t3 = t2 * t, t4 = t3 * t;
      tempa = tempa - s.d2 * t2 - s.d3 * t3 - s.d4 * t4;
      tempe = tempe + s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao);
      templ = templ + s.t3cof * t3 + t4 * (s.t4cof + t * s.t5cof);
    }
    const am = (XKE / s.nu) ** X2O3 * tempa * tempa, nm = XKE / am ** 1.5;
    let em = s.ecco - tempe; if (em < 1e-6) em = 1e-6;
    mm += s.nu * templ;
    const xlm = mod(mm + argpm + nodem, TAU);
    nodem = mod(nodem, TAU); argpm = mod(argpm, TAU); mm = mod(xlm - argpm - nodem, TAU);
    const sinip = Math.sin(s.inclo), cosip = Math.cos(s.inclo);
    const axnl = em * Math.cos(argpm), tmp0 = 1 / (am * (1 - em * em)), aynl = em * Math.sin(argpm) + tmp0 * s.aycof;
    const xl = mm + argpm + nodem + tmp0 * s.xlcof * axnl;
    const u = mod(xl - nodem, TAU);
    let eo1 = u, tem5 = 9999.9, sineo1 = 0, coseo1 = 1;
    for (let k = 0; Math.abs(tem5) >= 1e-12 && k < 10; k++) {
      sineo1 = Math.sin(eo1); coseo1 = Math.cos(eo1);
      tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / (1 - coseo1 * axnl - sineo1 * aynl);
      if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95;
      eo1 += tem5;
    }
    sineo1 = Math.sin(eo1); coseo1 = Math.cos(eo1);
    const ecose = axnl * coseo1 + aynl * sineo1, esine = axnl * sineo1 - aynl * coseo1, el2 = axnl * axnl + aynl * aynl, pl = am * (1 - el2);
    if (pl < 0) return null;
    const rl = am * (1 - ecose), betal = Math.sqrt(1 - el2), tmp = esine / (1 + betal);
    const sinu = am / rl * (sineo1 - aynl - axnl * tmp), cosu = am / rl * (coseo1 - axnl + aynl * tmp);
    let su = Math.atan2(sinu, cosu);
    const sin2u = 2 * cosu * sinu, cos2u = 1 - 2 * sinu * sinu, tp = 1 / pl, tp1 = 0.5 * J2 * tp, tp2 = tp1 * tp;
    const mrt = rl * (1 - 1.5 * tp2 * betal * s.con41) + 0.5 * tp1 * s.x1mth2 * cos2u;
    su -= 0.25 * tp2 * s.x7thm1 * sin2u;
    const xnode = nodem + 1.5 * tp2 * cosip * sin2u, xinc = s.inclo + 1.5 * tp2 * cosip * sinip * cos2u;
    const sinsu = Math.sin(su), cossu = Math.cos(su), snod = Math.sin(xnode), cnod = Math.cos(xnode), sini = Math.sin(xinc), cosi = Math.cos(xinc);
    const xmx = -snod * cosi, xmy = cnod * cosi;
    const k = mrt * RE;
    return [k * (xmx * sinsu + cnod * cossu), k * (xmy * sinsu + snod * cossu), k * sini * sinsu];
  };

  // WGS84 pour la Terre vue du sol
  const A = 6378.137, F = 1 / 298.257223563, E2 = F * (2 - F);
  const toEcef = (r, g) => [Math.cos(g) * r[0] + Math.sin(g) * r[1], -Math.sin(g) * r[0] + Math.cos(g) * r[1], r[2]];
  const geodetic = (e) => {
    const lon = Math.atan2(e[1], e[0]), p = Math.hypot(e[0], e[1]);
    let lat = Math.atan2(e[2], p * (1 - E2)), N = A;
    for (let i = 0; i < 5; i++) { N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2); lat = Math.atan2(e[2] + E2 * N * Math.sin(lat), p); }
    return { lat: lat / D2R, lon: mod(lon / D2R + 180, 360) - 180, alt: p / Math.cos(lat) - N };
  };
  const site = (lat, lon, altKm = 0) => {
    const la = lat * D2R, lo = lon * D2R, N = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
    return { la, lo, e: [(N + altKm) * Math.cos(la) * Math.cos(lo), (N + altKm) * Math.cos(la) * Math.sin(lo), (N * (1 - E2) + altKm) * Math.sin(la)] };
  };
  /** Azimut, hauteur (degrés) et distance (km) d'un point vu depuis le site. */
  const look = (st, e) => {
    const dx = e[0] - st.e[0], dy = e[1] - st.e[1], dz = e[2] - st.e[2];
    const sl = Math.sin(st.la), cl = Math.cos(st.la), so = Math.sin(st.lo), co = Math.cos(st.lo);
    const s = sl * co * dx + sl * so * dy - cl * dz, ea = -so * dx + co * dy, z = cl * co * dx + cl * so * dy + sl * dz;
    const range = Math.hypot(s, ea, z);
    return { az: mod(Math.atan2(ea, -s) / D2R, 360), el: Math.asin(z / range) / D2R, range };
  };
  /** Soleil (vecteur équatorial, km), précision de l'Almanach astronomique. */
  const sun = (jd) => {
    const n = jd - 2451545, L = (280.46 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R;
    const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R, eps = (23.439 - 4e-7 * n) * D2R;
    const R = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * 149597870.7;
    return [R * Math.cos(lam), R * Math.cos(eps) * Math.sin(lam), R * Math.sin(eps) * Math.sin(lam)];
  };
  /** L'ISS est-elle éclairée par le Soleil, hors de l'ombre de la Terre (cône d'ombre, umbra) ? */
  const sunlit = (r, sv) => {
    const sl = Math.hypot(...sv), u = sv.map((x) => x / sl), d = r[0] * u[0] + r[1] * u[1] + r[2] * u[2];
    if (d > 0) return true;
    const umbra = RE + d * Math.tan(Math.asin((696000 - RE) / sl)); // le cône se resserre derrière la Terre
    return Math.hypot(r[0] - d * u[0], r[1] - d * u[1], r[2] - d * u[2]) > umbra;
  };
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const compass = (az) => COMPASS[Math.round(mod(az, 360) / 22.5) % 16];
  /** Distance au sol (km) entre deux points, grand cercle. */
  const ground = (a, b, c, d) => {
    const p1 = a * D2R, p2 = c * D2R, dl = (d - b) * D2R;
    return 2 * 6371 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
  };

  /** État complet à l'instant ms : position TEME, sous-point, et si demandé la vue depuis un site. */
  const state = (sat, ms, st) => {
    const r = sgp4(sat, (ms - sat.epochMs) / 60000);
    if (!r) return null;
    const jd = jday(ms), g = gmst(jd), e = toEcef(r, g), geo = geodetic(e);
    const out = { r, ...geo };
    if (st) Object.assign(out, look(st, e));
    return out;
  };
  const sunEl = (ms, st) => { const jd = jday(ms); return look(st, toEcef(sun(jd), gmst(jd))).el; };

  /**
   * Passages au-dessus de l'horizon dans les `days` prochains jours.
   * Chaque passage : début, culmination, fin (ms), azimuts, hauteur max, et la partie
   * visible à l'œil nu (ISS éclairée, Soleil à plus de 6° sous l'horizon).
   */
  const passes = (sat, st, from, days = 10, max = 40) => {
    const elAt = (ms) => state(sat, ms, st)?.el ?? -90;
    const edge = (a, b, up) => { for (let i = 0; i < 20; i++) { const m = (a + b) / 2; ((elAt(m) > 0) === up) ? (b = m) : (a = m); } return Math.round((a + b) / 2); };
    const out = [], end = from + days * 86400000, step = 30000;
    let prev = elAt(from), t = from;
    if (prev > 0) { while (t > from - 1200000 && elAt(t) > 0) t -= step; prev = elAt(t); }
    for (; t < end && out.length < max; t += step) {
      const cur = elAt(t + step);
      if (prev <= 0 && cur > 0) {
        const rise = edge(t, t + step, true);
        let s = rise; while (elAt(s + step) > 0 && s < rise + 1800000) s += step;
        const set = edge(s, s + step, false);
        const p = { start: rise, end: set, maxEl: -90, maxT: rise, vis: null };
        let vs = null, ve = null, vmax = -90, vmaxT = 0;
        for (let m = rise; m <= set; m += 5000) {
          const x = state(sat, m, st); if (!x) continue;
          if (x.el > p.maxEl) { p.maxEl = x.el; p.maxT = m; }
          const jd = jday(m), visible = x.el > 0 && sunlit(x.r, sun(jd)) && sunEl(m, st) < -6;
          if (visible) { if (vs === null) vs = m; ve = m; if (x.el > vmax) { vmax = x.el; vmaxT = m; } }
        }
        const az = (m) => state(sat, m, st).az;
        p.startAz = az(rise); p.maxAz = az(p.maxT); p.endAz = az(set);
        if (vs !== null && ve - vs >= 30000) p.vis = { start: vs, end: ve, maxEl: vmax, maxT: vmaxT, startAz: az(vs), maxAz: az(vmaxT), endAz: az(ve) };
        if (set > from) out.push(p);
        t = set;
      }
      prev = elAt(t + step);
    }
    return out;
  };

  // ── Éléments orbitaux : CelesTrak, wheretheiss.at en secours ; partagés par toutes les cartes ──
  const KEY = 'iss-cards-tle', MAXAGE = 6 * 3600000;
  let sat = null, fetchedAt = 0, loading = null, failedAt = 0;
  const listeners = new Set();
  const store = (l1, l2) => { sat = parse(l1, l2); fetchedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify({ l1, l2, at: fetchedAt })); } catch (e) { /* stockage indisponible */ } };
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.l1 && c.l2) { sat = parse(c.l1, c.l2); fetchedAt = c.at || 0; } } catch (e) { /* cache illisible */ }
  const fromCelestrak = async () => {
    const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { cache: 'no-store' });
    if (!r.ok) throw new Error(`CelesTrak ${r.status}`);
    const lines = (await r.text()).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const l1 = lines.find((x) => x.startsWith('1 25544')), l2 = lines.find((x) => x.startsWith('2 25544'));
    if (!l1 || !l2) throw new Error('CelesTrak : TLE absent');
    return [l1, l2];
  };
  const fromWhereTheIss = async () => {
    const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles', { cache: 'no-store' });
    if (!r.ok) throw new Error(`wheretheiss.at ${r.status}`);
    const j = await r.json();
    if (!j.line1 || !j.line2) throw new Error('wheretheiss.at : TLE absent');
    return [j.line1, j.line2];
  };
  const load = () => {
    if (sat && Date.now() - fetchedAt < MAXAGE) return Promise.resolve(sat);
    if (loading) return loading;
    if (failedAt && Date.now() - failedAt < 120000) return Promise.resolve(sat); // nouvel essai dans 2 minutes
    loading = fromCelestrak().catch(fromWhereTheIss).then(([l1, l2]) => { store(l1, l2); failedAt = 0; listeners.forEach((f) => f()); return sat; })
      .catch((e) => { failedAt = Date.now(); console.warn('[iss-cards] éléments orbitaux indisponibles :', e.message || e); return sat; })
      .finally(() => { loading = null; });
    return loading;
  };

  return {
    parse, sgp4, state, passes, compass, ground, site, sunEl, sun, look, toEcef, gmst, jday,
    load, onLoad: (f) => { listeners.add(f); return () => listeners.delete(f); },
    get sat() { return sat; },
    /** Âge des éléments orbitaux (ms), null s'il n'y en a pas. */
    get age() { return sat ? Date.now() - sat.epochMs : null; },
  };
})();

// ── Données calculées pour les cartes (quand aucun capteur n'est configuré) ──
const _issLive = (() => {
  let cache = null, distCache = null;
  /** Lieu d'observation : celui de Home Assistant (il ne quitte pas le navigateur). */
  const observer = (hass) => {
    const c = hass?.config, lat = Number(c?.latitude), lon = Number(c?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
    return { lat, lon, alt: (Number(c.elevation) || 0) / 1000 };
  };
  const fresh = () => _ISS.age !== null && _ISS.age < 3 * 86400000;
  const position = () => (_ISS.sat ? _ISS.state(_ISS.sat, Date.now()) : null);
  const list = (hass, days) => {
    const o = observer(hass), sat = _ISS.sat;
    if (!o || !sat) return null;
    const key = `${sat.epochMs}|${o.lat.toFixed(3)}|${o.lon.toFixed(3)}|${days}`, now = Date.now();
    if (!cache || cache.key !== key || now - cache.at > 30 * 60000 || (cache.list[0] && cache.list[0].end < now)) {
      cache = { key, at: now, list: _ISS.passes(sat, _ISS.site(o.lat, o.lon, o.alt), now, days, 100) };
    }
    return cache.list.filter((p) => p.end > now);
  };
  /**
   * Prochain passage visible à l'œil nu et prochain passage tout court, comme N2YO : passage
   * culminant à au moins minEl degrés, et pour le visible, au moins minVis secondes à l'œil nu.
   */
  const next = (hass, minEl = 10, days = 10, minVis = 120) => {
    const l = list(hass, days);
    if (!l) return null;
    const now = Date.now();
    const vis = l.find((p) => p.vis && p.maxEl >= minEl && p.vis.end > now && p.vis.end - p.vis.start >= minVis * 1000);
    const glob = l.find((p) => p.maxEl >= minEl);
    return {
      visible: vis ? { start: vis.vis.start, end: vis.vis.end, maxEl: vis.maxEl, startAz: vis.vis.startAz, maxAz: vis.maxAz, endAz: vis.vis.endAz, duration: Math.round((vis.vis.end - vis.vis.start) / 1000) } : null,
      global: glob ? { start: glob.start, end: glob.end, maxEl: glob.maxEl, startAz: glob.startAz, maxAz: glob.maxAz, endAz: glob.endAz, duration: Math.round((glob.end - glob.start) / 1000) } : null,
    };
  };
  /** Distance au sol entre Home Assistant et le point sous l'ISS (km). */
  const distance = (hass, ms = Date.now()) => {
    const o = observer(hass), sat = _ISS.sat, x = sat && _ISS.state(sat, ms);
    return o && x ? _ISS.ground(o.lat, o.lon, x.lat, x.lon) : null;
  };
  /** Distance toutes les 5 minutes sur les `hours` dernières heures, pour le graphique. */
  const history = (hass, hours = 12) => {
    const o = observer(hass), sat = _ISS.sat;
    if (!o || !sat) return null;
    const now = Math.floor(Date.now() / 300000) * 300000, key = `${sat.epochMs}|${o.lat}|${o.lon}|${hours}|${now}`;
    if (distCache && distCache.key === key) return distCache.v;
    const v = [];
    for (let t = now - hours * 3600000; t <= now; t += 300000) { const d = distance(hass, t); if (d !== null) v.push(d); }
    distCache = { key, v };
    return v;
  };
  const date = (ms) => { const d = new Date(ms); return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; };
  /** Lignes d'un passage, au format des cartes Passages ISS. */
  const lines = (p, esc) => {
    if (!p) return '<p><strong>Début :</strong> aucun passage dans les 10 prochains jours</p>';
    return `<p><strong>Début :</strong> ${esc(date(p.start))}</p>`
      + `<p><strong>Durée :</strong> ${_issDur(p.duration)}</p>`
      + `<p><strong>Hauteur max :</strong> ${_issNum(p.maxEl, 1)}°</p>`
      + `<p><strong>Trajet :</strong> ${esc([p.startAz, p.maxAz, p.endAz].map(_ISS.compass).join(' → '))}</p>`;
  };
  /** Message à afficher à la place des données calculées, ou null si tout va bien. */
  const problem = (hass) => {
    if (!observer(hass)) return "Position de Home Assistant inconnue : renseignez-la dans Paramètres › Système › Général.";
    if (!_ISS.sat) return "Éléments orbitaux de l'ISS indisponibles (CelesTrak, wheretheiss.at). Nouvel essai dans 2 minutes.";
    return null;
  };
  return { observer, fresh, position, next, distance, history, lines, problem };
})();

// ── Lune (Meeus, Astronomical Algorithms, chap. 47, termes principaux) : vecteur équatorial (km) ──
const _issMoon = (() => {
  const D2R = Math.PI / 180;
  // [D, M, M', F, Σl (1e-6 °), Σr (m)]
  const LR = [[0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],[0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],[2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],[2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],[0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],[0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],[4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],[1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],[2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],[0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],[1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],[0,2,0,0,-2069,0]];
  // [D, M, M', F, Σb (1e-6 °)]
  const B = [[0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],[2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],[2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],[0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],[0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],[4,0,0,-1,1021],[4,0,-1,1,833]];
  /** Longitude, latitude écliptiques (degrés) et distance (km), jd en temps terrestre. */
  const ecl = (jd) => {
    const T = (jd - 2451545) / 36525;
    const Lp = 218.3164477 + 481267.88123421 * T, D = 297.8501921 + 445267.1114034 * T, M = 357.5291092 + 35999.0502909 * T;
    const Mp = 134.9633964 + 477198.8675055 * T, F = 93.272095 + 483202.0175233 * T, E = 1 - 0.002516 * T - 0.0000074 * T * T;
    const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
    let sl = 0, sr = 0, sb = 0;
    for (const [d, m, mp, f, l, r] of LR) { const a = (d * D + m * M + mp * Mp + f * F) * D2R, e = E ** Math.abs(m); sl += l * e * Math.sin(a); sr += r * e * Math.cos(a); }
    for (const [d, m, mp, f, b] of B) { const a = (d * D + m * M + mp * Mp + f * F) * D2R; sb += b * E ** Math.abs(m) * Math.sin(a); }
    sl += 3958 * Math.sin(A1 * D2R) + 1962 * Math.sin((Lp - F) * D2R) + 318 * Math.sin(A2 * D2R);
    sb += -2235 * Math.sin(Lp * D2R) + 382 * Math.sin(A3 * D2R) + 175 * Math.sin((A1 - F) * D2R) + 175 * Math.sin((A1 + F) * D2R) + 127 * Math.sin((Lp - Mp) * D2R) - 115 * Math.sin((Lp + Mp) * D2R);
    return { lon: ((Lp + sl / 1e6) % 360 + 360) % 360, lat: sb / 1e6, dist: 385000.56 + sr / 1000 };
  };
  /** Vecteur équatorial de la date (km), jd en temps universel. */
  const eci = (jdUt) => {
    const jd = jdUt + 69 / 86400; // ΔT ≈ 69 s
    const { lon, lat, dist } = ecl(jd), T = (jd - 2451545) / 36525;
    const eps = (23.4392911 - 0.0130042 * T) * D2R, l = lon * D2R, b = lat * D2R;
    const x = Math.cos(b) * Math.cos(l), y = Math.cos(b) * Math.sin(l), z = Math.sin(b);
    return [dist * x, dist * (y * Math.cos(eps) - z * Math.sin(eps)), dist * (y * Math.sin(eps) + z * Math.cos(eps))];
  };
  return { ecl, eci };
})();

// ── Transits de l'ISS devant le Soleil et la Lune, vus du lieu de Home Assistant ──
const _issTransit = (() => {
  const D2R = Math.PI / 180, R = { solar: 696000, lunar: 1737.4 };
  let cache = null;
  const dir = (l) => { const a = l.az * D2R, e = l.el * D2R; return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]; };
  const sep = (a, b) => { const u = dir(a), v = dir(b); return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])) / D2R; };
  const body = (kind, ms, st) => {
    const jd = _ISS.jday(ms), l = _ISS.look(st, _ISS.toEcef(kind === 'solar' ? _ISS.sun(jd) : _issMoon.eci(jd), _ISS.gmst(jd)));
    l.radius = Math.asin(R[kind] / l.range) / D2R;
    return l;
  };
  /** Premier transit de chaque astre dans les `days` prochains jours, et l'approche la plus proche. */
  const search = (hass, days = 14) => {
    const o = _issLive.observer(hass), sat = _ISS.sat;
    if (!o || !sat) return null;
    const now = Date.now(), key = `${sat.epochMs}|${o.lat.toFixed(3)}|${o.lon.toFixed(3)}|${days}`;
    const stale = (r) => ['solar', 'lunar'].some((k) => r[k].ms && r[k].ms < now);
    if (cache && cache.key === key && now - cache.at < 3600000 && !stale(cache.res)) return cache.res;
    const st = _ISS.site(o.lat, o.lon, o.alt), list = _ISS.passes(sat, st, now, days, 200), res = {};
    for (const kind of ['solar', 'lunar']) {
      let best = null, hit = null;
      for (const p of list) {
        if (hit) break;
        let bm = null, bs = 1e9;
        for (let m = p.start; m <= p.end; m += 2000) {
          const b = body(kind, m, st); if (b.el <= 0) continue;
          const x = _ISS.state(sat, m, st), d = sep(x, b);
          if (d < bs) { bs = d; bm = m; }
        }
        if (bm === null) continue;
        const f = (m) => sep(_ISS.state(sat, m, st), body(kind, m, st));
        let a = bm - 2000, c = bm + 2000;
        for (let i = 0; i < 40; i++) { const m1 = a + (c - a) / 3, m2 = c - (c - a) / 3; if (f(m1) < f(m2)) c = m2; else a = m1; }
        const tm = (a + c) / 2, d = f(tm), b = body(kind, tm, st), x = _ISS.state(sat, tm, st);
        if (!best || d < best.sep) best = { sep: d, ms: tm };
        if (d < b.radius) {
          const w = sep(_ISS.state(sat, tm - 500, st), _ISS.state(sat, tm + 500, st)); // vitesse angulaire, °/s
          hit = { ms: tm, duration: w > 0 ? 2 * Math.sqrt(b.radius ** 2 - d ** 2) / w : 0, el: x.el, range: x.range };
        }
      }
      res[kind] = hit
        ? { ms: hit.ms, date: new Date(hit.ms).toISOString(), duration_seconds: hit.duration, max_elevation_deg: hit.el, iss_distance_km: hit.range, closest_approach_deg: best.sep }
        : { closest_approach_deg: best ? best.sep : null };
    }
    cache = { key, at: now, res };
    return res;
  };
  /** Faux états Home Assistant lus par les cartes Transits (mêmes attributs qu'un capteur). */
  const states = (hass, days) => {
    const r = search(hass, days);
    if (!r) return null;
    return { 'iss.transit.solar': { state: r.solar.date || 'aucun', attributes: r.solar }, 'iss.transit.lunar': { state: r.lunar.date || 'aucun', attributes: r.lunar } };
  };
  return { search, states };
})();

// ── Prochain lancement : Launch Library 2 (The Space Devs), sans clé ; partagé par toutes les cartes ──
const _issLaunch = (() => {
  const KEY = 'iss-cards-launch', MAXAGE = 30 * 60000;
  const URLS = ['https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&mode=detailed', 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&mode=detailed'];
  let data = null, at = 0, loading = null, failedAt = 0;
  const listeners = new Set();
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.data) { data = c.data; at = c.at || 0; } } catch (e) { /* cache illisible */ }
  const slim = (l) => ({
    name: l.name || '', mission: l.mission?.name || (l.name || '').split('|').pop().trim(), provider: l.launch_service_provider?.name || '',
    pad: l.pad?.name || '', facility: l.pad?.location?.name || '', net: l.net || '', status: l.status?.name || '', probability: l.probability ?? null,
    rocket: l.rocket?.configuration?.full_name || l.rocket?.configuration?.name || '', orbit: l.mission?.orbit?.name || '', description: l.mission?.description || '',
  });
  const passed = () => data && new Date(data.net).getTime() < Date.now() - 3600000;
  const load = () => {
    if (data && Date.now() - at < MAXAGE && !passed()) return Promise.resolve(data);
    if (loading) return loading;
    if (failedAt && Date.now() - failedAt < 600000) return Promise.resolve(data); // nouvel essai dans 10 minutes
    loading = (async () => {
      let last = null;
      for (const u of URLS) {
        try {
          const r = await fetch(u);
          if (!r.ok) throw new Error(`Launch Library ${r.status}${r.status === 429 ? ', trop de requêtes' : ''}`);
          const j = await r.json(), l = (j.results || []).find((x) => new Date(x.net).getTime() > Date.now() - 3600000);
          if (!l) throw new Error('aucun lancement à venir');
          data = slim(l); at = Date.now(); failedAt = 0;
          try { localStorage.setItem(KEY, JSON.stringify({ data, at })); } catch (e) { /* stockage indisponible */ }
          listeners.forEach((f) => f());
          return data;
        } catch (e) { last = e; }
      }
      failedAt = Date.now();
      console.warn('[iss-cards] prochain lancement indisponible :', last?.message || last);
      return data;
    })().finally(() => { loading = null; });
    return loading;
  };
  /** Faux états Home Assistant lus par les cartes Lancement (mêmes attributs que l'intégration Next Launch). */
  const states = () => data && {
    'iss.launch.main': { state: data.name, attributes: { provider: data.provider, pad: data.pad, facility: data.facility } },
    'iss.launch.mission': { state: data.mission, attributes: { target_orbit: data.orbit, rocket_name: data.rocket, description: data.description } },
    'iss.launch.date': { state: data.net, attributes: {} },
    'iss.launch.proba': { state: data.probability === null ? 'unknown' : String(data.probability), attributes: {} },
    'iss.launch.status': { state: data.status, attributes: {} },
  };
  const VCFG = { entity: 'iss.launch.main', mission_entity: 'iss.launch.mission', date_entity: 'iss.launch.date', probability_entity: 'iss.launch.proba', status_entity: 'iss.launch.status' };
  return { load, states, VCFG, onLoad: (f) => { listeners.add(f); return () => listeners.delete(f); }, get failed() { return !data && !!failedAt; } };
})();

// ── Traduction en français des textes de lancement (Launch Library 2 ou Next Launch, en anglais) ──
// Statuts et orbites : dictionnaire. Description : traducteur intégré du navigateur (Chrome, sur
// l'appareil, sans clé), sinon le service gratuit MyMemory ; texte anglais en attendant, traductions gardées.
const _issFr = (() => {
  const STATUS = {
    'go for launch': 'Lancement confirmé (Go)', 'go': 'Lancement confirmé (Go)', 'to be confirmed': 'À confirmer', 'tbc': 'À confirmer',
    'to be determined': 'À déterminer', 'tbd': 'À déterminer', 'launch successful': 'Lancement réussi', 'success': 'Lancement réussi',
    'launch failure': 'Échec du lancement', 'failure': 'Échec du lancement', 'launch was a partial failure': 'Échec partiel', 'partial failure': 'Échec partiel',
    'on hold': 'En attente', 'hold': 'En attente', 'launch in flight': 'En vol', 'in flight': 'En vol', 'payload deployed': 'Charge utile déployée',
  };
  const ORBIT = {
    'low earth orbit': 'Orbite basse (LEO)', 'very low earth orbit': 'Orbite très basse (VLEO)', 'medium earth orbit': 'Orbite moyenne (MEO)',
    'geostationary orbit': 'Orbite géostationnaire (GEO)', 'geosynchronous orbit': 'Orbite géosynchrone', 'geostationary transfer orbit': 'Orbite de transfert géostationnaire (GTO)',
    'geosynchronous transfer orbit': 'Orbite de transfert géosynchrone (GTO)', 'sun-synchronous orbit': 'Orbite héliosynchrone (SSO)', 'polar orbit': 'Orbite polaire',
    'suborbital': 'Suborbital', 'sub-orbital': 'Suborbital', 'elliptical orbit': 'Orbite elliptique', 'highly elliptical orbit': 'Orbite très elliptique (HEO)',
    'lunar orbit': 'Orbite lunaire', 'lunar flyby': 'Survol de la Lune', 'lunar surface': 'Surface de la Lune', 'heliocentric n/a': 'Orbite héliocentrique',
    'heliocentric': 'Orbite héliocentrique', 'mars orbit': 'Orbite martienne', 'mars flyby': 'Survol de Mars', 'low earth orbit (iss)': 'Orbite basse (ISS)',
    'retrograde orbit': 'Orbite rétrograde', 'direct-gto': 'Transfert géostationnaire direct', 'earth-moon l2': 'Point de Lagrange Terre-Lune L2', 'sun-earth l1': 'Point de Lagrange Soleil-Terre L1',
    'sun-earth l2': 'Point de Lagrange Soleil-Terre L2',
  };
  const key = (t) => String(t || '').trim().toLowerCase();
  const KEY = 'iss-cards-fr';
  let memo = {};
  try { memo = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { memo = {}; }
  const save = () => { try { const k = Object.keys(memo); if (k.length > 40) k.slice(0, k.length - 40).forEach((x) => delete memo[x]); localStorage.setItem(KEY, JSON.stringify(memo)); } catch (e) { /* stockage indisponible */ } };
  const pending = new Map(), listeners = new Set();
  let translator = null;
  // traducteur intégré du navigateur (Chrome) seulement si le modèle français est déjà prêt sur l'appareil
  const chrome = async () => {
    if (translator) return translator;
    const T = self.Translator;
    if (!T || !T.availability) return null;
    // certains navigateurs ne répondent jamais : pas plus de 2 secondes d'attente
    const a = await Promise.race([T.availability({ sourceLanguage: 'en', targetLanguage: 'fr' }), new Promise((r) => setTimeout(() => r('délai'), 2000))]);
    if (a !== 'available') return null;
    translator = await T.create({ sourceLanguage: 'en', targetLanguage: 'fr' });
    return translator;
  };
  const myMemory = async (t) => {
    const r = await fetch(`https://api.mymemory.translated.net/get?langpair=en|fr&q=${encodeURIComponent(t.slice(0, 480))}`);
    if (!r.ok) throw new Error(`MyMemory ${r.status}`);
    const j = await r.json(), out = j?.responseData?.translatedText;
    if (!out || j.responseStatus !== 200 || /MYMEMORY WARNING|QUERY LENGTH/i.test(out)) throw new Error('MyMemory : pas de traduction');
    return out;
  };
  /** Texte libre : traduction si elle est prête, sinon le texte d'origine (la traduction arrive ensuite). */
  const text = (t) => {
    const src = String(t || '').trim();
    if (!src) return '';
    if (memo[src]) return memo[src];
    if (!pending.has(src)) {
      pending.set(src, (async () => {
        let out = null;
        try { const tr = await chrome(); if (tr) out = await tr.translate(src); } catch (e) { /* traducteur intégré indisponible */ }
        if (!out) { try { out = await myMemory(src); } catch (e) { console.warn('[iss-cards] traduction indisponible :', e.message || e); } }
        if (out) { memo[src] = out; save(); listeners.forEach((f) => f()); }
      })());
    }
    return src;
  };
  return {
    status: (t) => STATUS[key(t)] || t,
    orbit: (t) => ORBIT[key(t)] || t,
    text,
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };
})();

// Diagnostic dans la console du navigateur (F12) :
//   issCards.passages()           tous les passages des 10 prochains jours
//   issCards.passages(14, true)   seulement ceux qui sont visibles à l'œil nu
window.issCards = window.issCards || {
  passages: (days = 10, visibleOnly = false) => {
    const h = document.querySelector('home-assistant')?.hass, o = h && _issLive.observer(h);
    if (!o || !_ISS.sat) return console.warn('[iss-cards] position de Home Assistant ou éléments orbitaux indisponibles');
    const st = _ISS.site(o.lat, o.lon, o.alt);
    const d = (ms) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const t = (ms) => new Date(ms).toLocaleTimeString('fr-FR');
    const rows = _ISS.passes(_ISS.sat, st, Date.now(), days, 200).filter((p) => !visibleOnly || p.vis).map((p) => ({
      début: d(p.start), min: +((p.end - p.start) / 60000).toFixed(1), haut: +p.maxEl.toFixed(1),
      trajet: [p.startAz, p.maxAz, p.endAz].map(_ISS.compass).join('→'),
      soleil: +_ISS.sunEl(p.maxT, st).toFixed(1),
      visible: p.vis ? `${t(p.vis.start)}→${t(p.vis.end)} (${((p.vis.end - p.vis.start) / 60000).toFixed(1)} min)` : '',
    }));
    console.table(rows);
    console.info('[iss-cards] TLE du', new Date(_ISS.sat.epochMs).toLocaleString('fr-FR'), '— soleil : hauteur du Soleil à la culmination (°)');
  },
};

// ── Mise en forme française : nombres à virgule, coordonnées, points cardinaux (O pour ouest) ──
const _issNum = (v, d = 1) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : String(v ?? '—'); };
const _issCoords = (lat, lon) => `Lat. ${_issNum(Math.abs(lat), 2)}° ${lat >= 0 ? 'N' : 'S'} · Long. ${_issNum(Math.abs(lon), 2)}° ${lon >= 0 ? 'E' : 'O'}`;
/** Points cardinaux en français : W (ouest) devient O, dans « WSW → NNW » comme dans « SW ». */
const _issCardFr = (t) => String(t ?? '').replace(/\b[NSEW]{1,3}\b/g, (m) => m.replace(/W/g, 'O'));
/** Durée en secondes : « 2 min 05 s », « 45 s », « 0,6 s ». */
const _issDur = (sec) => {
  const n = parseFloat(sec);
  if (!Number.isFinite(n)) return '—';
  if (n < 10) return `${_issNum(n, n % 1 ? 1 : 0)} s`;
  if (n < 60) return `${Math.round(n)} s`;
  return `${Math.floor(n / 60)} min ${String(Math.round(n % 60)).padStart(2, '0')} s`;
};
/** Compte à rebours : « dans 9 j 4 h », « dans 3 h 05 min », « dans 12 min ». */
const _issIn = (ms) => {
  let s = Math.round((ms - Date.now()) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 0) return 'passé';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return d > 0 ? `dans ${d} j ${h} h` : h > 0 ? `dans ${h} h ${String(m).padStart(2, '0')} min` : `dans ${m} min`;
};

// ── Mode démo : passages, distance et transits calculés pour un lieu fictif (captures d'écran sans votre position) ──
const _ISS_DEMO_SITE = { latitude: 46.5, longitude: 2.5, elevation: 200 }; // centre de la France
const _issObsHass = (h, demo) => (demo && h ? { ...h, config: { ...(h.config || {}), ..._ISS_DEMO_SITE } } : h);
const _issDemoField = (on) => `<div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input id="demo" type="checkbox" style="width:auto"${on ? ' checked' : ''}> Mode démo : lieu fictif (centre de la France) au lieu de la position de Home Assistant, pour les captures d'écran</label></div>`;
const _issBindDemo = (ed) => {
  const el = ed.shadowRoot && ed.shadowRoot.getElementById('demo');
  if (el) el.addEventListener('change', (e) => { ed._config = { ...ed._config, demo: e.target.checked }; if (!e.target.checked) delete ed._config.demo; ed._emit(); });
};

const _ISS_THEMES = [
  ['v2', 'Style MyElectricalData (bleu nuit)'],
  ['auto', 'Style MyElectricalData, clair ou sombre selon Home Assistant'],
  ['ha', 'Thème Home Assistant (clair ou sombre)'],
];
/** Liste « Couleurs de la carte » dans un éditeur (champ <select id="theme">). */
const _issThemeField = (cur) => `<div class="field"><label>Couleurs de la carte</label><select id="theme" style="width:100%;box-sizing:border-box;padding:7px 8px;border-radius:6px;border:1px solid var(--divider-color,#555);background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#eee);font-size:13px;">${_ISS_THEMES.map(([v, l]) => `<option value="${v}"${(cur || 'v2') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
const _issBindTheme = (ed) => {
  const sel = ed.shadowRoot && ed.shadowRoot.getElementById('theme');
  if (sel) sel.addEventListener('change', (e) => { ed._config = { ...ed._config, theme: e.target.value }; ed._emit(); });
};

/**
 * ISS TRACKER — Position de l'ISS + petite carte
 * type: custom:glossy-iss-tracker-card
 *
 * YAML (seule "entity" est requise) :
 *
 *   type: custom:glossy-iss-tracker-card
 *   entity: sensor.iss_position          # fournit latitude/longitude en attributs
 *   status_entity: sensor.iss            # facultatif — état utilisé pour le vert/rouge
 *                                         #   (par défaut : "entity" elle-même)
 *   lat_entity: sensor.iss_latitude      # facultatif — repli si l'attribut latitude est absent/à 0
 *   lon_entity: sensor.iss_longitude     # facultatif — repli si l'attribut longitude est absent/à 0
 *   zoom_span: 40                        # facultatif — largeur de la vue carte en degrés (défaut 40)
 *   stadia_api_key: ''                   # facultatif — fond Stadia Maps (client.stadiamaps.com)
 *   carto_api_key: ''                    # facultatif — fond CARTO avec clé (carto.com/basemaps/apikey)
 *
 * Sans clé : fond vectoriel OpenFreeMap (gratuit, sans clé) affiché avec MapLibre GL,
 * livré dans dist/iss-cards-maps.js à côté de ce fichier (aucun CDN). Avec une clé
 * Stadia Maps ou CARTO : leurs tuiles, placées directement.
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
  /* MapLibre donne position:relative à son conteneur : la carte aurait une hauteur nulle */
  .vmap{position:absolute!important;inset:0;}
  .zbtn{position:absolute;top:8px;right:8px;z-index:2;display:flex;flex-direction:column;gap:4px}.zbtn button{width:28px;height:28px;padding:0;border-radius:8px;border:1px solid color-mix(in srgb,var(--g-edge) 35%,transparent);background:color-mix(in srgb,var(--g-deep) 80%,transparent);color:var(--g-text);font:600 17px/1 var(--g-font);cursor:pointer}.zbtn button:hover{border-color:var(--g-acc);color:var(--g-acc2)}.zbtn button:focus-visible{outline:2px solid var(--g-acc);outline-offset:1px}.zbtn button.zc{font-size:15px}.free .zbtn button.zc{color:var(--g-acc2);border-color:var(--g-acc)}.tiles{cursor:grab}.drag .tiles{cursor:grabbing}.vmap .maplibregl-canvas-container{cursor:grab}
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
// Zoom en cours de la mini-carte : celui choisi par l'utilisateur (boutons, Ctrl + molette, pincement), sinon celui de la config.
const _issZ = (owner, span) => (owner._uz != null ? owner._uz : _issZoom(span));
const _ISS_ZMIN = 1, _ISS_ZMAX = 12;
/** Boutons + et − de la mini-carte (délégation sur le conteneur, posée une seule fois). */
const _issZoomButtons = '<div class="zbtn"><button type="button" data-z="1" title="Zoomer" aria-label="Zoomer">+</button><button type="button" data-z="-1" title="Dézoomer" aria-label="Dézoomer">−</button><button type="button" data-z="0" class="zc" title="Recentrer sur l\'ISS et la suivre" aria-label="Recentrer sur l\'ISS">◎</button></div>';
// Suivi de l'ISS : interrompu quand on déplace la carte, repris avec ◎ ou après une minute sans y toucher.
const _ISS_FOLLOW_RESUME = 60000;
const _issFollowing = (owner, wrap) => {
  if (owner._follow === false && Date.now() - (owner._touched || 0) > _ISS_FOLLOW_RESUME) { owner._follow = true; owner._center = null; }
  const f = owner._follow !== false;
  if (wrap) wrap.classList.toggle('free', !f);
  return f;
};
const _issStopFollow = (owner, wrap) => { owner._follow = false; owner._touched = Date.now(); if (wrap) wrap.classList.add('free'); };
/** Point vert à sa vraie place (x, y en pixels dans la mini-carte). */
const _issPlaceDot = (wrap, x, y) => { const d = wrap.querySelector('.dot'); if (d) { d.style.left = `${Math.round(x)}px`; d.style.top = `${Math.round(y)}px`; } };
const _issBindZoom = (owner, wrap, span, redraw) => {
  if (wrap._issZoomBound) return;
  wrap._issZoomBound = true;
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-z]');
    if (!b) return;
    e.stopPropagation();
    const raster = !!wrap.querySelector('.tiles');
    if (b.dataset.z === '0') { owner._follow = true; owner._center = null; redraw(); return; }
    let z = _issZ(owner, span()) + Number(b.dataset.z);
    z = Math.max(_ISS_ZMIN, Math.min(raster ? 10 : _ISS_ZMAX, raster ? Math.round(z) : z));
    owner._uz = z;
    if (!raster && owner._vmap) owner._vmap.easeTo({ zoom: Math.max(0, z - 1), duration: 250 });
    if (owner._follow === false) owner._touched = Date.now();
    redraw();
  });
};
// URL des tuiles quand une clé Stadia Maps ou CARTO est donnée ; sans clé (null) : fond vectoriel OpenFreeMap.
// (Les fonds CARTO sans clé portent désormais un filigrane « API KEY REQUIRED », home-assistant/frontend#53800.)
const _issTileUrl = (c, light) => c.stadia_api_key
  ? `https://tiles.stadiamaps.com/tiles/${light ? 'alidade_smooth' : 'alidade_smooth_dark'}/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(c.stadia_api_key)}`
  : c.carto_api_key ? `https://basemaps.cartocdn.com/rastertiles/${light ? 'voyager' : 'dark-matter'}/{z}/{x}/{y}.png?key=${encodeURIComponent(c.carto_api_key)}`
  : null;
const _ISS_OFM = 'https://tiles.openfreemap.org/styles/';
const _ISS_OFM_ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
/** MapLibre GL, livré à côté de ce fichier (dist/iss-cards-maps.js), chargé à la première mini-carte sans clé.
 *  Même paramètre de version que ce fichier (hacstag) : une mise à jour recharge aussi la bibliothèque. */
let _issMapsLib = null;
const _issLoadMaps = () => {
  if (!_issMapsLib) {
    const self = new URL(import.meta.url), url = new URL('./iss-cards-maps.js', self);
    url.search = self.search || `?v=${CARD_VERSION}`;
    _issMapsLib = import(url.href).catch((e) => { _issMapsLib = null; throw new Error(`iss-cards-maps.js introuvable (${e.message})`); });
  }
  return _issMapsLib;
};
/**
 * Mini-carte vectorielle (OpenFreeMap) dans `wrap` (qui contient un <div class="vmap">), centrée sur
 * (lat, lon) au zoom z des tuiles 256 px. `owner` garde l'instance MapLibre (owner._vmap).
 */
/** Tuiles (avec clé) : centre = l'ISS quand la carte la suit, sinon le centre choisi en glissant à la souris. */
const _issRaster = (owner, wrap, lat, lon, z, tileUrl, redraw) => {
  const layer = wrap.querySelector('.tiles'), W = wrap.offsetWidth, H = wrap.offsetHeight;
  if (!layer || !W || !H) return;
  const follow = _issFollowing(owner, wrap), c = !follow && owner._center ? owner._center : { lat, lon };
  layer.innerHTML = _issTilesHtml(c.lat, c.lon, z, W, H, tileUrl);
  const n = 256 * 2 ** z, a = _issWorldPx(lat, lon, z), o = _issWorldPx(c.lat, c.lon, z);
  const dx = ((a.x - o.x + n / 2) % n + n) % n - n / 2; // le plus court chemin autour du monde
  _issPlaceDot(wrap, W / 2 + dx, H / 2 + a.y - o.y);
  if (wrap._issPanBound) return;
  wrap._issPanBound = true;
  let start = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.zbtn, .attr') || !wrap.querySelector('.tiles')) return;
    const zz = owner._rz, cc = owner._follow === false && owner._center ? owner._center : owner._iss;
    if (!cc || zz == null) return;
    start = { x: e.clientX, y: e.clientY, p: _issWorldPx(cc.lat, cc.lon, zz), z: zz };
    wrap.setPointerCapture(e.pointerId); wrap.classList.add('drag');
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!start) return;
    const n2 = 256 * 2 ** start.z, x = start.p.x - (e.clientX - start.x), y = Math.max(0, Math.min(n2, start.p.y - (e.clientY - start.y)));
    _issStopFollow(owner, wrap);
    owner._center = { lon: ((((x / n2) * 360) % 360) + 360) % 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n2))) * 180 / Math.PI };
    redraw();
  });
  const end = () => { start = null; wrap.classList.remove('drag'); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
};

const _issVector = async (owner, wrap, lat, lon, z, light) => {
  owner._iss = { lat, lon };
  const lib = await _issLoadMaps();
  const host = wrap.querySelector('.vmap');
  if (!host || !host.isConnected) return;
  const root = wrap.getRootNode();
  if (root instanceof ShadowRoot && !root.querySelector('style[data-maplibre]')) {
    const st = document.createElement('style'); st.dataset.maplibre = '1'; st.textContent = lib.maplibreCss; root.appendChild(st);
  }
  const style = _ISS_OFM + (light ? 'liberty' : 'dark'), zoom = Math.max(0, z - 1); // tuiles vectorielles de 512 px
  let m = owner._vmap;
  if (m && m.getContainer() !== host) { try { m.remove(); } catch (e) { /* déjà retirée */ } m = null; }
  if (!m) {
    m = new lib.maplibregl.Map({
      container: host, style, center: [lon, lat], zoom, attributionControl: false, fadeDuration: 0,
      // déplacement et zoom ; molette avec Ctrl et deux doigts sur écran tactile, pour laisser défiler la page
      dragRotate: false, keyboard: false, boxZoom: false, touchPitch: false, cooperativeGestures: true,
      minZoom: _ISS_ZMIN - 1, maxZoom: _ISS_ZMAX - 1,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer',
        'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer',
        'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer ou zoomer',
      },
    });
    m.touchZoomRotate.disableRotation();
    m.doubleClickZoom.enable();
    m.on('dragstart', () => _issStopFollow(owner, wrap));
    m.on('move', () => { const p = owner._iss && m.project([owner._iss.lon, owner._iss.lat]); if (p) _issPlaceDot(wrap, p.x, p.y); });
    // tout zoom qui ne vient pas du suivi de l'ISS est celui de l'utilisateur : il est gardé
    m.on('zoomend', () => { if (!m._issProg) { owner._uz = m.getZoom() + 1; if (owner._onZoom) owner._onZoom(); } });
    m._issStyle = style; owner._vmap = m;
    m._issProg = true; m.once('load', () => { m._issProg = false; });
    _issFollowing(owner, wrap);
    m.on('styledata', () => _issFrenchLabels(m));
  } else {
    if (m._issStyle !== style) { m.setStyle(style); m._issStyle = style; }
    m.resize();
    if (_issFollowing(owner, wrap) && !m.isZooming() && !m.isMoving()) { m._issProg = true; m.jumpTo({ center: [lon, lat], zoom }); m._issProg = false; }
  }
  { const p = m.project([lon, lat]); _issPlaceDot(wrap, p.x, p.y); }
};
/** Noms de lieux en français (sinon en alphabet latin, sinon le nom local) sur toutes les couches de texte. */
const _issFrenchLabels = (m) => {
  const st = m.getStyle && m.getStyle();
  if (!st || !st.layers) return;
  const field = ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name_int'], ['get', 'name']];
  for (const l of st.layers) {
    if (l.type !== 'symbol' || !l.layout || !l.layout['text-field'] || l._issFr) continue;
    try { m.setLayoutProperty(l.id, 'text-field', field); } catch (e) { /* couche sans nom */ }
  }
};
const _issDropVector = (owner) => { if (owner._vmap) { try { owner._vmap.remove(); } catch (e) { /* déjà retirée */ } owner._vmap = null; } };
/** La carte s'affiche-t-elle en clair (thème clair, ou thème Home Assistant en mode clair) ? */
const _issLight = (el) => { const t = el.getAttribute('data-theme'); return t === 'light' || (t === 'ha' && el._h?.themes?.darkMode === false); };
const _issAttribution = (c) => !c.stadia_api_key && !c.carto_api_key ? _ISS_OFM_ATTR : c.stadia_api_key
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
    this._uz = null; this._follow = true; this._center = null;
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
    // sans entité : position calculée par la carte (éléments orbitaux de l'ISS)
    this._w.innerHTML = `
      <div class="bar">
        <ha-icon id="is-icon" icon="mdi:satellite-variant"></ha-icon>
        <span class="bar-name">SUIVI DE L’ISS</span>
        <span class="bar-coords" id="is-coords">—</span>
      </div>
      <div class="map-wrap" id="is-map">
        <div class="map-empty">Position en attente…</div>
      </div>
    `;
  }

  connectedCallback() { this._startLive(); }
  disconnectedCallback() {
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
    _issDropVector(this);
    const mw = this._w && this._w.querySelector('#is-map .vmap');
    if (mw) mw.parentElement.innerHTML = ''; // recréée au retour sur la page
    clearInterval(this._liveTimer); this._liveTimer = null;
    if (this._offLoad) { this._offLoad(); this._offLoad = null; }
  }

  // Position calculée : mise à jour toutes les 5 secondes, et dès que les éléments orbitaux arrivent.
  _startLive() {
    if (this._liveTimer) return;
    this._liveTimer = setInterval(() => { if (this._h && this._config && !this._config.entity) { _ISS.load(); this._update(); } }, 5000);
    this._offLoad = _ISS.onLoad(() => this._update());
  }

  _update() {
    if (!this._h || !this._w) return;
    const s = this._h.states;
    const cfg = this._config;
    if (!cfg.entity) { _ISS.load(); this._startLive(); }

    const statusState = s[cfg.status_entity];
    const live = !cfg.entity ? _issLive.position() : null;
    const isBad = cfg.entity ? (!statusState || statusState.state === 'unavailable' || statusState.state === 'unknown') : !(live && _issLive.fresh());

    const icon = this._w.querySelector('#is-icon');
    if (icon) icon.className = isBad ? 'err' : 'ok';

    const mainEntity = cfg.entity ? s[cfg.entity] : null;
    let lat = live ? live.lat : mainEntity?.attributes?.latitude;
    let lon = live ? live.lon : mainEntity?.attributes?.longitude;
    if (!live && (!lat || lat === 0)) lat = cfg.lat_entity ? parseFloat(s[cfg.lat_entity]?.state) : NaN;
    if (!live && (!lon || lon === 0)) lon = cfg.lon_entity ? parseFloat(s[cfg.lon_entity]?.state) : NaN;
    lat = Number(lat); lon = Number(lon);
    const hasCoords = typeof lat === 'number' && !isNaN(lat) && typeof lon === 'number' && !isNaN(lon) && !(lat === 0 && lon === 0);

    const coordsEl = this._w.querySelector('#is-coords');
    if (coordsEl) {
      coordsEl.textContent = hasCoords ? _issCoords(lat, lon) : 'Signal perdu…';
      coordsEl.className = 'bar-coords ' + (isBad ? 'err' : 'ok');
    }

    const mapWrap = this._w.querySelector('#is-map');
    if (!mapWrap) return;
    if (!hasCoords) {
      mapWrap.innerHTML = `<div class="map-empty">${cfg.entity ? 'Signal perdu — pas de position disponible' : (_ISS.sat ? 'Position en attente…' : this._esc(_issLive.problem(this._h) || 'Position en attente…'))}</div>`;
      return;
    }
    const tileUrl = _issTileUrl(this._config, _issLight(this)), kind = tileUrl ? 'tiles' : 'vmap';
    this._pos = { lat, lon, color: isBad ? '#ff4466' : '#22dd88', tileUrl };
    if (!mapWrap.querySelector('.' + kind)) {
      if (kind === 'tiles') _issDropVector(this);
      const attr = _issAttribution(this._config);
      mapWrap.innerHTML = `<div class="${kind}"></div><div class="dot"></div>${_issZoomButtons}<div class="attr">${attr}</div>`;
      _issBindZoom(this, mapWrap, () => this._config.zoom_span, () => this._drawTiles());
      // Le conteneur peut n'avoir sa vraie taille qu'un peu plus tard (onglet
      // ou section pas encore visible) : on redessine à chaque changement.
      if (this._resizeObs) this._resizeObs.disconnect();
      this._resizeObs = new ResizeObserver(() => this._drawTiles());
      this._resizeObs.observe(mapWrap);
    }
    this._drawTiles();
  }

  _esc(v) { return (v ?? '').toString().replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Tuiles autour de l'ISS, centrée dans la mini-carte. Le navigateur garde
  // les tuiles en cache : seules les nouvelles sont téléchargées.
  _drawTiles() {
    const mapWrap = this._w && this._w.querySelector('#is-map');
    if (mapWrap && this._pos && !this._pos.tileUrl && mapWrap.querySelector('.vmap')) {
      mapWrap.querySelector('.dot')?.style.setProperty('--dc', this._pos.color);
      _issVector(this, mapWrap, this._pos.lat, this._pos.lon, _issZ(this, this._config.zoom_span), _issLight(this))
        .catch((e) => { _issDropVector(this); mapWrap.innerHTML = `<div class="map-empty">Carte indisponible : ${this._esc(e.message)}</div>`; });
      return;
    }
    if (!mapWrap || !this._pos) return;
    const { lat, lon, color, tileUrl } = this._pos, z = Math.round(Math.min(10, _issZ(this, this._config.zoom_span)));
    this._iss = { lat, lon }; this._rz = z;
    mapWrap.querySelector('.dot')?.style.setProperty('--dc', color);
    _issRaster(this, mapWrap, lat, lon, z, tileUrl, () => this._drawTiles());
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
        <div class="field"><label>Entité position (attributs latitude/longitude) — laisser vide : position calculée par la carte</label><ha-entity-picker id="entity"></ha-entity-picker></div>
        <div class="field"><label>Entité de statut (facultatif — vert/rouge)</label><ha-entity-picker id="status_entity"></ha-entity-picker></div>
        <div class="hint">Laisser vide utilise l'entité position elle-même pour déterminer si le signal est perdu.</div>
        <div class="field"><label>Latitude de repli (facultatif)</label><ha-entity-picker id="lat_entity"></ha-entity-picker></div>
        <div class="field"><label>Longitude de repli (facultatif)</label><ha-entity-picker id="lon_entity"></ha-entity-picker></div>
        <div class="field"><label>Largeur de la vue carte (degrés)</label><input id="zoom_span" type="number" value="${cfg.zoom_span}"></div>
        <div class="field"><label>Clé API Stadia Maps (facultative, prioritaire si les deux sont remplies)</label><input id="stadia_api_key" type="text" value="${this._esc(cfg.stadia_api_key)}" placeholder="client.stadiamaps.com"></div>
        <div class="field"><label>Clé API CARTO Basemaps (facultative)</label><input id="carto_api_key" type="text" value="${this._esc(cfg.carto_api_key)}" placeholder="carto.com/basemaps/apikey"></div>
        <div class="hint">Sans clé, la carte utilise le fond vectoriel OpenFreeMap, gratuit et sans clé. Une clé Stadia Maps ou CARTO, gratuite, donne leurs propres fonds. Les clés restent dans ta configuration, jamais dans le fichier partagé.</div>
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
 * PASSAGES ISS — Prochains passages ISS (visible/global) + distance
 * type: custom:glossy-iss-passes-card
 *
 * YAML (tout est facultatif — chaque section ne s'affiche que si son
 * entité "readable" est configurée) :
 *
 *   type: custom:glossy-iss-passes-card
 *   title: Passages ISS
 *   visible_readable_entity: sensor.iss_prochain_passage_visible_lisible  # état = date déjà formatée
 *   visible_attrs_entity:    sensor.iss_prochain_passage_visible          # attrs: duration, maxEl, startAzCompass, maxAzCompass, endAzCompass
 *   global_readable_entity:  sensor.iss_prochain_passage_global_lisible
 *   global_attrs_entity:     sensor.iss_prochain_passage_global
 *   distance_entity: sensor.distance_iss     # facultatif — affiche un petit graphique
 *   distance_hours: 12                       # facultatif — fenêtre d'historique (défaut 12h)
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
      demo: !!config.demo,
      title: config.title || 'Passages ISS',
      visible_readable_entity: config.visible_readable_entity || '',
      visible_attrs_entity: config.visible_attrs_entity || '',
      global_readable_entity: config.global_readable_entity || '',
      global_attrs_entity: config.global_attrs_entity || '',
      distance_entity: config.distance_entity || '',
      distance_hours: config.distance_hours != null ? config.distance_hours : 12,
      min_elevation: config.min_elevation != null ? Number(config.min_elevation) : 10,
      min_visible: config.min_visible != null ? Number(config.min_visible) : 120,
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
    if (this._live()) { _ISS.load(); this._startLive(); }
  }

  /** Sans capteur de passage ni de distance : tout est calculé par la carte. */
  _live() { const c = this._config; return !!c && !c.visible_readable_entity && !c.global_readable_entity && !c.distance_entity; }
  _startLive() {
    if (this._liveTimer) return;
    this._liveTimer = setInterval(() => { if (this._h && this._live()) { _ISS.load(); this._update(); } }, 30000);
    this._offLoad = _ISS.onLoad(() => this._update());
  }
  connectedCallback() { if (this._live()) this._startLive(); }
  disconnectedCallback() { clearInterval(this._liveTimer); this._liveTimer = null; if (this._offLoad) { this._offLoad(); this._offLoad = null; } }

  _init() {
    this._ok = true;
    const sh = this.shadowRoot;
    sh.innerHTML = '';
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
    let html = `<div class="sec">${this._esc(cfg.title.toUpperCase())}${cfg.demo ? ' · DÉMO' : ''}</div>`;
    let any = false;
    const live = this._live();
    if (live) html += `<div class="empty-state" id="live-msg" hidden></div>`;

    if (live || cfg.visible_readable_entity) {
      any = true;
      html += `<div class="pass" id="pass-visible"></div>`;
    }
    if (live || cfg.global_readable_entity) {
      any = true;
      html += `<div class="sec spaced">PASSAGE GLOBAL</div><div class="pass" id="pass-global"></div>`;
    }
    if (live || cfg.distance_entity) {
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
        const dur = _issDur(attrs.duration);
        if (dur !== '—') lines.push(`<p><strong>Durée :</strong> ${dur}</p>`);
      }
      if (attrs.maxEl != null) {
        lines.push(`<p><strong>Hauteur max :</strong> ${this._esc(_issNum(attrs.maxEl, 1))}°</p>`);
      }
      if (attrs.startAzCompass != null || attrs.maxAzCompass != null || attrs.endAzCompass != null) {
        const path = [attrs.startAzCompass, attrs.maxAzCompass, attrs.endAzCompass].filter(Boolean).join(' → ');
        lines.push(`<p><strong>Trajet :</strong> ${this._esc(_issCardFr(path))}</p>`);
      }
    }
    el.innerHTML = lines.join('');
  }

  _update() {
    if (!this._h || !this._w) return;
    const cfg = this._config;
    if (this._live()) {
      const oh = _issObsHass(this._h, cfg.demo), msg = _issLive.problem(oh), m = this._q('live-msg');
      if (m) { m.hidden = !msg; m.textContent = msg || ''; }
      const nx = msg ? null : _issLive.next(oh, cfg.min_elevation, 10, cfg.min_visible);
      const esc = (v) => this._esc(v);
      const pv = this._q('pass-visible'), pg = this._q('pass-global');
      if (pv) pv.innerHTML = msg ? '' : _issLive.lines(nx && nx.visible, esc);
      if (pg) pg.innerHTML = msg ? '' : _issLive.lines(nx && nx.global, esc);
      const d = _issLive.distance(oh), nowEl = this._q('dist-now');
      if (nowEl) nowEl.textContent = d === null ? '—' : Math.round(d).toLocaleString('fr-FR');
      this._distHistory = _issLive.history(oh, cfg.distance_hours);
      this._drawGraph();
      return;
    }
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
        ${_issDemoField(cfg.demo)}
        <div class="field"><label>Titre</label><input id="title" type="text" value="${this._esc(cfg.title)}"></div>

        <div class="hint">Laisser toutes les entités vides : passages et distance sont calculés par la carte, depuis la position de Home Assistant (options YAML min_elevation : hauteur minimale du passage, 10° par défaut ; min_visible : durée minimale à l'œil nu, 120 s par défaut).</div>
        <h4>Prochain passage visible</h4>
        <div class="field"><label>Entité lisible (texte déjà formaté)</label><ha-entity-picker id="visible_readable_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité attributs (durée, hauteur, trajet — facultatif)</label><ha-entity-picker id="visible_attrs_entity"></ha-entity-picker></div>

        <h4>Prochain passage global</h4>
        <div class="hint">Laisser vide masque toute la section.</div>
        <div class="field"><label>Entité lisible (texte déjà formaté)</label><ha-entity-picker id="global_readable_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité attributs (facultatif)</label><ha-entity-picker id="global_attrs_entity"></ha-entity-picker></div>

        <h4>Distance de l’ISS (facultatif)</h4>
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

    _issBindTheme(this); _issBindDemo(this);
    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-iss-passes-card-editor', GlossyIssPassesCardEditor);

/**
 * TRANSITS ISS — Prochains transits solaires/lunaires de l'ISS
 * type: custom:glossy-iss-transit-card
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

function _itCountdown(iso) { return _issIn(new Date(iso).getTime()) || null; }

const _issDuration = (sec) => _itFmtDuration(sec);
function _itFmtDuration(sec) { return _issDur(sec); }

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
      demo: !!config.demo,
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
    if (this._live()) { _ISS.load(); this._startLive(); }
    const ents = [this._config.solar_entity, this._config.lunar_entity].filter(Boolean);
    const fp = ents.map(e => {
      const st = h.states[e];
      return st ? st.state + '|' + JSON.stringify(st.attributes) : 'x';
    }).join('||');
    if (fp === this._fp) return;
    this._fp = fp;
    this._update();
  }

  /** Sans entité : transits calculés par la carte. */
  _live() { return !!this._config && !this._config.solar_entity && !this._config.lunar_entity; }
  _vcfg() { return this._live() ? { ...this._config, solar_entity: 'iss.transit.solar', lunar_entity: 'iss.transit.lunar' } : this._config; }
  _startLive() {
    if (this._liveTimer) return;
    this._liveTimer = setInterval(() => { if (this._h && this._live()) { _ISS.load(); this._update(); } }, 60000);
    this._offLoad = _ISS.onLoad(() => this._update());
  }
  connectedCallback() { if (this._live()) this._startLive(); }
  disconnectedCallback() { clearInterval(this._liveTimer); this._liveTimer = null; if (this._offLoad) { this._offLoad(); this._offLoad = null; } }

  _init() {
    this._ok = true;
    const sh = this.shadowRoot;
    sh.innerHTML = '';
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
    const cfg = this._vcfg();
    const panels = [];
    if (cfg.solar_entity) panels.push({ kind: 'solar', icon: '☀️', label: 'TRANSIT SOLAIRE', color: 'var(--sun)' });
    if (cfg.lunar_entity) panels.push({ kind: 'lunar', icon: '🌙', label: 'TRANSIT LUNAIRE', color: 'var(--moon)' });

    if (!panels.length) {
      this._inn.innerHTML = `
        <div class="sec">${this._esc(cfg.title.toUpperCase())}${cfg.demo ? ' · DÉMO' : ''}</div>
        <div class="empty-state">Aucune entité configurée</div>`;
      return;
    }

    this._inn.innerHTML = `
      <div class="sec">${this._esc(cfg.title.toUpperCase())}${cfg.demo ? ' · DÉMO' : ''}</div>
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
    const live = this._live(), cfg = this._vcfg();
    const oh = _issObsHass(this._h, this._config.demo), vs = live ? _issTransit.states(oh) : null;
    const s = vs ? { ...this._h.states, ...vs } : this._h.states;
    const msg = live ? _issLive.problem(oh) : null;

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

      if (msg) { body.innerHTML = `<div class="p-empty">${this._esc(msg)}</div>`; return; }
      if (!date) {
        body.innerHTML = `
          <div class="p-empty">
            Aucun transit prévu ${live ? 'dans les 14 prochains jours' : "dans l'année"}.
            ${closest != null ? `<br>Approche la plus proche : <strong>${_issNum(closest, 1)}°</strong>` : ''}
          </div>`;
        return;
      }

      const countdown = _itCountdown(date);
      const elevation = attrs.max_elevation_deg;
      const distance = attrs.iss_distance_km;

      let metrics = `
        <div class="mi"><div class="mii">⏱️</div><div class="mil">Durée</div><div class="miv">${this._esc(_itFmtDuration(attrs.duration_seconds))}</div></div>
        <div class="mi"><div class="mii">📐</div><div class="mil">Hauteur</div><div class="miv">${elevation != null ? _issNum(elevation, 1) + '°' : '—'}</div></div>
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
        ${_issDemoField(cfg.demo)}
        <div class="field"><label>Titre</label><input id="title" type="text" value="${this._esc(cfg.title)}"></div>
        <div class="hint">Les deux entités sont facultatives : vides, les transits sont calculés par la carte (14 prochains jours).</div>
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

    _issBindTheme(this); _issBindDemo(this);
    this._built = true;
  }

  _syncPickers() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = this._hass; });
  }
}
define('glossy-iss-transit-card-editor', GlossyIssTransitCardEditor);

/**
 * PROCHAIN LANCEMENT — Prochain lancement (Next Launch)
 * type: custom:glossy-launch-card
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
 *   imminent_minutes: 15   # facultatif — bordure rouge clignotante sous ce seuil (défaut 15)
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
    if (this._live()) { _issLaunch.load(); this._startLive(); }
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
  /** Sans entité : prochain lancement lu sur Launch Library 2. */
  _live() { return !!this._config && !this._config.entity; }
  _startLive() {
    if (this._liveTimer) return;
    this._liveTimer = setInterval(() => { if (this._h && this._live()) { _issLaunch.load(); this._update(); } }, 30000);
    this._offLoad = _issLaunch.onLoad(() => this._update());
  }
  connectedCallback() { if (this._live()) this._startLive(); }
  disconnectedCallback() { clearInterval(this._liveTimer); this._liveTimer = null; if (this._offLoad) { this._offLoad(); this._offLoad = null; } }

  _buildDom() {
    if (!this._w || !this._config) return;
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
    if (!this._h || !this._w) return;
    const live = this._live(), vs = live ? _issLaunch.states() : null;
    const s = vs ? { ...this._h.states, ...vs } : this._h.states;
    const cfg = live ? { ...this._config, ..._issLaunch.VCFG } : this._config;
    if (live && !vs) {
      const m = this._q('lc-mission');
      if (m) m.textContent = _issLaunch.failed ? 'Prochain lancement indisponible (Launch Library 2)' : 'Chargement du prochain lancement…';
      return;
    }

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
      const orbit = _issFr.orbit(missionAttrs.target_orbit) || '—';
      const rocket = missionAttrs.rocket_name || '—';
      const statusText = status ? status.state : '';
      const probaVal = proba ? proba.state : null;
      const probaDisplay = (!probaVal || probaVal === 'unknown' || probaVal === 'unavailable')
        ? 'Pas de données' : probaVal + '%';
      const isGo = /go/i.test(statusText);
      let rows = '';
      if (cfg.probability_entity) rows += `<div class="row"><span><b>Météo</b></span><span>${this._esc(probaDisplay)}</span></div>`;
      rows += `<div class="row"><span><b>Lanceur</b></span><span>${this._esc(rocket)}</span></div>`;
      rows += `<div class="row"><span><b>Orbite</b></span><span>${this._esc(orbit)}</span></div>`;
      if (cfg.status_entity) rows += `<div class="row status ${isGo ? 'go' : 'nogo'}"><span><b>Statut</b></span><span><b>${this._esc(_issFr.status(statusText))}</b></span></div>`;
      statsEl.innerHTML = rows;
    }

    // ── Description ──
    const descEl = this._q('lc-desc');
    if (descEl) descEl.textContent = _issFr.text(mission?.attributes?.description);
    if (!this._offFr) this._offFr = _issFr.onChange(() => this._update());
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
        <div class="field"><label>Entité principale (agence, pas de tir, site) — vide : Launch Library 2</label><ha-entity-picker id="entity"></ha-entity-picker></div>
        <div class="field"><label>Entité mission (nom, orbite, lanceur, description)</label><ha-entity-picker id="mission_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité date de lancement</label><ha-entity-picker id="date_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité probabilité météo (facultatif)</label><ha-entity-picker id="probability_entity"></ha-entity-picker></div>
        <div class="field"><label>Entité statut (facultatif)</label><ha-entity-picker id="status_entity"></ha-entity-picker></div>
        <div class="field"><label>Seuil "imminent" (minutes)</label><input id="imminent_minutes" type="number" value="${cfg.imminent_minutes}"></div>
        <div class="hint">Sous ce seuil avant le décollage, la carte passe en bordure rouge clignotante.</div>
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
:host{display:block;font-family:var(--g-font);color:var(--g-text);font-size:16px;--acc:var(--g-acc);--amber:var(--g-acc2);--muted:color-mix(in srgb,var(--g-muted) 62%,transparent);--ok:#22dd88;--err:#ff4466;--panel:var(--g-panel)}
*{box-sizing:border-box}.shell{container-type:inline-size;position:relative;overflow:hidden;padding:10px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:18px;background:var(--g-grad);box-shadow:inset 0 1px rgba(255,255,255,.06),0 10px 32px rgba(0,0,0,.55)}
.shell:before{content:'';position:absolute;inset:0 0 auto;height:2px;background:linear-gradient(90deg,transparent,var(--g-acc),transparent);opacity:.8}.top{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;margin-bottom:10px;border:1px solid color-mix(in srgb,var(--g-edge) 22%,transparent);border-top:2px solid color-mix(in srgb,var(--g-acc) 65%,transparent);border-radius:12px;background:var(--g-grad)}.brand{display:flex;align-items:center;gap:10px;color:var(--amber)}.brand ha-icon{--mdc-icon-size:21px}.brand strong{font:700 13px var(--g-font-t);letter-spacing:1px}.top-status{color:var(--ok);font:12px var(--g-font-m)}.top-status.bad{color:var(--err)}.grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:10px}.left,.right{display:flex;flex-direction:column;gap:10px}.panel{position:relative;overflow:hidden;padding:15px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:14px;background:var(--g-panel);box-shadow:inset 0 1px rgba(255,255,255,.04)}.section-title{display:flex;align-items:center;gap:8px;margin-bottom:11px;padding-bottom:6px;border-bottom:1px solid color-mix(in srgb,var(--g-edge) 24%,transparent);color:color-mix(in srgb,var(--g-acc) 90%,transparent);font:600 11px var(--g-font-t);letter-spacing:1.6px;text-transform:uppercase}.section-title:after{content:'';flex:1;height:1px;background:color-mix(in srgb,var(--g-edge) 18%,transparent)}.tracker-bar{display:flex;align-items:center;gap:9px;margin-bottom:8px;color:var(--amber);font:700 12px var(--g-font-t);letter-spacing:1px}.tracker-bar .coords{margin-left:auto;color:var(--ok);font:12px var(--g-font-m);letter-spacing:0}.map{position:relative;width:100%;height:260px;overflow:hidden;border-radius:11px;background:var(--g-deep)}.map-empty{height:100%;display:grid;place-items:center;text-align:center;padding:20px;color:var(--muted);font-size:13px}.tiles{position:absolute;inset:0}.vmap{position:absolute!important;inset:0}.zbtn{position:absolute;top:8px;right:8px;z-index:2;display:flex;flex-direction:column;gap:4px}.zbtn button{width:28px;height:28px;padding:0;border-radius:8px;border:1px solid color-mix(in srgb,var(--g-edge) 35%,transparent);background:color-mix(in srgb,var(--g-deep) 80%,transparent);color:var(--g-text);font:600 17px/1 var(--g-font);cursor:pointer}.zbtn button:hover{border-color:var(--g-acc);color:var(--g-acc2)}.zbtn button:focus-visible{outline:2px solid var(--g-acc);outline-offset:1px}.zbtn button.zc{font-size:15px}.free .zbtn button.zc{color:var(--g-acc2);border-color:var(--g-acc)}.tiles{cursor:grab}.drag .tiles{cursor:grabbing}.vmap .maplibregl-canvas-container{cursor:grab}.tiles img{position:absolute;width:256px;height:256px;max-width:none;user-select:none;pointer-events:none}.dot{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--dc,#22dd88);box-shadow:0 0 0 4px color-mix(in srgb,var(--dc,#22dd88) 25%,transparent),0 0 14px var(--dc,#22dd88)}.attr{position:absolute;right:6px;bottom:4px;font-size:9px;color:color-mix(in srgb,var(--g-muted) 60%,transparent);background:color-mix(in srgb,var(--g-deep) 60%,transparent);padding:1px 5px;border-radius:4px}.attr a{color:inherit;text-decoration:none}@keyframes gs-blink{0%,100%{opacity:1}50%{opacity:.35}}.panel.imminent{background:rgba(255,68,102,.08);border:2px solid rgba(255,68,102,.9);box-shadow:inset 0 0 4px rgba(255,68,102,.8),inset 0 0 10px rgba(255,68,102,.35)}.panel.imminent .launch-date{color:var(--err);animation:gs-blink 1s infinite}.statline{display:flex;justify-content:space-between;gap:10px;margin-top:9px;color:var(--muted);font-size:12px}.statline b{color:var(--g-text)}.good{color:var(--ok)!important}.bad{color:var(--err)!important}.warn{color:var(--amber)!important}.pass p{margin:4px 0;color:var(--muted);font-size:13px;line-height:1.45}.pass strong{color:var(--amber)}.pass+.pass{margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--g-edge) 15%,transparent)}.graph-now{color:var(--g-text);font:800 20px var(--g-font-t)}.graph-unit{margin-left:5px;color:var(--muted);font-size:11px}.graph{width:100%;height:55px;margin-top:6px}.launch-provider{color:var(--amber);font:700 11px var(--g-font-t);letter-spacing:1px;text-transform:uppercase}.launch-mission{margin-top:3px;color:var(--g-text);font-size:18px;font-weight:700}.launch-date{margin-top:8px;color:var(--amber);font:700 13px var(--g-font-t)}.launch-info{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.launch-stats{display:flex;flex-direction:column;gap:5px;margin:10px 0;padding:9px 0;border-top:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);border-bottom:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);font-size:13px}.launch-stats div{display:flex;justify-content:space-between;gap:8px}.launch-desc{color:var(--muted);font-size:11px;line-height:1.35}.transit-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.transit{padding:12px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:11px;background:rgba(255,255,255,.025)}.transit h4{display:flex;align-items:center;gap:7px;margin:0 0 9px;color:var(--amber);font:700 11px var(--g-font-t);letter-spacing:.7px}.transit.lunar h4{color:#8ab4ff}.transit-date{font:700 13px var(--g-font-t);line-height:1.35}.transit-count{display:inline-block;margin-top:7px;padding:3px 8px;border:1px solid color-mix(in srgb,var(--g-edge) 20%,transparent);border-radius:20px;color:var(--amber);font-size:11px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:10px}.metric{padding:7px 4px;text-align:center;border:1px solid color-mix(in srgb,var(--g-edge) 14%,transparent);border-radius:8px;background:rgba(255,255,255,.03)}.metric small{display:block;color:var(--muted);font-size:9px;text-transform:uppercase}.metric b{font:700 12px var(--g-font-t)}.empty{padding:12px;color:var(--muted);font-size:12px;text-align:center}.footer{position:relative;z-index:1;display:flex;justify-content:space-between;gap:10px;margin-top:9px;padding:2px 4px;color:color-mix(in srgb,var(--g-muted) 42%,transparent);font:10px var(--g-font-m);letter-spacing:.5px}/* selon la largeur de la carte, pas de l'écran : une carte dans une colonne étroite se met sur une colonne */@container (max-width:760px){.grid{grid-template-columns:1fr}.map{height:230px}}@container (max-width:420px){.top{align-items:flex-start;flex-direction:column}.tracker-bar{flex-wrap:wrap}.tracker-bar .coords{margin-left:0;flex-basis:100%}.transit-grid{grid-template-columns:1fr}.footer{flex-direction:column}}
`;

function _gsEsc(v){return (v??'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function _gsDate(v){const d=new Date(v);return isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})}
function _gsCountdown(v){return _issIn(new Date(v).getTime())}
const _gsDuration=_issDuration;

class GlossySpaceDashboardCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:'open'});this._ok=false;this._h=null;this._resize=null;this._history=null;this._historyAt=0}
 setConfig(c){c=c||{};this._config={theme:c.theme||'v2',demo:!!c.demo,title:c.title||'OPÉRATIONS SPATIALES',tracker:{...(c.tracker||{}),lat_entity:'',lon_entity:''},passes:{...(c.passes||{})},launch:{...(c.launch||{})},transits:{...(c.transits||{})}};this._fp=null;this._history=null;this._uz=null;this._follow=true;this._center=null;this._onZoom=()=>this._showZoom();if(this._ok){this._build();if(this._h)this.hass=this._h}}
 getCardSize(){return 8}
 static getConfigElement(){return document.createElement('glossy-space-dashboard-card-editor')}
 static getStubConfig(){return {title:'OPÉRATIONS SPATIALES',tracker:{entity:''},passes:{},launch:{entity:''},transits:{}}}
 set hass(h){this._h=h;if(!this._config)return;_issTheme(this,this._config.theme,h);const t=this._config.tracker||{};let cleaned=false;for(const key of ['lat_entity','lon_entity']){if(t[key]&&!h.states[t[key]]){t[key]='';cleaned=true}}if(cleaned)this._config={...this._config,tracker:{...t}};if(!this._ok)this._init();const ids=this._ids();const fp=ids.map(id=>{const s=h.states[id];return id+'|'+(s?.state||'x')+'|'+JSON.stringify(s?.attributes||{})}).join('||');if(fp===this._fp)return;this._fp=fp;this._update()}
 _ids(){const c=this._config||{};return [c.tracker.entity,c.tracker.status_entity,c.passes.visible_readable_entity,c.passes.visible_attrs_entity,c.passes.global_readable_entity,c.passes.global_attrs_entity,c.passes.distance_entity,c.launch.entity,c.launch.mission_entity,c.launch.date_entity,c.launch.probability_entity,c.launch.status_entity,c.transits.solar_entity,c.transits.lunar_entity].filter(Boolean)}
 _init(){this._ok=true;const sh=this.shadowRoot;sh.innerHTML=`<style>${_GS_CSS}</style><div class="shell"><div class="top"><div class="brand"><ha-icon icon="mdi:satellite-variant"></ha-icon><strong id="title"></strong></div><span class="top-status" id="top-status">SYSTÈME PRÊT</span></div><div class="grid"><div class="left"><div class="panel" id="tracker-panel"></div><div class="panel" id="passes-panel"></div></div><div class="right"><div class="panel" id="launch-panel"></div><div class="panel" id="transits-panel"></div></div></div><div class="footer"><span>TÉLÉMÉTRIE SPATIALE EN DIRECT</span><span>HOME ASSISTANT</span></div></div>`;this._w=sh.querySelector('.shell');this._build();if(!this._tick)this._startTick()}
 _build(){if(!this._w)return;this._w.querySelector('#title').textContent=this._config.title;const ts=this._w.querySelector('#top-status');if(ts)ts.textContent=this._config.demo?'MODE DÉMO · LIEU FICTIF':'SYSTÈME PRÊT';this._buildTracker();this._buildPasses();this._buildLaunch();this._buildTransits()}
 _buildTracker(){const c=this._config.tracker||{};const el=this._w.querySelector('#tracker-panel');el.innerHTML='<div class="tracker-bar"><ha-icon icon="mdi:satellite-variant"></ha-icon><span>SUIVI DE L’ISS</span><span class="coords" id="tracker-coords">—</span></div><div class="map" id="map"><div class="map-empty">Position en attente…</div></div><div class="statline"><span>ÉTAT</span><b id="tracker-status">—</b><span>ZOOM <b id="tracker-zoom">—</b></span></div>';this._pos=null}
 _buildPasses(){const c=this._config.passes||{};const el=this._w.querySelector('#passes-panel');const live=this._passLive();let html='<div class="section-title">PASSAGES ISS</div>'+(live?'<div class="empty" id="live-msg" hidden></div>':'');if(live||c.visible_readable_entity)html+='<div class="pass" id="pass-visible"></div>';if(live||c.global_readable_entity)html+='<div class="pass" id="pass-global"></div>';if(live||c.distance_entity)html+='<div class="pass" id="distance-box"><div><span class="graph-now" id="distance-now">—</span><span class="graph-unit">km</span></div><svg class="graph" id="distance-graph" viewBox="0 0 300 55" preserveAspectRatio="none"></svg></div>';el.innerHTML=html}
 _passLive(){const c=this._config.passes||{};return !c.visible_readable_entity&&!c.global_readable_entity&&!c.distance_entity}
 _buildLaunch(){const c=this._config.launch||{};const el=this._w.querySelector('#launch-panel');el.innerHTML='<div class="section-title">PROCHAIN LANCEMENT</div><div class="launch-provider" id="launch-provider">—</div><div class="launch-mission" id="launch-mission">—</div><div class="launch-date" id="launch-date">—</div><div class="launch-info" id="launch-info"></div><div class="launch-stats" id="launch-stats"></div><div class="launch-desc" id="launch-desc"></div>'}
 _transLive(){const c=this._config.transits||{};return !c.solar_entity&&!c.lunar_entity}
 _buildTransits(){const c=this._transLive()?{...(this._config.transits||{}),solar_entity:'iss.transit.solar',lunar_entity:'iss.transit.lunar'}:this._config.transits||{};const el=this._w.querySelector('#transits-panel');let html='<div class="section-title">TRANSITS ISS</div><div class="transit-grid">';for(const type of ['solar','lunar']){const id=c[type+'_entity'];if(!id)continue;html+=`<div class="transit ${type}" id="transit-${type}"><h4>${type==='solar'?'☀️':'🌙'} ${type==='solar'?'TRANSIT SOLAIRE':'TRANSIT LUNAIRE'}</h4><div id="transit-body-${type}"></div></div>`}html+='</div>';if(!c.solar_entity&&!c.lunar_entity)html+='<div class="empty">Aucune entité de transit configurée</div>';el.innerHTML=html}
 _update(){if(!this._h)return;this._updateTracker();this._updatePasses();this._updateLaunch();this._updateTransits()}
 _updateTracker(){const c=this._config.tracker||{},s=this._h.states,live=!c.entity?_issLive.position():null,main=c.entity?s[c.entity]:null,status=s[c.status_entity||c.entity],bad=c.entity?(!status||['unknown','unavailable'].includes(status.state)):!(live&&_issLive.fresh());if(!c.entity)_ISS.load();const lat0=live?live.lat:main?.attributes?.latitude,lon0=live?live.lon:main?.attributes?.longitude;const lat=Number(lat0),lon=Number(lon0),has=Number.isFinite(lat)&&Number.isFinite(lon)&&!(lat===0&&lon===0);const statusEl=this._w.querySelector('#tracker-status'),coordEl=this._w.querySelector('#tracker-coords');if(statusEl){statusEl.textContent=bad?'SIGNAL PERDU':'SIGNAL ACQUIS';statusEl.className=bad?'bad':'good'}if(coordEl)coordEl.textContent=has?_issCoords(lat,lon):'—';const zEl=this._w.querySelector('#tracker-zoom');if(zEl)zEl.textContent=String(Math.round(_issZ(this,c.zoom_span)));const map=this._w.querySelector('#map');if(!map||!has)return;const tile=_issTileUrl(c,_issLight(this)),kind=tile?'tiles':'vmap';this._pos={lat,lon,color:bad?'#ff4466':'#22dd88',tile};if(!map.querySelector('.'+kind)){if(kind==='tiles')_issDropVector(this);map.innerHTML=`<div class="${kind}"></div><div class="dot"></div>${_issZoomButtons}<div class="attr">${_issAttribution(c)}</div>`;_issBindZoom(this,map,()=>(this._config.tracker||{}).zoom_span,()=>{this._drawTiles();this._showZoom()});if(this._resize)this._resize.disconnect();this._resize=new ResizeObserver(()=>this._drawTiles());this._resize.observe(map)}this._drawTiles()}
 _showZoom(){const z=this._w&&this._w.querySelector('#tracker-zoom');if(z)z.textContent=String(Math.round(_issZ(this,(this._config.tracker||{}).zoom_span)))}
 _drawTiles(){const map=this._w&&this._w.querySelector('#map');if(map&&this._pos&&!this._pos.tile&&map.querySelector('.vmap')){map.querySelector('.dot')?.style.setProperty('--dc',this._pos.color);_issVector(this,map,this._pos.lat,this._pos.lon,_issZ(this,this._config.tracker.zoom_span),_issLight(this)).catch(e=>{_issDropVector(this);map.innerHTML=`<div class="map-empty">Carte indisponible : ${_gsEsc(e.message)}</div>`});return}if(!map||!this._pos)return;const p=this._pos,z=Math.round(Math.min(10,_issZ(this,this._config.tracker.zoom_span)));this._iss={lat:p.lat,lon:p.lon};this._rz=z;map.querySelector('.dot')?.style.setProperty('--dc',p.color);_issRaster(this,map,p.lat,p.lon,z,p.tile,()=>this._drawTiles())}
 _updatePasses(){const c=this._config.passes||{},s=this._h.states;if(this._passLive()){_ISS.load();const oh=_issObsHass(this._h,this._config.demo),msg=_issLive.problem(oh),m=this._w.querySelector('#live-msg');if(m){m.hidden=!msg;m.textContent=msg||''}const nx=msg?null:_issLive.next(oh,c.min_elevation!=null?Number(c.min_elevation):10,10,c.min_visible!=null?Number(c.min_visible):120),pv=this._w.querySelector('#pass-visible'),pg=this._w.querySelector('#pass-global');if(pv)pv.innerHTML=msg?'':_issLive.lines(nx&&nx.visible,_gsEsc);if(pg)pg.innerHTML=msg?'':_issLive.lines(nx&&nx.global,_gsEsc);const d=_issLive.distance(oh),dn=this._w.querySelector('#distance-now');if(dn)dn.textContent=d===null?'—':Math.round(d).toLocaleString('fr-FR');this._history=_issLive.history(oh,c.distance_hours||12);this._drawHistory();return}const render=(id,readId,attrId)=>{const el=this._w.querySelector('#'+id);if(!el)return;const read=s[readId],a=s[attrId]?.attributes||{};let h=`<p><strong>Début :</strong> ${_gsEsc(read?.state||'—')}</p>`;if(a.duration!=null)h+=`<p><strong>Durée :</strong> ${_issDur(a.duration)}</p>`;if(a.maxEl!=null)h+=`<p><strong>Hauteur max :</strong> ${_gsEsc(_issNum(a.maxEl,1))}°</p>`;const path=[a.startAzCompass,a.maxAzCompass,a.endAzCompass].filter(Boolean).join(' → ');if(path)h+=`<p><strong>Trajet :</strong> ${_gsEsc(_issCardFr(path))}</p>`;el.innerHTML=h};render('pass-visible',c.visible_readable_entity,c.visible_attrs_entity);render('pass-global',c.global_readable_entity,c.global_attrs_entity);const st=s[c.distance_entity],now=this._w.querySelector('#distance-now');if(now&&st){const n=parseFloat(st.state);now.textContent=Number.isFinite(n)?Math.round(n).toLocaleString('fr-FR'):'—'}if(c.distance_entity)this._loadHistory()}
 async _loadHistory(){const c=this._config.passes||{};if(!this._h?.connection||!c.distance_entity)return;if(Date.now()-this._historyAt<300000&&this._history)return;this._historyAt=Date.now();try{const start=new Date(Date.now()-(c.distance_hours||12)*3600000).toISOString();const r=await this._h.connection.sendMessagePromise({type:'history/history_during_period',start_time:start,entity_ids:[c.distance_entity],minimal_response:true,no_attributes:true});this._history=(r?.[c.distance_entity]||[]).map(x=>parseFloat(x.s??x.state)).filter(Number.isFinite);this._drawHistory()}catch(e){console.warn('[glossy-space-dashboard-card] history unavailable',e)}}
 _drawHistory(){const svg=this._w.querySelector('#distance-graph'),v=this._history;if(!svg||!v||v.length<2)return;const min=Math.min(...v),range=Math.max(...v)-min||1,W=300,H=55,p=v.map((n,i)=>`${(i/(v.length-1)*W).toFixed(1)},${(H-5-((n-min)/range)*(H-10)).toFixed(1)}`).join(' ');svg.innerHTML=`<polygon points="0,${H} ${p} ${W},${H}" style="fill:color-mix(in srgb,var(--g-acc) 15%,transparent)"/><polyline points="${p}" fill="none" stroke-width="2" style="stroke:var(--g-acc)"/>`}
 _updateLaunch(){const live=!(this._config.launch||{}).entity,vs=live?_issLaunch.states():null;if(live)_issLaunch.load();const c=live?{...(this._config.launch||{}),..._issLaunch.VCFG}:this._config.launch||{},s=vs?{...this._h.states,...vs}:this._h.states;if(live&&!vs){const m=this._w.querySelector('#launch-mission');if(m)m.textContent=_issLaunch.failed?'Prochain lancement indisponible (Launch Library 2)':'Chargement du prochain lancement…';return}const main=s[c.entity],mission=s[c.mission_entity],date=s[c.date_entity],proba=s[c.probability_entity],status=s[c.status_entity];const q=id=>this._w.querySelector('#'+id);if(q('launch-provider'))q('launch-provider').textContent=main?.attributes?.provider||'—';if(q('launch-mission'))q('launch-mission').textContent=mission?.state||main?.state||'—';if(q('launch-date'))q('launch-date').textContent=date?.state?_gsDate(date.state):'—';{const m=(new Date(date?.state).getTime()-Date.now())/60000;this._w.querySelector('#launch-panel')?.classList.toggle('imminent',Number.isFinite(m)&&m>0&&m<(c.imminent_minutes??15))}if(q('launch-info')){const a=main?.attributes||{};q('launch-info').innerHTML=a.pad?`📍 <b>${_gsEsc(a.pad)}</b>${a.facility?`<br><small>${_gsEsc(a.facility)}</small>`:''}`:''}if(q('launch-stats')){const a=mission?.attributes||{};q('launch-stats').innerHTML=`<div><b>Météo</b><span>${proba?.state&&!['unknown','unavailable'].includes(proba.state)?_gsEsc(proba.state)+'%':'Pas de données'}</span></div><div><b>Lanceur</b><span>${_gsEsc(a.rocket_name||'—')}</span></div><div><b>Orbite</b><span>${_gsEsc(_issFr.orbit(a.target_orbit)||'—')}</span></div>${c.status_entity?`<div class="${/go/i.test(status?.state||'')?'good':'warn'}"><b>Statut</b><b>${_gsEsc(_issFr.status(status?.state)||'—')}</b></div>`:''}`}if(q('launch-desc'))q('launch-desc').textContent=_issFr.text(mission?.attributes?.description);if(!this._offFr)this._offFr=_issFr.onChange(()=>this._h&&this._updateLaunch())}
 _updateTransits(){const live=this._transLive(),c=live?{solar_entity:'iss.transit.solar',lunar_entity:'iss.transit.lunar'}:this._config.transits||{},oh=_issObsHass(this._h,this._config.demo),vs=live?_issTransit.states(oh):null,s=vs?{...this._h.states,...vs}:this._h.states,msg=live?_issLive.problem(oh):null;for(const type of ['solar','lunar']){const body=this._w.querySelector('#transit-body-'+type),st=s[c[type+'_entity']];if(body&&msg){body.innerHTML=`<div class="empty">${_gsEsc(msg)}</div>`;continue}if(!body||!st)continue;const a=st.attributes||{},date=a.date;if(!date){body.innerHTML=`<div class="empty">Aucun transit prévu ${live?'dans les 14 prochains jours':"dans l'année"}.${a.closest_approach_deg!=null?`<br>Approche la plus proche : <b>${_issNum(a.closest_approach_deg,1)}°</b>`:''}</div>`;continue}body.innerHTML=`<div class="transit-date">${_gsEsc(_gsDate(date))}</div><span class="transit-count">${_gsEsc(_gsCountdown(date))}</span><div class="metrics"><div class="metric"><small>Durée</small><b>${_gsDuration(a.duration_seconds)}</b></div><div class="metric"><small>Hauteur</small><b>${a.max_elevation_deg!=null?_issNum(a.max_elevation_deg,1)+'°':'—'}</b></div>${type==='lunar'?`<div class="metric" style="grid-column:1/-1"><small>Distance ISS</small><b>${a.iss_distance_km!=null?Math.round(a.iss_distance_km).toLocaleString('fr-FR')+' km':'—'}</b></div>`:''}</div>`}}
 _startTick(){if(this._tick)return;let n=0;this._tick=setInterval(()=>{if(!this._h)return;if(!(this._config.tracker||{}).entity)this._updateTracker();if(++n%6===0){this._updateLaunch();if(this._passLive())this._updatePasses();if(this._transLive())this._updateTransits()}},5000);const a=_ISS.onLoad(()=>this._h&&this._update()),b=_issLaunch.onLoad(()=>this._h&&this._updateLaunch());this._offLoad=()=>{a();b()}}
 connectedCallback(){if(this._ok&&!this._tick)this._startTick()}
 disconnectedCallback(){_issDropVector(this);const mv=this._w&&this._w.querySelector('#map .vmap');if(mv)mv.parentElement.innerHTML='';if(this._resize){this._resize.disconnect();this._resize=null}clearInterval(this._tick);this._tick=null;if(this._offLoad){this._offLoad();this._offLoad=null}}
}
define('glossy-space-dashboard-card', GlossySpaceDashboardCard);

class GlossySpaceDashboardCardEditor extends HTMLElement{
 setConfig(config){const c=config||{};this._config={type:'custom:glossy-space-dashboard-card',theme:c.theme||'v2',...(c.demo?{demo:true}:{}),title:c.title||'OPÉRATIONS SPATIALES',tracker:{...(c.tracker||{}),lat_entity:'',lon_entity:''},passes:{...(c.passes||{})},launch:{...(c.launch||{})},transits:{...(c.transits||{})}};if(this._hass&&!this._built)this._render()}
 set hass(hass){this._hass=hass;if(!this._built)this._render();else this._syncPickers()}
 connectedCallback(){if(this._config)this._render()}
 _emit(){this._config={...this._config,type:'custom:glossy-space-dashboard-card'};this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true}))}
 _esc(v){return (v??'').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
 _render(){if(!this._config||!this._hass)return;if(!this.shadowRoot)this.attachShadow({mode:'open'});const c=this._config,t=c.tracker||{},p=c.passes||{},l=c.launch||{},x=c.transits||{};this.shadowRoot.innerHTML=`<style>
  .wrap{padding:4px 0;font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}.group{margin:16px 0 20px;padding:12px;border:1px solid var(--divider-color,#555);border-radius:10px}.group h3{margin:0 0 12px;font-size:13px;color:var(--primary-text-color,#eee)}.field{margin:0 0 11px}.field:last-child{margin-bottom:0}label{display:block;margin:0 0 4px;font-size:12px;color:var(--secondary-text-color,#999)}input{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--divider-color,#555);border-radius:6px;background:var(--card-background-color,#1c1c1c);color:var(--primary-text-color,#eee)}.hint{font-size:11px;line-height:1.4;color:var(--secondary-text-color,#888);margin-top:-4px;margin-bottom:12px}
 </style><div class="wrap">${_issThemeField(c.theme)}${_issDemoField(c.demo)}<div class="field"><label>Titre du tableau de bord</label><input id="title" value="${this._esc(c.title)}"></div>
 <div class="group"><h3>Suivi de l’ISS</h3><div class="field"><label>Entité position (latitude / longitude) — vide : position calculée</label><ha-entity-picker id="tracker.entity"></ha-entity-picker></div><div class="field"><label>Entité statut</label><ha-entity-picker id="tracker.status_entity"></ha-entity-picker></div><div class="field"><label>Largeur de vue carte (degrés)</label><input id="tracker.zoom_span" type="number" value="${this._esc(t.zoom_span??40)}"></div><div class="field"><label>Clé Stadia Maps (facultative)</label><input id="tracker.stadia_api_key" type="text" value="${this._esc(t.stadia_api_key||'')}"></div><div class="field"><label>Clé CARTO (facultative)</label><input id="tracker.carto_api_key" type="text" value="${this._esc(t.carto_api_key||'')}"></div><div class="hint">Sans clé : fond vectoriel OpenFreeMap. Clé Stadia Maps ou CARTO facultative.</div></div>
 <div class="group"><h3>Passages ISS</h3><div class="hint">Toutes les entités vides : passages et distance calculés par la carte, depuis la position de Home Assistant.</div><div class="field"><label>Passage visible — texte</label><ha-entity-picker id="passes.visible_readable_entity"></ha-entity-picker></div><div class="field"><label>Passage visible — attributs</label><ha-entity-picker id="passes.visible_attrs_entity"></ha-entity-picker></div><div class="field"><label>Passage global — texte</label><ha-entity-picker id="passes.global_readable_entity"></ha-entity-picker></div><div class="field"><label>Passage global — attributs</label><ha-entity-picker id="passes.global_attrs_entity"></ha-entity-picker></div><div class="field"><label>Distance ISS</label><ha-entity-picker id="passes.distance_entity"></ha-entity-picker></div><div class="field"><label>Historique distance (heures)</label><input id="passes.distance_hours" type="number" value="${this._esc(p.distance_hours??12)}"></div></div>
 <div class="group"><h3>Prochain lancement</h3><div class="field"><label>Entité principale — vide : Launch Library 2</label><ha-entity-picker id="launch.entity"></ha-entity-picker></div><div class="field"><label>Mission</label><ha-entity-picker id="launch.mission_entity"></ha-entity-picker></div><div class="field"><label>Date de lancement</label><ha-entity-picker id="launch.date_entity"></ha-entity-picker></div><div class="field"><label>Probabilité météo</label><ha-entity-picker id="launch.probability_entity"></ha-entity-picker></div><div class="field"><label>Statut du lancement</label><ha-entity-picker id="launch.status_entity"></ha-entity-picker></div><div class="field"><label>Seuil imminent (minutes)</label><input id="launch.imminent_minutes" type="number" value="${this._esc(l.imminent_minutes??15)}"></div></div>
 <div class="group"><h3>Transits ISS</h3><div class="field"><label>Transit solaire</label><ha-entity-picker id="transits.solar_entity"></ha-entity-picker></div><div class="field"><label>Transit lunaire</label><ha-entity-picker id="transits.lunar_entity"></ha-entity-picker></div></div></div>`;
 const paths=['tracker.entity','tracker.status_entity','passes.visible_readable_entity','passes.visible_attrs_entity','passes.global_readable_entity','passes.global_attrs_entity','passes.distance_entity','launch.entity','launch.mission_entity','launch.date_entity','launch.probability_entity','launch.status_entity','transits.solar_entity','transits.lunar_entity'];
 const get=(path)=>path.split('.').reduce((o,k)=>o?.[k],this._config)||'';const set=(path,value)=>{const [section,key]=path.split('.');this._config={...this._config,[section]:{...(this._config[section]||{}),[key]:value}};this._emit()};
 paths.forEach(path=>{const picker=this.shadowRoot.getElementById(path);if(!picker)return;picker.hass=this._hass;picker.includeDomains=['sensor'];picker.value=get(path);picker.addEventListener('value-changed',e=>{e.stopPropagation();set(path,e.detail.value)})});
 const bind=(id,path,number=false)=>{const el=this.shadowRoot.getElementById(id);if(!el)return;el.addEventListener('input',e=>{const value=number?(parseFloat(e.target.value)||0):e.target.value;if(path==='title')this._config={...this._config,title:value};else{const [section,key]=path.split('.');this._config={...this._config,[section]:{...(this._config[section]||{}),[key]:value}}}this._emit()})};bind('title','title');bind('tracker.zoom_span','tracker.zoom_span',true);bind('tracker.stadia_api_key','tracker.stadia_api_key');bind('tracker.carto_api_key','tracker.carto_api_key');bind('passes.distance_hours','passes.distance_hours',true);bind('launch.imminent_minutes','launch.imminent_minutes',true);_issBindTheme(this);_issBindDemo(this);this._built=true
 }
 _syncPickers(){if(!this.shadowRoot)return;this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p=>{p.hass=this._hass})}
}
define('glossy-space-dashboard-card-editor', GlossySpaceDashboardCardEditor);

window.customCards = window.customCards || [];
for (const card of [
  { type: 'glossy-iss-tracker-card', name: "Suivi de l'ISS", description: "Position de l'ISS en direct sur une mini-carte" },
  { type: 'glossy-iss-passes-card', name: 'Passages ISS', description: 'Prochains passages ISS (visible et global) et graphique de la distance' },
  { type: 'glossy-iss-transit-card', name: 'Transits ISS', description: 'Prochains transits de l\'ISS devant le Soleil et la Lune' },
  { type: 'glossy-space-dashboard-card', name: 'Opérations spatiales', description: 'Tableau de bord complet : ISS, passages, lancement et transits' },
  { type: 'glossy-launch-card', name: 'Prochain lancement', description: 'Prochain lancement (Next Launch) : mission, compte à rebours, pas de tir, météo, statut' },
]) if (!window.customCards.some((c) => c.type === card.type)) window.customCards.push({ ...card, preview: true });

console.info(
  `%c CARTES ISS %c ${CARD_VERSION} `,
  'background:#1d93e3;color:#fff;font-weight:bold;',
  'background:#1a2434;color:#7cc4ff;'
);
