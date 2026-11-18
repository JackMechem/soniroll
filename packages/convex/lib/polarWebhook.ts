/**
 * Polar webhook signatures (Standard Webhooks). Polar's newer secrets look like `whsec_<base64>`
 * and sign with the decoded bytes; the Polar component's SDK (0.x, pinned — see `billing.ts`) only
 * tries the secret's raw text, so it refused every real delivery (403). `http.ts` checks the
 * signature here with both keys (as Polar's current SDK does), then re-signs the request the way
 * the component expects and hands it on.
 */

const TOLERANCE_SEC = 5 * 60;
const enc = new TextEncoder();

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const raw = atob(value);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayBuffer) {
  let raw = "";
  for (const b of new Uint8Array(bytes)) raw += String.fromCharCode(b);
  return btoa(raw);
}

/** The HMAC keys a secret may sign with: its text, and its base64 part decoded. */
function keysOf(secret: string): Uint8Array<ArrayBuffer>[] {
  const keys: Uint8Array<ArrayBuffer>[] = [enc.encode(secret)];
  const decoded = fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  if (decoded && decoded.byteLength > 0) keys.push(decoded);
  return keys;
}

async function hmac(key: Uint8Array, content: string) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64(await crypto.subtle.sign("HMAC", k, enc.encode(content)));
}

/** True when `body` was signed by Polar with `secret` (and isn't older than five minutes). */
export async function validPolarSignature(body: string, headers: Headers, secret: string): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = Number(headers.get("webhook-timestamp"));
  const sigs = headers.get("webhook-signature");
  if (!secret || !id || !Number.isFinite(ts) || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SEC) return false;
  const content = `${id}.${Math.floor(ts)}.${body}`;
  const expected = await Promise.all(keysOf(secret).map((key) => hmac(key, content)));
  return sigs.split(" ").some((part) => {
    const [version, sig] = part.split(",", 2);
    return version === "v1" && !!sig && expected.includes(sig);
  });
}

/** The same request, signed with the secret's raw text (what the component's SDK checks). */
export async function resignForComponent(body: string, headers: Headers, secret: string, url: string): Promise<Request> {
  const id = headers.get("webhook-id")!;
  const ts = headers.get("webhook-timestamp")!;
  const out = new Headers(headers);
  out.set("webhook-signature", `v1,${await hmac(enc.encode(secret), `${id}.${Math.floor(Number(ts))}.${body}`)}`);
  return new Request(url, { method: "POST", headers: out, body });
}
