// Local development keeps its loopback restrictions. In a Vercel Function,
// Vercel routes the public Host; browser requests must match its HTTPS origin.
export function requestAllowed(req, { deployed = false } = {}) {
  const host = req.headers.host || "";
  const origin = req.headers.origin;
  if (!deployed) {
    return (
      /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) &&
      (!origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    );
  }
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(host)) return false;
  return !origin || origin === `https://${host.toLowerCase()}`;
}
