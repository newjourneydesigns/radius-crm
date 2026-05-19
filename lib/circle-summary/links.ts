export function getCircleSummaryBaseUrl(req?: Request): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;

  // In dev, prefer the actual request origin so magic links match whatever
  // port the admin is currently running on (e.g. :3001 when :3000 is taken),
  // instead of the hardcoded NEXT_PUBLIC_APP_URL=http://localhost:3000.
  // In production, the env var wins so we never leak preview URLs.
  if (process.env.NODE_ENV !== 'production' && req) {
    return new URL(req.url).origin;
  }

  if (configuredUrl) return configuredUrl;
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}
