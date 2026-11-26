/* The beam: one WebGL2 context for every tube on the page. Each tube hands it a list of beam pieces (pen.ts); it
   works out the beam's light along each piece (a Gaussian spot swept along the line, as woscope does it: the light at a
   point is the spot's light summed over the line, so joints are exact, short lines are brighter and light adds where
   lines cross), adds every piece into a high-range buffer, maps that to the screen once, and copies the picture into
   the tube's own canvas. A tube never opens a context of its own.

   The buffer: RGBA16F, renderable with EXT_color_buffer_float (WebGL2; MDN, checked 2026-11-17), or with
   EXT_color_buffer_half_float where only that is offered. Blending into a 16-bit float buffer needs no more;
   EXT_float_blend is only for 32-bit buffers. Without either, an 8-bit buffer: light then clips (the glow goes flat),
   and the lab says so. Without WebGL2 at all, tubes use the canvas pen. */

import { REC } from './pen';
import { glassGlsl } from '@/components/wheel/crt';
import { WHEEL_DEF } from '@/components/wheel/config';
import { at } from '@/lib/routes';

export type BeamLook = { sigma: number; halo: number; haloW: number; expo: number; hot: number };
export type BeamStats = { contexts: number; format: string; lost: number };

const VS_LINE = `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;
layout(location=1) in vec4 seg;
layout(location=2) in vec4 col;
layout(location=3) in vec4 ex;
uniform vec2 view;
uniform float sigmaH;
out vec2 vLocal; out float vLen; out vec4 vCol; out vec3 vEx;
void main() {
  vec2 a = seg.xy, b = seg.zw, d = b - a; float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  float s = max(ex.w, 0.3), R = 3.2 * sigmaH * s;
  float t = corner.x < 0.0 ? -R : L + R, n = corner.y * R;
  vec2 p = a + dir * t + nrm * n;
  vLocal = vec2(t, n) / s; vLen = L / s; vCol = col; vEx = ex.xyz;
  gl_Position = vec4(p.x / view.x * 2.0 - 1.0, 1.0 - p.y / view.y * 2.0, 0.0, 1.0);
}`;
const FS_LINE = `#version 300 es
precision highp float;
in vec2 vLocal; in float vLen; in vec4 vCol; in vec3 vEx;
uniform float sigma, sigmaH, haloW;
out vec4 o;
float erf1(float x) { float a = 0.147, x2 = x * x; float r = sqrt(1.0 - exp(-x2 * (1.27323954 + a * x2) / (1.0 + a * x2))); return x < 0.0 ? -r : r; }
float line(float t, float d, float L, float s) { float k = 0.70710678 / s; return exp(-d * d / (2.0 * s * s)) * 0.5 * (erf1(t * k) - erf1((t - L) * k)); }
float spot(float r2, float s) { return exp(-r2 / (2.0 * s * s)); }
void main() {
  float t = vLocal.x, d = vLocal.y, L = vLen, h = haloW * vEx.z;
  float I = vCol.w * (line(t, d, L, sigma) + h * line(t, d, L, sigmaH));
  float r0 = t * t + d * d, r1 = (t - L) * (t - L) + d * d;
  I += vEx.x * (spot(r0, sigma) + h * spot(r0, sigmaH)) + vEx.y * (spot(r1, sigma) + h * spot(r1, sigmaH));
  o = vec4(vCol.rgb * I, 1.0);
}`;
const VS_FILL = `#version 300 es
precision highp float;
layout(location=0) in vec2 pos;
layout(location=1) in vec3 col;
uniform vec2 view;
out vec3 vCol;
void main() { vCol = col; gl_Position = vec4(pos.x / view.x * 2.0 - 1.0, 1.0 - pos.y / view.y * 2.0, 0.0, 1.0); }`;
const FS_FILL = `#version 300 es
precision highp float;
in vec3 vCol; out vec4 o;
void main() { o = vec4(vCol, 1.0); }`;
const VS_TONE = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;
/* light to screen: 1 - e^-x keeps every level apart (nothing clips to a flat white); a very hot core spills into the
   other channels, so it goes white the way a phosphor does */
const FS_TONE = `#version 300 es
precision highp float;
uniform sampler2D tex; uniform vec2 size; uniform float expo, hot;
out vec4 o;
void main() {
  vec3 h = texture(tex, gl_FragCoord.xy / size).rgb * expo;
  vec3 c = 1.0 - exp(-h);
  float m = max(max(h.r, h.g), h.b);
  c = mix(c, vec3(1.0 - exp(-m)), clamp((m - 1.0) * hot, 0.0, 1.0) * 0.6);
  float a = max(max(c.r, c.g), c.b);
  o = vec4(c, a);
}`;

type GL = WebGL2RenderingContext;
type State = {
  gl: GL; cv: HTMLCanvasElement; format: string;
  line: WebGLProgram; fill: WebGLProgram; tone: WebGLProgram;
  vaoLine: WebGLVertexArrayObject; vaoFill: WebGLVertexArrayObject; vaoTone: WebGLVertexArrayObject;
  inst: WebGLBuffer; tri: WebGLBuffer; instCap: number; triCap: number;
  fbo: WebGLFramebuffer; tex: WebGLTexture; tw: number; th: number; internal: number; type: number;
  u: Record<string, WebGLUniformLocation | null>;
};
let S: State | null | undefined;
/* after a lost context, wait before trying again, so a GPU that is still down is not asked every frame */
let retryAt = 0;
function state(): State | null { if (S === undefined || (S === null && retryAt && performance.now() > retryAt)) { S = init(); retryAt = S ? 0 : performance.now() + 2000; } return S ?? null; }
const stats: BeamStats = { contexts: 0, format: 'none', lost: 0 };
export const beamStats = (): BeamStats => ({ ...stats });

function prog(gl: GL, vs: string, fs: string): WebGLProgram {
  const mk = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
  const p = gl.createProgram()!; gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}

function init(): State | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 2; cv.height = 2;
  const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  try {
    let internal: number = gl.RGBA8, type: number = gl.UNSIGNED_BYTE, format = 'RGBA8 (no float buffer: light clips)';
    if (gl.getExtension('EXT_color_buffer_float')) { internal = gl.RGBA16F; type = gl.HALF_FLOAT; format = 'RGBA16F (EXT_color_buffer_float)'; }
    else if (gl.getExtension('EXT_color_buffer_half_float')) { internal = gl.RGBA16F; type = gl.HALF_FLOAT; format = 'RGBA16F (EXT_color_buffer_half_float)'; }
    const line = prog(gl, VS_LINE, FS_LINE), fill = prog(gl, VS_FILL, FS_FILL), tone = prog(gl, VS_TONE, FS_TONE);
    const u: State['u'] = {};
    for (const [p, names, pre] of [[line, ['view', 'sigma', 'sigmaH', 'haloW'], 'l.'], [fill, ['view'], 'f.'], [tone, ['tex', 'size', 'expo', 'hot'], 't.']] as const)
      for (const n of names) u[pre + n] = gl.getUniformLocation(p, n);
    /* the quad's four corners, then the per-piece records */
    const vaoLine = gl.createVertexArray()!; gl.bindVertexArray(vaoLine);
    const quad = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const inst = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, REC * 4, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
    const vaoFill = gl.createVertexArray()!; gl.bindVertexArray(vaoFill);
    const tri = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
    const vaoTone = gl.createVertexArray()!;
    gl.bindVertexArray(null);
    const tex = gl.createTexture()!, fbo = gl.createFramebuffer()!;
    const st: State = { gl, cv, format, line, fill, tone, vaoLine, vaoFill, vaoTone, inst, tri, instCap: 0, triCap: 0, fbo, tex, tw: 0, th: 0, internal, type, u };
    if (!sizeTo(st, 64, 36)) {
      /* the float buffer would not attach: fall back to 8 bits */
      st.internal = gl.RGBA8; st.type = gl.UNSIGNED_BYTE; st.format = 'RGBA8 (float buffer incomplete: light clips)'; st.tw = 0;
      if (!sizeTo(st, 64, 36)) return null;
    }
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S = null; G = undefined; retryAt = performance.now() + 2000; stats.contexts = 0; stats.lost++; });
    stats.contexts = 1; stats.format = st.format;
    return st;
  } catch { return null; }
}

function sizeTo(st: State, w: number, h: number): boolean {
  const { gl } = st;
  if (w > st.cv.width || h > st.cv.height) { st.cv.width = Math.max(st.cv.width, w); st.cv.height = Math.max(st.cv.height, h); }
  if (w <= st.tw && h <= st.th) return true;
  const tw = Math.max(w, st.tw), th = Math.max(h, st.th);
  gl.bindTexture(gl.TEXTURE_2D, st.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, st.internal, tw, th, 0, gl.RGBA, st.type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, st.tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (ok) { st.tw = tw; st.th = th; }
  return ok;
}

/** is the beam available on this page (creates the one context the first time) */
export function beamReady(): boolean { return !!state(); }

/* Draw one tube's frame. segs and tris are in the drawing's view space (vw x vh); the target canvas is w x h pixels. */
export function drawBeam(target: CanvasRenderingContext2D, segs: Float32Array, tris: Float32Array, look: BeamLook, vw: number, vh: number): boolean {
  const st = state(); if (!st) return false;
  const { gl } = st, w = target.canvas.width, h = target.canvas.height;
  if (!sizeTo(st, w, h)) return false;
  const scale = w / vw;
  /* 1: the beam's light, added up, into the high-range buffer */
  gl.bindFramebuffer(gl.FRAMEBUFFER, st.fbo); gl.viewport(0, 0, w, h);
  gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
  const n = segs.length / REC;
  if (n) {
    gl.useProgram(st.line); gl.bindVertexArray(st.vaoLine);
    gl.bindBuffer(gl.ARRAY_BUFFER, st.inst);
    if (segs.byteLength > st.instCap) { st.instCap = Math.max(segs.byteLength, st.instCap * 2); gl.bufferData(gl.ARRAY_BUFFER, st.instCap, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, segs);
    /* the spot never goes under half a pixel, so a narrow tube does not lose its lines between pixels */
    const sigma = Math.max(look.sigma, 0.55 / scale);
    gl.uniform2f(st.u['l.view'], vw, vh); gl.uniform1f(st.u['l.sigma'], sigma); gl.uniform1f(st.u['l.sigmaH'], sigma * look.halo); gl.uniform1f(st.u['l.haloW'], look.haloW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  if (tris.length) {
    gl.useProgram(st.fill); gl.bindVertexArray(st.vaoFill);
    gl.bindBuffer(gl.ARRAY_BUFFER, st.tri);
    if (tris.byteLength > st.triCap) { st.triCap = Math.max(tris.byteLength, st.triCap * 2); gl.bufferData(gl.ARRAY_BUFFER, st.triCap, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, tris);
    gl.uniform2f(st.u['f.view'], vw, vh);
    gl.drawArrays(gl.TRIANGLES, 0, tris.length / 5);
  }
  /* 2: to the screen, in the bottom-left corner of the shared canvas */
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST);
  gl.useProgram(st.tone); gl.bindVertexArray(st.vaoTone);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.tex);
  gl.uniform1i(st.u['t.tex'], 0); gl.uniform2f(st.u['t.size'], st.tw, st.th); gl.uniform1f(st.u['t.expo'], look.expo); gl.uniform1f(st.u['t.hot'], look.hot);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  /* 3: into the tube's canvas (the shared canvas's rows run bottom-up; drawImage reads them top-down) */
  target.setTransform(1, 0, 0, 1, 0, 0); target.clearRect(0, 0, w, h);
  target.drawImage(st.cv, 0, st.cv.height - h, w, h, 0, 0, w, h);
  return true;
}

/* ---------- the glass: the wheel's glass globe over a picture, in the same context ----------
   For the prize under glass: a picture (the amount, as type) and glass globes in front of it. Through a globe's core
   the picture shows upside down and smaller, as through a ball lens; its rim mirrors what lies just outside it, split
   into colours, the way the wheel's rim mirrors the city names. Each globe carries its city as a light (orange inside
   the glass, the one place orange is used). The program is GLSL ES 1.00, which WebGL2 also runs. */

export type GlassGlobe = { x: number; y: number; r: number; lat: number; lon: number; yaw: number; glow: number };
export type GlassLook = { mirror: number; through: number; fringe: number };
const GMAX = 12;
type Glass = { p: WebGLProgram; vao: WebGLVertexArrayObject; pic: WebGLTexture; land: WebGLTexture; landOk: boolean; picKey: unknown; u: Record<string, WebGLUniformLocation | null> };
let G: Glass | null | undefined;
/* the land picture arrives after the first draw; a still drawn before it has dark lights, so callers redraw on this */
let landDone: () => void = () => {};
export const glassLand = new Promise<void>((r) => { landDone = r; });

function glassInit(st: State): Glass | null {
  const { gl } = st;
  try {
    const VS = 'attribute vec2 aPosition; varying vec2 vUv; void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }';
    const FS = `precision highp float;
  uniform sampler2D uPicture, uLand;
  uniform vec2 uResolution, uHub; uniform float uRadius;
  uniform vec4 uG[${GMAX}]; uniform vec3 uC[${GMAX}]; uniform int uN;
  uniform float uMirror, uThrough, uFringe;
  varying vec2 vUv;
  vec4 picture(vec2 px) { vec2 uv = px / uResolution; return uv == clamp(uv, 0., 1.) ? texture2D(uPicture, uv) : vec4(0.); }
  ${glassGlsl(WHEEL_DEF)}
  void main() {
    vec2 px = vUv * uResolution, aside = vec2(uFringe, 0.);
    vec4 o = picture(px);
    for (int i = 0; i < ${GMAX}; i++) {
      if (i >= uN) break;
      gYaw = uC[i].z; gCity = uC[i].xy; gGlow = uG[i].w;
      vec2 c = uG[i].xy; float r = uG[i].z;
      vec4 g = globe(px, c, r, false);
      if (g.a <= 0.) continue;
      vec2 p = (px - c) / r; float far = length(p); vec2 dir = p / max(far, .001);
      vec2 thr = c - p * r * 1.15, ta = aside * 2.;
      vec3 through = vec3(picture(thr + ta).r, picture(thr).g, picture(thr - ta).b) * uThrough * smoothstep(.95, .55, far);
      vec2 mir = c + dir * r * (1. + (1. - far) * 4.);
      vec3 mirror = vec3(picture(mir + dir * uFringe * 2.).r, picture(mir).g, picture(mir - dir * uFringe * 2.).b) * uMirror * smoothstep(.8, .97, far) * smoothstep(1., .985, far);
      vec3 col = g.rgb + (through + mirror) * g.a;
      o = vec4(o.rgb * (1. - g.a) + col, o.a * (1. - g.a) + g.a);
    }
    gl_FragColor = o;
  }`;
    const p = prog(gl as GL, VS, FS);
    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPosition'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const tex = (wrap: number) => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0])); return t; };
    const u: Glass['u'] = {};
    for (const n of ['uPicture', 'uLand', 'uResolution', 'uHub', 'uRadius', 'uG', 'uC', 'uN', 'uMirror', 'uThrough', 'uFringe']) u[n] = gl.getUniformLocation(p, n);
    const g: Glass = { p, vao, pic: tex(gl.CLAMP_TO_EDGE), land: tex(gl.REPEAT), landOk: false, picKey: null, u };
    const img = new Image(); img.onload = () => { if (S !== st) return; gl.bindTexture(gl.TEXTURE_2D, g.land); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); g.landOk = true; landDone(); }; img.src = at('/wheel/land.png');
    return g;
  } catch (e) { console.warn(e); return null; }
}

/* Draw the picture and its globes into target. picture is a canvas the size of target; key changes when it does
   (the picture is uploaded only then). Globes are in target pixels, y down. */
export function drawGlass(target: CanvasRenderingContext2D, picture: HTMLCanvasElement, key: unknown, globes: GlassGlobe[], look: GlassLook): boolean {
  const st = state(); if (!st) return false;
  if (G === undefined || (G && !st.gl.isProgram(G.p))) G = glassInit(st);
  const g = G; if (!g) return false;
  const { gl } = st, w = target.canvas.width, h = target.canvas.height;
  if (!sizeTo(st, w, h)) return false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST);
  gl.useProgram(g.p); gl.bindVertexArray(g.vao);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.pic);
  if (g.picKey !== key) { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); g.picKey = key; }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g.land);
  gl.uniform1i(g.u.uPicture, 0); gl.uniform1i(g.u.uLand, 1);
  gl.uniform2f(g.u.uResolution, w, h); gl.uniform2f(g.u.uHub, 0, 0); gl.uniform1f(g.u.uRadius, 1);
  const Gv = new Float32Array(GMAX * 4), Cv = new Float32Array(GMAX * 3), n = Math.min(GMAX, globes.length), rad = Math.PI / 180;
  for (let i = 0; i < n; i++) { const o = globes[i]; Gv.set([o.x, h - o.y, o.r, g.landOk ? o.glow : 0], i * 4); Cv.set([o.lat * rad, o.lon * rad, o.yaw], i * 3); }
  gl.uniform4fv(g.u.uG, Gv); gl.uniform3fv(g.u.uC, Cv); gl.uniform1i(g.u.uN, n);
  gl.uniform1f(g.u.uMirror, look.mirror); gl.uniform1f(g.u.uThrough, look.through); gl.uniform1f(g.u.uFringe, look.fringe);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
  target.setTransform(1, 0, 0, 1, 0, 0); target.clearRect(0, 0, w, h);
  target.drawImage(st.cv, 0, st.cv.height - h, w, h, 0, 0, w, h);
  return true;
}
