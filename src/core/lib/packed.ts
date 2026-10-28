/**
 * Small JSON payloads packed for links (no import, unit-tested with plain Node): deflate-compressed
 * where the browser can ('z' prefix), plain otherwise ('j'), then base64url.
 */
function toBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function pack(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  return typeof CompressionStream !== 'undefined' ? 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw'))) : 'j' + toBase64Url(json);
}

export async function unpack(code: string): Promise<unknown> {
  if (!/^[jz][A-Za-z0-9_-]+$/.test(code)) throw new Error('bad code');
  let bytes = fromBase64Url(code.slice(1));
  if (code[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}
