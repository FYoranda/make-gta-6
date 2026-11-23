// Solmar Bay — small math helpers and procedural canvas textures.
// One clear job: deterministic randomness and every texture the city wears.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Make a canvas texture from a draw callback. Repeat-wrapped by default. */
export function makeTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

/** Building facade: coloured wall, lit and dark windows, roofline shadow. */
export function facadeTexture(base, litRatio, floors, cols, rng) {
  return makeTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle grime
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 8, 2 + rng() * 8);
    }
    const cw = w / cols, ch = h / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        const x = c * cw + cw * 0.18, y = f * ch + ch * 0.2;
        const ww = cw * 0.64, hh = ch * 0.6;
        if (lit) {
          const warm = rng() < 0.7;
          g.fillStyle = warm ? '#ffd98a' : '#bfe8ff';
          g.fillRect(x, y, ww, hh);
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(x, y, ww, hh * 0.3);
        } else {
          g.fillStyle = 'rgba(8,10,26,0.85)';
          g.fillRect(x, y, ww, hh);
        }
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.strokeRect(x, y, ww, hh);
      }
    }
    // neon strip near the top
    if (rng() < 0.5) {
      const neon = ['#ff2e63', '#08d9d6', '#f9ed69', '#ff9f1c'][Math.floor(rng() * 4)];
      g.fillStyle = neon; g.fillRect(0, h * 0.06, w, 5);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, h * 0.06, w, 2);
    }
  });
}

/** Asphalt with centre dashes and edge lines (dashes run along the road). */
export function roadTexture() {
  return makeTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#3a3a46'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#e8c33a'; g.fillRect(8, h / 2 - 2, 40, 4);
    g.fillStyle = '#e8c33a'; g.fillRect(72, h / 2 - 2, 40, 4);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 4, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, h - 6, w, 2);
  }, [1, 1]);
}

/** Sidewalk paving slabs. */
export function sidewalkTexture() {
  return makeTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#8d8d96'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  }, [4, 4]);
}

/** Sand with speckles. */
export function sandTexture() {
  return makeTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e0c188'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(120,90,40,${0.05 + Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }, [8, 2]);
}

/** Neon sign board with text, for shop fronts. */
export function signTexture(text, color, bg) {
  return makeTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = color; g.font = 'bold 34px Verdana, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 14;
    g.fillText(text, w / 2, h / 2 + 1);
  });
}
