/** Reads a request body, refusing anything over `maxBytes` (declared length first, then actual size). */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) return null;
  const text = await request.text();
  return Buffer.byteLength(text) > maxBytes ? null : text;
}

export const tooLarge = () =>
  new Response(JSON.stringify({ error: 'invalid_request', error_description: 'Request body too large.' }), {
    status: 413,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
