export function getCircleSummaryBaseUrl(req?: Request): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;
  if (configuredUrl) return configuredUrl;
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}
