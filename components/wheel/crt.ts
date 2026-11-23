import type { WheelCfg } from './config';

/* The tube screen pass: it shows the wheel's 2D picture on a canvas as an old screen, with the glass globe on it.
   The two ends of the wheel act as the rim of a pane of glass: a name near an end is pulled around the wheel,
   smeared and split into colours. The globe is a ball of soft glass with the land in it and the active city as a
   light. The screen lines are not here: the page draws them over the canvas and the page text.

   The program is built from the config, so the numbers the loops and the colours need are fixed when it compiles;
   a change to one of them compiles it again (the lab does that, a page never does). The picture is uploaded only
   when it changed: at rest only the uniforms change, so a still wheel costs one pass of the shader and no upload. */

const VERTEX = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
`;
const f = (n: number, d = 4) => n.toFixed(d);

/* The glass globe, shared by the wheel and the screen kit's globes: the room's light, the glass, the land in it, the
   city's light and (on the wheel's hub) the start of the names at the rim. It reads the turn, the city and the light
   from three globals, so one pass can draw several globes, each with its own city. The caller declares uLand, uHub
   and uRadius, and defines picture(). */
export function glassGlsl(c: WheelCfg) {
  return `
  float gYaw; vec2 gCity; float gGlow;
  /* the globe leans back by gTilt (radians) so a southern city can face the viewer; 0 everywhere but the kit's half
     globes, so the wheel and the day globe draw as before */
  float gTilt = 0.;
  /* how much of the names the hub's glass shows at its rim: 1, except on a page where the globe leaves its names
     (the wheel's flow option fades them as the globe docks) */
  float gMirror = 1.;
  float room(vec3 d) {
    float spot = pow(max(dot(d, normalize(vec3(.25, -.55, .8))), 0.), 220.);
    float soft = pow(max(dot(d, normalize(vec3(-.45, .7, .55))), 0.), 14.);
    float fill = pow(max(dot(d, normalize(vec3(-.8, -.2, .55))), 0.), 3.);
    return spot * 8. + soft * 1.1 + fill * .3 + max(d.y, 0.) * .08;
  }

  float glassLight(vec3 n, float index) {
    vec3 eye = vec3(0., 0., -1.);
    float edge = pow(1. - max(n.z, 0.), 4.);
    vec3 through = -refract(eye, n, 1. / index);
    return room(reflect(eye, n)) * (.12 + .88 * edge) + room(through) * .4 * (1. - edge)
      + edge * .3 + pow(1. - max(n.z, 0.), 14.) * .8;
  }

  float land(vec3 d, vec3 axis, vec3 side, vec3 front) {
    float latitude = asin(clamp(dot(d, axis), -1., 1.));
    float longitude = atan(dot(d, side), dot(d, front)) - gYaw;
    return texture2D(uLand, vec2(longitude / 6.2832 + .5, latitude / 3.1416 + .5)).r;
  }

  vec4 globe(vec2 px, vec2 center, float radius, bool hasNames) {
    vec2 p = (px - center) / radius;
    float far = length(p);
    if (far >= 1.) return vec4(0.);
    vec3 n = vec3(p, sqrt(1. - far * far));
    vec3 axis = normalize(vec3(-.22, .92, .32));
    vec3 side = normalize(cross(axis, vec3(0., 0., 1.)));
    vec3 front = cross(side, axis);
    /* the lean turns the whole globe about the screen's horizontal axis */
    float ct = cos(gTilt), st = sin(gTilt);
    axis = vec3(axis.x, axis.y * ct - axis.z * st, axis.y * st + axis.z * ct);
    side = vec3(side.x, side.y * ct - side.z * st, side.y * st + side.z * ct);
    front = vec3(front.x, front.y * ct - front.z * st, front.y * st + front.z * ct);
    vec3 light = vec3(glassLight(n, 1.3 - ${f(c.glassSplit)}), glassLight(n, 1.3), glassLight(n, 1.3 + ${f(c.glassSplit)}));
    vec3 color = light * vec3(.95, 1., .97) + vec3(.012, .018, .016);
    vec2 from = normalize(vec2(-.5, .86));
    float lit = dot(p / max(far, .001), from);
    color += vec3(.92, 1., .97) * exp(-pow((far - .8) / .05, 2.)) * smoothstep(.45, .95, lit) * .5;
    color += vec3(.8, 1., .9) * exp(-pow((far - .72) / .14, 2.)) * smoothstep(.2, .95, -lit) * .2;
    color *= 1. - .3 * smoothstep(.76, .9, far) * (1. - smoothstep(.9, .985, far));
    color += vec3(.95, 1., .98) * pow(max(dot(n, normalize(vec3(-.42, .62, .66))), 0.), 70.) * .45;
    color *= .78 + .22 * smoothstep(-1., .4, lit);

    vec2 q = p / ${f(c.core)} * mix(.84, 1., far * far);
    float inside = dot(q, q);
    if (inside < 1.) {
      vec3 near = vec3(q, sqrt(1. - inside));
      float lit2 = .45 + .55 * max(dot(near, normalize(vec3(-.5, .45, .74))), 0.);
      float shown = land(near, axis, side, front) * lit2 + land(vec3(q, -near.z), axis, side, front) * .07;
      float body = smoothstep(1., .72, inside);
      color += vec3(.62, .95, .78) * shown * .4 * body;
      float turn = gCity.y + gYaw;
      vec3 place = cos(gCity.x) * (sin(turn) * side + cos(turn) * front) + sin(gCity.x) * axis;
      float away = 1. - dot(near, place);
      float center = exp(-away * 200.);
      color += (vec3(1., .46, .08) * center * 1.25 + vec3(.16, .38, 1.) * exp(-away * 26.) * (1. - center) * .8) * gGlow * body;
    }

    float lean = acos(far);
    if (hasNames && lean < ${f(c.mirrorDepth + 0.2, 3)}) {
      float around = atan(p.y, -p.x) * ${f(c.mirrorSqueeze, 3)};
      vec2 toward = vec2(-cos(around), sin(around)) * uRadius;
      float reach = ${f(c.mirrorStart - c.mirrorTip)} + ${f(c.mirrorTip / c.mirrorDepth)} * lean;
      vec2 at = uHub + toward * reach;
      vec2 apart = toward * reach * ${f(c.mirrorSplit, 3)};
      vec3 names = vec3(picture(at + apart).r, picture(at).g, picture(at - apart).b);
      color += names * ${f(c.mirrorStrength, 3)} * gMirror * smoothstep(1., .985, far);
    }

    float cover = smoothstep(1., 1. - 2. / radius, far);
    return vec4(color * cover, cover);
  }

`;
}

function fragment(c: WheelCfg) {
  const taps = Math.round(c.edgeTaps), paper = [c.paper, c.paper + 1, c.paper + 1].map((p) => f(p / 255, 3)).join(', ');
  /* the text globe is part of the picture, so it takes the names' smear (as strong as its own knob says) and fades at
     its top and bottom a little later than they do; the glass ball is drawn over the picture and needs neither */
  const ascii = c.globe === 'ascii';
  /* the rings are not spokes: the two ends of the wheel are not bent */
  const rings = c.globe === 'rings';
  return `
  precision highp float;
  uniform sampler2D uPicture, uLand;
  uniform vec2 uResolution, uHub;
  uniform vec3 uSmall, uGlobe, uDock;
  uniform float uRadius, uRatio, uYaw, uGlow, uScroll, uMirror, uDockGlow;
  uniform vec2 uCity;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  /* uScroll: how far the page has scrolled the picture up (device px; 0 when the wheel is the whole screen) */
  vec4 picture(vec2 px) { vec2 uv = (px - vec2(0., uScroll)) / uResolution; return uv == clamp(uv, 0., 1.) ? texture2D(uPicture, uv) : vec4(0.); }

  vec4 fringed(vec2 px) {
    vec2 aside = vec2(${f(c.fringe, 2)} * uRatio, 0.);
    vec4 middle = picture(px);
    return vec4(picture(px + aside).r, middle.g, picture(px - aside).b, middle.a);
  }

  vec4 wheel(vec2 px) {
    vec2 mirror = vec2(-1., 1.);
    vec2 spoke = (px - uHub) * mirror;
    float angle = atan(spoke.y, spoke.x);
    float far = length(spoke) / uRadius;
    float onGlobe = ${ascii ? '1. - smoothstep(1.1, 1.2, far)' : '0.'};
    float fade = 1. - onGlobe * smoothstep(${f(c.fadeFrom + 0.3)}, ${f(c.fadeTo + 0.3)}, abs(angle)) * ${f(c.globeEdge)};
    float strength = ${rings ? '0. *' : ''} pow(smoothstep(${f(c.edgeFrom)}, ${f(c.edgeTo)}, abs(angle)), 2.)
      * ${ascii ? `mix(smoothstep(1.2, 1.5, far), ${f(c.globeEdge)}, onGlobe)` : 'smoothstep(1.2, 1.5, far)'}
      * (1. - smoothstep(3.4, 4., far));
    if (strength <= 0. || abs(angle) > 2.5) return fringed(px) * fade;
    vec4 sum = vec4(0.);
    for (int i = 0; i < ${taps}; i++) {
      float back = strength * ${f(c.edgeReach)} * (.35 + .65 * (float(i) + .5) / ${taps}.) * sign(angle);
      vec3 turn = back * vec3(1.14, 1., .86);
      vec3 co = cos(turn), si = sin(turn);
      vec2 inward = spoke * (1. - strength * .1);
      vec4 red = picture(uHub + mirror * vec2(inward.x * co.r + inward.y * si.r, inward.y * co.r - inward.x * si.r));
      vec4 green = picture(uHub + mirror * vec2(inward.x * co.g + inward.y * si.g, inward.y * co.g - inward.x * si.g));
      vec4 blue = picture(uHub + mirror * vec2(inward.x * co.b + inward.y * si.b, inward.y * co.b - inward.x * si.b));
      sum += vec4(red.r, green.g, blue.b, (red.a + green.a + blue.a) / 3.);
    }
    return sum / ${taps}. * fade;
  }

${glassGlsl(c)}
  void main() {
    vec2 px = vUv * uResolution;
    gYaw = uYaw; gCity = uCity; gGlow = uGlow;
    vec4 ink = wheel(px);
    vec3 color = vec3(${paper}) * (1. - ink.a) + ink.rgb;
    gMirror = uMirror;
    vec4 glass = ${c.globe === 'glass' ? 'globe(px, uGlobe.xy, uGlobe.z, true)' : 'vec4(0.)'};
    color = color * (1. - glass.a) + glass.rgb;
    gMirror = 1.;
    vec4 small = globe(px, uSmall.xy, uSmall.z, false);
    color = color * (1. - small.a) + small.rgb;
    /* a third globe, only on a page where the wheel leaves its globe behind: the header's small one */
    vec4 dock = vec4(0.);
    if (uDock.z > 0.) { gGlow = uDockGlow; dock = globe(px, uDock.xy, uDock.z, false); color = color * (1. - dock.a) + dock.rgb; }
    color += (hash(floor(px / (uRatio * 1.5))) - .5) * ${f(c.grain)} * (1. - glass.a) * (1. - small.a) * (1. - dock.a);
    color *= 1. - ${f(c.vignette, 3)} * pow(length(vUv - .5) * 1.25, 3.);
    gl_FragColor = vec4(color, 1.);
  }
`;
}

export type CrtFrame = {
  picture: HTMLCanvasElement | null; /* null: the picture did not change since the last frame */
  hub: { x: number; y: number }; radius: number; small: { x: number; y: number; radius: number };
  ratio: number; yaw: number; city: [number, number]; glow: number;
  /* a wheel in a page's flow (all optional; left out, the frame draws as the wheel alone): how far the page has
     scrolled (device px), where the hub's globe is drawn when it is not on the hub, how much of the names its rim
     shows, and a third globe with its own light */
  scroll?: number; globe?: { x: number; y: number; radius: number }; mirror?: number; dock?: { x: number; y: number; radius: number; glow: number };
};
export type Crt = { draw: (d: CrtFrame) => void; setLand: (img: TexImageSource) => void; rebuild: (c: WheelCfg) => void; lost: () => boolean; dispose: () => void };

/* null where WebGL is not available, or where the program does not compile */
/* onRestored: after the GPU drops the context (a phone backgrounding the tab, GPU pressure) and gives it back, the
   program, the triangle and the textures are made again, the land uploaded again, and the caller asked for a new frame */
export function createCrt(canvas: HTMLCanvasElement, cfg: WheelCfg, onRestored?: () => void): Crt | null {
  const maybe = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!maybe) return null;
  const gl: WebGLRenderingContext = maybe;

  let program: WebGLProgram | null = null;
  let u: Record<string, WebGLUniformLocation | null> = {};
  const build = (c: WheelCfg) => {
    const p = gl.createProgram(); if (!p) return false;
    for (const [type, src] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment(c)]] as const) {
      const s = gl.createShader(type); if (!s) return false;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return false; }
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.bindAttribLocation(p, 0, 'aPosition'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return false;
    if (program) gl.deleteProgram(program);
    program = p; gl.useProgram(p);
    const at = (n: string) => gl.getUniformLocation(p, n);
    u = { resolution: at('uResolution'), hub: at('uHub'), small: at('uSmall'), radius: at('uRadius'), ratio: at('uRatio'), yaw: at('uYaw'), city: at('uCity'), glow: at('uGlow'),
      scroll: at('uScroll'), globe: at('uGlobe'), mirror: at('uMirror'), dock: at('uDock'), dockGlow: at('uDockGlow') };
    gl.uniform1i(at('uPicture'), 0); gl.uniform1i(at('uLand'), 1);
    return true;
  };
  let cur = cfg, landImg: TexImageSource | null = null;
  const setup = () => {
  if (!build(cur)) return false;

  /* one triangle bigger than the screen covers it with no seam */
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = (wrapS: number) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  /* a 2D canvas has its first row at the top and its colours multiplied by their alpha */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.activeTexture(gl.TEXTURE1); tex(gl.REPEAT);
  /* black, for no land, until the map loads */
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.activeTexture(gl.TEXTURE0); tex(gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  if (landImg) setLand(landImg);
  return true;
  };
  if (!setup()) return null;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); program = null; });
  canvas.addEventListener('webglcontextrestored', () => { if (setup()) onRestored?.(); });

  const draw = (d: CrtFrame) => {
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (d.picture) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d.picture);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform2f(u.hub, d.hub.x, canvas.height - d.hub.y);
    gl.uniform1f(u.radius, d.radius);
    gl.uniform3f(u.small, d.small.x, canvas.height - d.small.y, d.small.radius);
    gl.uniform1f(u.ratio, d.ratio); gl.uniform1f(u.yaw, d.yaw);
    gl.uniform2f(u.city, d.city[0], d.city[1]); gl.uniform1f(u.glow, d.glow);
    const g = d.globe ?? { x: d.hub.x, y: d.hub.y, radius: d.radius };
    gl.uniform1f(u.scroll, d.scroll ?? 0); gl.uniform3f(u.globe, g.x, canvas.height - g.y, g.radius); gl.uniform1f(u.mirror, d.mirror ?? 1);
    gl.uniform3f(u.dock, d.dock?.x ?? 0, canvas.height - (d.dock?.y ?? 0), d.dock?.radius ?? 0); gl.uniform1f(u.dockGlow, d.dock?.glow ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  function setLand(img: TexImageSource) {
    landImg = img; if (gl.isContextLost()) return;
    gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.activeTexture(gl.TEXTURE0);
  }
  const rebuild = (c: WheelCfg) => { cur = c; if (!gl.isContextLost()) build(c); };
  const dispose = () => { if (program) gl.deleteProgram(program); program = null; };
  return { draw, setLand, rebuild, lost: () => gl.isContextLost(), dispose };
}
