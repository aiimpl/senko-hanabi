// Colour of glowing matter: Planck's law at three wavelengths, white-balanced for a camera set to tungsten (3200 K).
// The luminance is normalised to 1, so brightness is set separately and the colour only follows the temperature.
export const blackbodyGLSL = /* glsl */`
  vec3 planck(float T){
    vec3 l = vec3(0.610, 0.549, 0.465) * 1e-6;
    return 1.0 / (l * l * l * l * l * (exp(1.4388e-2 / (l * T)) - 1.0));
  }
  vec3 blackbody(float T){
    vec3 c = planck(T) / planck(3200.0);
    return c / dot(c, vec3(0.2126, 0.7152, 0.0722));
  }`;

export function blackbody(T) {
  const l = [0.610e-6, 0.549e-6, 0.465e-6];
  const p = (T) => l.map((x) => 1 / (x ** 5 * (Math.exp(1.4388e-2 / (x * T)) - 1)));
  const a = p(T), w = p(3200);
  const c = a.map((v, i) => v / w[i]);
  const y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  return c.map((v) => v / y);
}
