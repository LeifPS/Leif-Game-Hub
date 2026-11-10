// Schlüssel wie im Browser: PBKDF2(Passwort, "lgh1:" + kleingeschriebener Name), SHA-256, 256 Bit (im Test wenige Runden, im Browser 210000)
export async function schluessel(name, pw, iter = 1000) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: iter, salt: new TextEncoder().encode('lgh1:' + name.normalize('NFC').toLowerCase()) }, k, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
