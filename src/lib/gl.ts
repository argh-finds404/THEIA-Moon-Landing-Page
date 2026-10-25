/**
 * The smallest useful WebGL2 kit for the two space scenes (Orbit, Landing
 * sites): a full-screen triangle, a program from one fragment shader,
 * mipmapped textures, and the GLSL both scenes share. No library.
 *
 * WebGL is used here, never in the hero (see AGENTS.md); each scene that
 * uses it keeps a static fallback for when it isn't available.
 */

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** GLSL shared by the scenes: rotations, seam-free equirectangular lookups, tone mapping. */
export const GLSL_COMMON = `
const float PI = 3.14159265359;
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }

// Longitude/latitude of a body-frame direction (y north, z = 0° longitude, x = 90°E).
vec2 equirect(vec3 b) {
  float lon = atan(b.x, b.z);
  float lat = asin(clamp(b.y, -1.0, 1.0));
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}

// Sample an equirectangular map without the seam a plain texture() leaves at ±180°:
// take whichever of the two wrapped coordinates has the smaller screen derivative.
vec4 sampleEq(sampler2D t, vec2 uv) {
  vec2 uv2 = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec2 dx2 = dFdx(uv2), dy2 = dFdy(uv2);
  if (dot(dx2, dx2) + dot(dy2, dy2) < dot(dx, dx) + dot(dy, dy)) { dx = dx2; dy = dy2; }
  return textureGrad(t, uv, dx, dy);
}

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

// ACES filmic approximation (Narkowicz), then display gamma.
vec3 tonemap(vec3 x) {
  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return pow(x, vec3(1.0 / 2.2));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export type Scene = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  u: (name: string) => WebGLUniformLocation | null;
  draw: () => void;
  dispose: () => void;
};

export function createScene(canvas: HTMLCanvasElement, fragment: string, opts: {alpha?: boolean} = {}): Scene | null {
  const gl = canvas.getContext('webgl2', {alpha: opts.alpha ?? false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance'});
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    gl,
    program,
    u: (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name)!;
    },
    draw: () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => {
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/** Load an image into a mipmapped texture on `unit`: repeats east–west, clamps at the poles. */
export function loadTexture(gl: WebGL2RenderingContext, url: string, unit: number): Promise<WebGLTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const tex = gl.createTexture();
      if (!tex) return reject(new Error('texture'));
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      resolve(tex);
    };
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** The bigger maps on screens that can use them. */
export const textureTier = () => (Math.min(window.innerWidth, window.innerHeight) * Math.min(window.devicePixelRatio || 1, 2) >= 900 ? '4k' : '2k');
