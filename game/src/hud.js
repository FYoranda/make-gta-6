// Solmar Bay — HUD: cash, health, wanted stars, speed, minimap, toasts.
// One clear job: everything the player reads while playing.
export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cashEl = this.el('cash');
    this.objectiveEl = this.el('objective');
    this.starsEl = this.el('stars');
    this.toastEl = this.el('toast');
    this.healthFill = this.el('health-fill');
    this.weaponEl = this.el('weapon-name');
    this.ammoEl = this.el('ammo-count');
    this.speedEl = this.el('speed');
    this.carHealthEl = this.el('car-health');
    this.crosshair = this.el('crosshair');
    this.interactEl = this.el('interact');
    this.damageEl = this.el('damage');
    this.wantedFlashEl = this.el('wanted-flash');
    this.map = this.el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = null;
    this.damageOpacity = 0;
  }

  setCash(n) { this.cashEl.textContent = `$${Math.floor(n).toLocaleString('en-US')}`; }
  setHealth(v) { this.healthFill.style.width = `${Math.max(0, Math.min(100, v))}%`; }
  setWanted(n) {
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < n ? 'on' : 'off'}">★</span>`;
    this.starsEl.innerHTML = html;
  }
  setSpeed(kmh, driving) {
    this.speedEl.innerHTML = driving ? `${Math.round(kmh)} <small>km/h</small>` : '';
  }
  setCarHealth(h) {
    this.carHealthEl.textContent = h === null ? '' : `CAR ${Math.max(0, Math.round(h))}%`;
  }
  setWeapon(name, ammo, mag) {
    this.weaponEl.textContent = name;
    this.ammoEl.textContent = `${ammo} / ${mag === Infinity ? '∞' : mag}`;
  }
  setObjective(html) { this.objectiveEl.innerHTML = html; }
  setCrosshair(on) { this.crosshair.classList.toggle('hidden', !on); }
  showInteract(text) {
    if (text) { this.interactEl.innerHTML = text; this.interactEl.classList.remove('hidden'); }
    else this.interactEl.classList.add('hidden');
  }
  toast(text, ms) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms || 2600);
  }
  damageFlash() { this.damageOpacity = 1; }
  setWantedFlash(on, time) {
    this.wantedFlashEl.style.opacity = on ? String(0.25 + 0.2 * Math.sin(time * 6)) : '0';
  }

  /** Per-frame: fade the damage vignette. */
  tick(dt) {
    if (this.damageOpacity > 0) {
      this.damageOpacity = Math.max(0, this.damageOpacity - dt * 1.4);
      this.damageEl.style.opacity = String(this.damageOpacity);
    }
  }

  /** Draw the circular minimap. view: {x, z, yaw, buildings, roadLines, marker, gates, police, traffic, peds}. */
  drawMinimap(view) {
    const ctx = this.mapCtx;
    const S = 200, half = 240, k = S / (half * 2);
    const toX = (x) => S / 2 + x * k;
    const toY = (z) => S / 2 + z * k;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#16233d'; ctx.fillRect(0, 0, S, S);
    // water + beach (south edge)
    ctx.fillStyle = '#1e6f8e'; ctx.fillRect(0, toY(292), S, S - toY(292));
    ctx.fillStyle = '#e0c188'; ctx.fillRect(0, toY(222), S, toY(292) - toY(222));
    // roads
    ctx.strokeStyle = '#3d4456'; ctx.lineWidth = 5;
    for (const line of view.roadLines) {
      ctx.beginPath(); ctx.moveTo(toX(line), 0); ctx.lineTo(toX(line), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toY(line)); ctx.lineTo(S, toY(line)); ctx.stroke();
    }
    // buildings
    ctx.fillStyle = '#0d1526';
    for (const b of view.buildings) {
      ctx.fillRect(toX(b.minX), toY(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    }
    // mission gates
    if (view.gates) {
      ctx.fillStyle = '#ff9f1c';
      for (const g of view.gates) {
        ctx.beginPath(); ctx.arc(toX(g.x), toY(g.z), 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // mission marker (pulsing)
    if (view.marker) {
      const r = 5 + 2 * Math.sin(performance.now() / 200);
      ctx.fillStyle = '#ffcf3f';
      ctx.beginPath(); ctx.arc(toX(view.marker.x), toY(view.marker.z), r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(toX(view.marker.x), toY(view.marker.z), r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    // peds, traffic, police
    ctx.fillStyle = '#cfd6ff';
    for (const p of view.peds) { ctx.fillRect(toX(p.x) - 1, toY(p.z) - 1, 2, 2); }
    ctx.fillStyle = '#ffffff';
    for (const c of view.traffic) { ctx.fillRect(toX(c.x) - 1.5, toY(c.z) - 1.5, 3, 3); }
    for (const p of view.police) {
      ctx.fillStyle = Math.sin(performance.now() / 150) > 0 ? '#ff2020' : '#2050ff';
      ctx.beginPath(); ctx.arc(toX(p.x), toY(p.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow: forward (sin yaw, cos yaw); map up is north (-z)
    ctx.save();
    ctx.translate(toX(view.x), toY(view.z));
    ctx.rotate(Math.PI - view.yaw);
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
}
