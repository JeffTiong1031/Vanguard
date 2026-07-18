export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function saltedFingerprint(text: string, salt: string): Promise<string> {
  return (await sha256Hex(salt + '\0' + text)).slice(0, 16); // 64-bit prefix; never reversible to text
}
