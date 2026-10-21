// Stable key for a spoken line, shared by the voice generator (tools/voices)
// and the runtime player: FNV-1a 32-bit over "speaker|text".

export function voiceKey(speaker: string, text: string): string {
  let h = 0x811c9dc5;
  const s = `${speaker}|${text.trim()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
