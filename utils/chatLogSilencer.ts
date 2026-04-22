// Suppresses noisy chat-app debug logs from the F12 console while preserving
// timing-related metrics. Toggle at runtime in DevTools:
//   window.__chatDebug.enable()   // restore full chat logging
//   window.__chatDebug.disable()  // suppress again (default)

const KEEP_PATTERNS: RegExp[] = [
  /⏱/,
  /耗时/,
  /Token Usage/,
  /\[bm25Index\]/,
];

const CHAT_PATTERNS: RegExp[] = [
  /\[Chat\]/,
  /\[XHS\]/,
  /\[Emotion\]/,
  /\[InnerState\]/,
  /\[Context\b/,
  /\[Context Debug\]/,
  /\[API Response Debug\]/,
  /\[Recall\]/,
  /\[Schedule/,
  /\[ProactiveChat\]/,
  /\[BrainAgent\]/,
  /\[MCP\]/,
  /\[SafeAPI\]/,
  /\[TTS\]/,
  /\[Digest\]/,
  /\[Consolidation\]/,
  /\[MemoryNodeDB\]/,
  /\[MemoryVectorDB\]/,
  /\[MemoryPalace\]/,
  /\[ForceVectorize\]/,
  /\[EventBox\]/,
  /\[Diary\]/,
  /\[ReadDiary\]/,
  /\[ReadNote\]/,
  /\[Notes?\]/,
  /\[Feishu\]/,
  /\[Search\]/,
  /\[extractJson\]/,
  /\[VectorStore\]/,
  /\[Migration\]/,
  /\[Retrieve\]/,
  /\[Rerank\]/,
  /\[Anticipation\]/,
  /\[Wipe\]/,
  /\[Embedding\]/,
  /\[Links\]/,
  /\[Related/,
  /\[BM25\]/,
  /\[DateResolver\]/,
  /\[Activation\]/,
  /\[Priming\]/,
  /\[VectorSearch\]/,
  /\[Hybrid\]/,
  /\[Formatter\]/,
  /\[Personality\]/,
  /\[AutoArchive\]/,
  /\[AutoDigest\]/,
  /🎭|🌊|📕|🏰|🧠|📦|⬆️|☁️|🗜️|📔|📒|📝|🎯|📅|👤|🔢|♻️/,
];

const ORIGINAL = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

let enabled = false;

function shouldShow(args: any[]): boolean {
  if (enabled) return true;
  let text = '';
  for (const a of args) {
    if (typeof a === 'string') text += ' ' + a;
    else if (a && typeof a === 'object' && typeof (a as any).message === 'string') text += ' ' + (a as any).message;
    if (text.length > 4000) break;
  }
  if (KEEP_PATTERNS.some(p => p.test(text))) return true;
  if (CHAT_PATTERNS.some(p => p.test(text))) return false;
  return true;
}

console.log = (...args: any[]) => { if (shouldShow(args)) ORIGINAL.log(...args); };
console.warn = (...args: any[]) => { if (shouldShow(args)) ORIGINAL.warn(...args); };
console.error = (...args: any[]) => { if (shouldShow(args)) ORIGINAL.error(...args); };
console.info = (...args: any[]) => { if (shouldShow(args)) ORIGINAL.info(...args); };
console.debug = (...args: any[]) => { if (shouldShow(args)) ORIGINAL.debug(...args); };

(globalThis as any).__chatDebug = {
  enable: () => { enabled = true; ORIGINAL.log('[chatDebug] full chat logging enabled'); },
  disable: () => { enabled = false; ORIGINAL.log('[chatDebug] chat logging suppressed (timing only)'); },
  isEnabled: () => enabled,
};

export {};
