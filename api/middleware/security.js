export default function securityHeaders(_req, res, next) {
  // API responses are not meant to be framed by other origins, but some same-origin
  // UI features (e.g. document preview) rely on embedding API-served files.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'self'"
  );
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
}
