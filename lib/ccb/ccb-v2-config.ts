/**
 * CCB API v2 (Pushpay) configuration + OAuth endpoint constants.
 *
 * v2 uses OAuth2 (System Auth, authorization_code grant). A CCB Master
 * Administrator authorizes the app once via the authorize URL; we then exchange
 * the code at the token URL and (Phase 1+) persist the refresh token.
 *
 * Docs: https://docs.pushpay.io/chms-v2
 */

// OAuth lives on oauth.ccbchurch.com; the REST API + token exchange on api.ccbchurch.com.
export const CCB_V2_AUTHORIZE_URL = 'https://oauth.ccbchurch.com/oauth/authorize';
export const CCB_V2_TOKEN_URL = 'https://api.ccbchurch.com/oauth/token';
export const CCB_V2_API_BASE_URL = 'https://api.ccbchurch.com';

// v2 requires this Accept header on every request (token exchange included).
export const CCB_V2_ACCEPT_HEADER = 'application/vnd.ccbchurch.v2+json';

export interface CCBv2Config {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  subdomain: string;
}

/**
 * Read v2 OAuth config from env. Throws if a required value is missing so the
 * OAuth routes fail loudly rather than building a malformed authorize URL.
 */
export function getCCBv2Config(): CCBv2Config {
  const clientId = process.env.CCB_V2_CLIENT_ID;
  const clientSecret = process.env.CCB_V2_CLIENT_SECRET;
  const redirectUri = process.env.CCB_V2_REDIRECT_URI;
  // Falls back to the v1 subdomain so we don't duplicate config during migration.
  const subdomain = process.env.CCB_V2_SUBDOMAIN || process.env.CCB_SUBDOMAIN;

  const missing = [
    !clientId && 'CCB_V2_CLIENT_ID',
    !clientSecret && 'CCB_V2_CLIENT_SECRET',
    !redirectUri && 'CCB_V2_REDIRECT_URI',
    !subdomain && 'CCB_V2_SUBDOMAIN (or CCB_SUBDOMAIN)',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(`Missing CCB v2 env vars: ${missing.join(', ')}`);
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    subdomain: subdomain!,
  };
}
