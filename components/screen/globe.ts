import { WHEEL_DEF } from '@/components/wheel/config';
import { glassGlsl } from '@/components/wheel/crt';
import { at as withBase } from '@/lib/routes';

/* The kit's glass globes: one canvas over the page draws every [data-globe] element as the wheel's glass globe, with
   its city as a light (data-lat, data-lon in degrees). Sizes: the hub, the lens (64px) and the dot (24px) are just
   the element's size. The light does not breathe here, so the canvas draws only when the page scrolls, resizes or
   changes: one moving thing per page, and on our pages that is the now line. Up to eight globes; without WebGL the
   elements stay as they are.
   A [data-half] element is the top of its globe: the globe is as wide as the element, its top on the element's top,
   and nothing is drawn below the element's bottom edge (a globe rising from a horizon; a square element shows it whole). While the canvas
   draws, <html> carries data-globes, so CSS can fall back when there is no WebGL. */

const MAX = 8;
const FRAG = `
  precision highp float;
  uniform sampler2D uLand;
  uniform vec2 uHub; uniform float uRadius;
  uniform vec4 uG[${MAX}]; uniform vec3 uC[${MAX}]; uniform float uK[${MAX}]; uniform float uT[${MAX}]; uniform int uN;
  varying vec2 vUv;
  uniform vec2 uResolution;
  vec4 picture(vec2 px) { return vec4(0.); }
  ${glassGlsl(WHEEL_DEF)}
  void main() {
    vec2 px = vUv * uResolution;
    vec4 o = vec4(0.);
    for (int i = 0; i < ${MAX}; i++) {
      if (i >= uN) break;
      if (px.y < uK[i]) continue;
      gYaw = uC[i].z; gCity = uC[i].xy; gGlow = uG[i].w; gTilt = uT[i];
      vec4 g = globe(px, uG[i].xy, uG[i].z, false);
      o = o * (1. - g.a) + g;
    }
    gl_FragColor = o;
  }
`;
const VERT = `attribute vec2 aPosition; varying vec2 vUv; void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }`;
const rad = (d: number) => (d * Math.PI) / 180;

/* the lean (radians, about the screen's horizontal axis) that lifts a city to 28° above a half globe's horizon on
   the near side; 0 when it is already that high. The axis, side and front are the shader's own (crt.ts). */
const norm = (v: number[]) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const AXIS = norm([-0.22, 0.92, 0.32]), SIDE = norm([AXIS[1], -AXIS[0], 0]), FRONT = [SIDE[1] * AXIS[2] - SIDE[2] * AXIS[1], SIDE[2] * AXIS[0] - SIDE[0] * AXIS[2], SIDE[0] * AXIS[1] - SIDE[1] * AXIS[0]];
export function leanFor(lat: number, turn: number): number {
  const p = [0, 1, 2].map((k) => Math.cos(lat) * (Math.sin(turn) * SIDE[k] + Math.cos(turn) * FRONT[k]) + Math.sin(lat) * AXIS[k]);
  const want = Math.sin(rad(28)); if (p[1] >= want) return 0;
  const R = Math.hypot(p[1], p[2]); if (R < want) return 0;
  /* after the lean y = R cos(t + phi), z = R sin(t + phi): two answers, keep the one that faces the viewer */
  const phi = Math.atan2(p[2], p[1]), a = Math.acos(want / R);
  const ts = [a - phi, -a - phi].map((t) => Math.atan2(Math.sin(t), Math.cos(t))).filter((t) => p[1] * Math.sin(t) + p[2] * Math.cos(t) > 0);
  return ts.sort((x, y) => Math.abs(x) - Math.abs(y))[0] ?? 0;
}

export function mountGlobes(doc: Document, face = WHEEL_DEF.face): () => void {
  const win = doc.defaultView; if (!win) return () => {};
  const canvas = doc.createElement('canvas'); canvas.className = 'sk-globes'; canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return () => {};
  const prog = gl.createProgram()!;
  for (const [t, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
    const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return () => {}; }
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, 'aPosition'); gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  const at = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform1i(at('uLand'), 0);
  doc.body.appendChild(canvas); doc.documentElement.setAttribute('data-globes', '');

  /* the last frame's inputs: a change elsewhere on the page that moves no globe draws nothing */
  let raf = 0, was = '', force = true;
  const draw = () => {
    raf = 0;
    const ratio = Math.min(win.devicePixelRatio || 1, 2), w = win.innerWidth, h = win.innerHeight;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
    const els = Array.from(doc.querySelectorAll<HTMLElement>('[data-globe]')).slice(0, MAX);
    const G = new Float32Array(MAX * 4), C = new Float32Array(MAX * 3), K = new Float32Array(MAX).fill(-1), T = new Float32Array(MAX); let n = 0;
    els.forEach((e) => {
      const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > h || r.width === 0) return;
      const lat = Number(e.dataset.lat) || 0, lon = Number(e.dataset.lon) || 0, half = e.dataset.half !== undefined;
      const cy = r.top + (half ? r.width : r.height) / 2;
      G.set([(r.left + r.width / 2) * ratio, canvas.height - cy * ratio, (r.width / 2) * ratio, e.dataset.glow === '0' ? 0 : 1], n * 4);
      /* a half globe shows only its top: a city low on it leans the globe until the city is above the horizon */
      if (half) { K[n] = canvas.height - r.bottom * ratio; T[n] = leanFor(rad(lat), face); }
      C.set([rad(lat), rad(lon), face - rad(lon)], n * 3); n++;
    });
    const key = canvas.width + 'x' + canvas.height + ':' + n + ':' + Array.from(G.subarray(0, n * 4)).map(Math.round).join() + ':' + Array.from(C.subarray(0, n * 3)).map((v) => v.toFixed(4)).join() + ':' + Array.from(K.subarray(0, n)).map(Math.round).join() + ':' + Array.from(T.subarray(0, n)).map((v) => v.toFixed(3)).join();
    if (key === was && !force) return;
    was = key; force = false;
    gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!n) return;
    /* only the globes' own box is shaded, with a little room for the glass's edge light */
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const r = G[i * 4 + 2] * 1.12; x0 = Math.min(x0, G[i * 4] - r); x1 = Math.max(x1, G[i * 4] + r); y0 = Math.min(y0, Math.max(G[i * 4 + 1] - r, K[i])); y1 = Math.max(y1, G[i * 4 + 1] + r); }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(canvas.width, Math.ceil(x1)); y1 = Math.min(canvas.height, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1 - x0, y1 - y0);
    gl.uniform2f(at('uResolution'), canvas.width, canvas.height); gl.uniform1i(at('uN'), n);
    gl.uniform4fv(at('uG'), G); gl.uniform3fv(at('uC'), C); gl.uniform1fv(at('uK'), K); gl.uniform1fv(at('uT'), T);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const ask = () => { if (!raf) raf = win.requestAnimationFrame(draw); };
  const img = new win.Image(); img.onload = () => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); force = true; ask(); }; img.src = withBase('/wheel/land.png');
  win.addEventListener('scroll', ask, { passive: true, capture: true }); win.addEventListener('resize', ask);
  const mo = new MutationObserver(ask); mo.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-globe', 'data-lat', 'data-lon', 'data-half', 'style', 'class'] });
  ask();
  return () => { win.cancelAnimationFrame(raf); win.removeEventListener('scroll', ask, { capture: true }); win.removeEventListener('resize', ask); mo.disconnect(); canvas.remove(); doc.documentElement.removeAttribute('data-globes'); };
}
