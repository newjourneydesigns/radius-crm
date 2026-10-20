export interface AccessRow {
  user_id: string;
  scopes: string[];
  revoked_at: string | null;
}

export interface GrantRow {
  id: string;
  user_id: string;
  client_id: string;
  scope: string;
  resource: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface CodeRow {
  code_hash: string;
  grant_id: string;
  redirect_uri: string;
  code_challenge: string;
  expires_at: string;
  used_at: string | null;
}

export interface TokenRow {
  token_hash: string;
  kind: 'access' | 'refresh';
  grant_id: string;
  expires_at: string;
  used_at: string | null;
}

export interface AuditEntry {
  event: string;
  user_id?: string | null;
  grant_id?: string | null;
  client_id?: string | null;
  tool?: string | null;
  args?: unknown;
  ok?: boolean;
  result_count?: number | null;
  error?: string | null;
  duration_ms?: number | null;
}

export type ClaimResult<T> =
  | { status: 'claimed'; row: T }
  | { status: 'reused'; row: T }
  | { status: 'expired'; row: T }
  | { status: 'missing' };

/** Persistence for the OAuth server. Supabase-backed in production, in-memory in tests. */
export interface McpStore {
  getAccess(userId: string): Promise<AccessRow | null>;
  /** Redirect URIs registered by hand in mcp_allowed_redirects. */
  listAllowedRedirectUris(): Promise<string[]>;
  userExists(userId: string): Promise<boolean>;
  createGrant(grant: Omit<GrantRow, 'id' | 'revoked_at'>): Promise<GrantRow>;
  getGrant(id: string): Promise<GrantRow | null>;
  revokeGrant(id: string): Promise<void>;
  touchGrant(id: string): Promise<void>;
  insertCode(code: CodeRow): Promise<void>;
  /** Atomically marks a code used. A code that was already used reports 'reused'. */
  claimCode(codeHash: string, now: Date): Promise<ClaimResult<CodeRow>>;
  insertToken(token: TokenRow): Promise<void>;
  getToken(tokenHash: string): Promise<TokenRow | null>;
  /** Atomically marks a refresh token rotated. A token that was already rotated reports 'reused'. */
  claimRefreshToken(tokenHash: string, now: Date): Promise<ClaimResult<TokenRow>>;
  audit(entry: AuditEntry): Promise<void>;
}
