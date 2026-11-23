'use client';
import { useEffect, useRef } from 'react';
import { WHEEL_DEF } from '@/components/wheel/config';
import { glassGlsl } from '@/components/wheel/crt';
import { at } from '@/lib/routes';

/* The globe as the day's clock: the wheel's glass globe, turned so the places where it is ten in the morning face the
   page (the hour the cities run at), with the night side in shade from the real sun on Dec 10. Live cities are the
   wheel's light (an orange centre in a blue halo); finished cities are dim dots; cities still to come have no light.
   It draws when the minute or the lights change, and on a resize: at rest it costs nothing, and it turns a quarter of
   a degree a minute, a step too small to see. Without WebGL it is a flat disc with the same lights.

   face: where the ten o'clock meridian sits, in radians (the wheel's -0.6 faces the left, for a globe half off the
   right edge; 0 faces the viewer). */

export type GlobeLight = { lat: number; lon: number; kind: 'live' | 'done' };
const MAX = 10, rad = (d: number) => (d * Math.PI) / 180, CORE = WHEEL_DEF.core.toFixed(4);
/* the sun's latitude on Dec 10 */
const SUN_LAT = -22.9;

const VERT = 'attribute vec2 aPosition; varying vec2 vUv; void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }';
const FRAG = `
  precision highp float;
  uniform sampler2D uLand;
  uniform vec2 uResolution, uC, uSun, uHub; uniform float uR, uYaw, uNight, uRadius;
  uniform vec3 uL[${MAX}]; uniform int uN;
  varying vec2 vUv;
  vec4 picture(vec2 px) { return vec4(0.); }
  ${glassGlsl(WHEEL_DEF)}
  vec3 placeOf(vec2 ll, vec3 axis, vec3 side, vec3 front) { float turn = ll.y + gYaw; return cos(ll.x) * (sin(turn) * side + cos(turn) * front) + sin(ll.x) * axis; }
  void main() {
    vec2 px = vUv * uResolution;
    gYaw = uYaw; gCity = vec2(0.); gGlow = 0.;
    vec4 g = globe(px, uC, uR, false);
    if (g.a <= 0.) { gl_FragColor = vec4(0.); return; }
    vec2 p = (px - uC) / uR; float far = length(p);
    vec2 q = p / ${CORE} * mix(.84, 1., far * far); float inside = dot(q, q);
    vec3 add = vec3(0.); float shade = 0.;
    if (inside < 1.) {
      vec3 near = vec3(q, sqrt(1. - inside));
      vec3 axis = normalize(vec3(-.22, .92, .32)), side = normalize(cross(axis, vec3(0., 0., 1.))), front = cross(side, axis);
      float body = smoothstep(1., .72, inside);
      shade = uNight * smoothstep(.1, -.14, dot(near, placeOf(uSun, axis, side, front))) * body;
      for (int i = 0; i < ${MAX}; i++) {
        if (i >= uN) break;
        float away = 1. - dot(near, placeOf(uL[i].xy, axis, side, front));
        if (uL[i].z > 1.5) add += vec3(.7, .74, .72) * exp(-away * 1600.) * .7 * body;
        else { float c = exp(-away * 420.); add += (vec3(1., .46, .08) * c * 1.2 + vec3(.16, .38, 1.) * exp(-away * 110.) * (1. - c) * .45) * body; }
      }
      /* lights near each other add up; held to the wheel's one-city brightness so a cluster never blooms */
      add = min(add, vec3(1., .62, .5));
    }
    gl_FragColor = vec4(g.rgb * (1. - shade * .6) + add * g.a, g.a);
  }
`;

/* the turn for a minute: the meridian where it is 10:00 sits at `face` */
export function yawAt(minute: number, face: number): number { const h = (((minute / 60) % 24) + 24) % 24; return face - rad((10 - h) * 15); }
function sunAt(minute: number): [number, number] { const h = (((minute / 60) % 24) + 24) % 24; return [rad(SUN_LAT), rad((12 - h) * 15)]; }

export function DayGlobe({ lights, minute, face = WHEEL_DEF.face, night = 1, label, className }: { lights: GlobeLight[]; minute: number; face?: number; night?: number; label: string; className?: string }) {
  const cv = useRef<HTMLCanvasElement>(null), drawRef = useRef<(() => void) | null>(null), state = useRef({ lights, minute, face, night });
  const key = lights.map((l) => l.lat + ',' + l.lon + ',' + l.kind).join(';') + '|' + Math.floor(minute) + '|' + face + '|' + night;
  useEffect(() => {
    const canvas = cv.current; if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    let draw: () => void;
    let prog: WebGLProgram | null = null;
    if (gl) {
      prog = gl.createProgram();
      let ok = !!prog;
      for (const [t, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
        const s = gl.createShader(t); if (!s || !prog) { ok = false; break; }
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); ok = false; break; }
        gl.attachShader(prog, s);
      }
      if (ok && prog) {
        gl.bindAttribLocation(prog, 0, 'aPosition'); gl.linkProgram(prog); gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        /* the globe shows once its land is drawn (or failed to load), so it fades in whole instead of empty first */
        const img = new Image(); img.onload = () => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); drawRef.current?.(); canvas.dataset.ready = ''; }; img.onerror = () => { canvas.dataset.ready = ''; }; img.src = at('/wheel/land.png');
      } else { prog = null; }
    }
    if (gl && prog) {
      const p = prog, at = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform1i(at('uLand'), 0);
      draw = () => {
        const s = state.current, ratio = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
        const L = new Float32Array(MAX * 3); s.lights.slice(0, MAX).forEach((l, i) => L.set([rad(l.lat), rad(l.lon), l.kind === 'done' ? 2 : 1], i * 3));
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(at('uResolution'), canvas.width, canvas.height);
        gl.uniform2f(at('uC'), canvas.width / 2, canvas.height / 2); gl.uniform1f(at('uR'), Math.min(canvas.width, canvas.height) / 2 - 1);
        gl.uniform1f(at('uYaw'), yawAt(s.minute, s.face)); gl.uniform2f(at('uSun'), ...sunAt(s.minute)); gl.uniform1f(at('uNight'), s.night);
        gl.uniform3fv(at('uL'), L); gl.uniform1i(at('uN'), Math.min(MAX, s.lights.length));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
    } else {
      /* no WebGL: a flat disc with the same lights, seen from the same side */
      draw = () => {
        const s = state.current, ratio = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
        const c2 = canvas.getContext('2d'); if (!c2 || !w || !h) return;
        canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
        const R = Math.min(canvas.width, canvas.height) / 2 - 1, cx = canvas.width / 2, cy = canvas.height / 2, yaw = yawAt(s.minute, s.face);
        if (R < 4) return;
        c2.clearRect(0, 0, canvas.width, canvas.height);
        c2.fillStyle = '#141615'; c2.beginPath(); c2.arc(cx, cy, R, 0, Math.PI * 2); c2.fill();
        c2.strokeStyle = 'rgba(244,244,242,.35)'; c2.lineWidth = ratio; c2.stroke();
        const ax = norm([-0.22, 0.92, 0.32]), sd = norm(cross(ax, [0, 0, 1])), fr = cross(sd, ax);
        s.lights.forEach((l) => {
          const la = rad(l.lat), t = rad(l.lon) + yaw, p = add(add(scale(add(scale(sd, Math.sin(t)), scale(fr, Math.cos(t))), Math.cos(la)), scale(ax, Math.sin(la))), [0, 0, 0]);
          if (p[2] <= 0) return;
          const x = cx + p[0] * R * WHEEL_DEF.core, y = cy - p[1] * R * WHEEL_DEF.core;
          c2.fillStyle = l.kind === 'live' ? '#ff7a1a' : 'rgba(200,204,202,.7)'; c2.beginPath(); c2.arc(x, y, (l.kind === 'live' ? 4 : 2) * ratio, 0, Math.PI * 2); c2.fill();
        });
      };
    }
    drawRef.current = draw;
    const ro = new ResizeObserver(() => draw()); ro.observe(canvas);
    draw();
    if (!(gl && prog)) canvas.dataset.ready = '';
    return () => { ro.disconnect(); drawRef.current = null; if (gl && prog) gl.deleteProgram(prog); };
  }, []);
  useEffect(() => { state.current = { lights, minute, face, night }; drawRef.current?.(); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={cv} className={'dg' + (className ? ' ' + className : '')} role="img" aria-label={label} />;
}

type V = [number, number, number];
const add = (a: number[], b: number[]): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: number[], k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: number[], b: number[]): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]): V => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
