// Normalize Codex and Claude rate-limit snapshots into one compact shape.
// Output holds only percentages, durations, reset times, and status labels.
// Raw data, IDs, credits, and account details are never copied.

const STALE_MS = 15 * 60 * 1000;
const FUTURE_MS = 60 * 1000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const KEEP_STATUS = new Set(['allowed', 'allowed_warning', 'rejected']);
const WARN_STATUS = new Set(['allowed_warning', 'rejected']);
const CLAUDE_MINUTES = { five_hour: 300, seven_day: 10080, seven_day_sonnet: 10080 };
const CLAUDE_ALL_MODEL = new Set(['five_hour', 'seven_day']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;

function sanitize(value, fallback) {
  if (typeof value !== 'string' || value === '') return fallback;
  return value.slice(0, 40).replace(/[^\w.-]/g, '_');
}

function readClock(snapshot, nowMs) {
  const unknown = { state: 'unknown', observedAt: null };
  if (!isObject(snapshot) || typeof snapshot.observedAt !== 'string') return unknown;
  if (!ISO_UTC.test(snapshot.observedAt) || !Number.isFinite(nowMs)) return unknown;
  const ms = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(ms)) return unknown;
  const observedAt = new Date(ms).toISOString();
  if (ms - nowMs > FUTURE_MS) return { state: 'unknown', observedAt };
  if (nowMs - ms > STALE_MS) return { state: 'stale', observedAt };
  return { state: 'fresh', observedAt };
}

// Returns {kind: 'missing' | 'invalid' | 'ok', value}. Zero is valid.
function parseNumber(v, max) {
  if (v === undefined || v === null) return { kind: 'missing' };
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return { kind: 'invalid' };
  return { kind: 'ok', value: v };
}

const parsePercent = (v) => parseNumber(v, 100);

function parseFraction(v) {
  const p = parseNumber(v, 1);
  return p.kind === 'ok' ? { kind: 'ok', value: round2(p.value * 100) } : p;
}

// Epoch seconds. Millisecond values are rejected, not guessed.
function parseReset(v) {
  if (v === undefined || v === null) return { kind: 'missing' };
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= 1e11) return { kind: 'invalid' };
  return { kind: 'ok', ms: v * 1000 };
}

function makeWindow(nowMs, { bucket, windowMinutes, pct, reset, status, durationInvalid }) {
  let usedPercent = null;
  let st;
  if (reset.kind === 'invalid' || durationInvalid) st = 'invalid';
  else if (reset.kind === 'ok' && reset.ms <= nowMs) st = 'expired';
  else if (pct.kind === 'ok') {
    usedPercent = pct.value;
    st = status ?? 'ok';
  } else if (pct.kind === 'invalid') st = WARN_STATUS.has(status) ? status : 'invalid';
  else st = KEEP_STATUS.has(status) ? status : 'unknown';
  return {
    bucket,
    windowMinutes,
    usedPercent,
    remainingPercent: usedPercent === null ? null : round2(100 - usedPercent),
    resetsAt: reset.kind === 'ok' ? new Date(reset.ms).toISOString() : null,
    status: st,
  };
}

function mask(w, status) {
  return { ...w, usedPercent: null, remainingPercent: null, status };
}

function finish(provider, clock, windows) {
  if (clock.state === 'unknown') {
    return { provider, state: 'unknown', observedAt: clock.observedAt, windows: windows.map((w) => mask(w, 'unknown')) };
  }
  if (clock.state === 'stale') {
    return { provider, state: 'stale', observedAt: clock.observedAt, windows: windows.map((w) => mask(w, 'stale')) };
  }
  const usable = windows.some((w) => w.usedPercent !== null || KEEP_STATUS.has(w.status));
  return { provider, state: usable ? 'fresh' : 'unknown', observedAt: clock.observedAt, windows };
}

function codexBuckets(data) {
  const byId = data.rateLimitsByLimitId;
  if (isObject(byId) && Object.keys(byId).length > 0) {
    return Object.entries(byId).map(([key, b]) => [key, b]);
  }
  if (isObject(data.rateLimits)) return [['codex', data.rateLimits]];
  return [];
}

export function normalizeCodex(snapshot, nowMs = Date.now()) {
  const clock = readClock(snapshot, nowMs);
  const data = isObject(snapshot) && isObject(snapshot.data) ? snapshot.data : {};
  const windows = [];
  for (const [key, bucket] of codexBuckets(data)) {
    if (!isObject(bucket)) continue;
    const id = sanitize(bucket.limitId, sanitize(key, 'codex'));
    for (const slot of ['primary', 'secondary']) {
      const w = bucket[slot];
      if (w === undefined || w === null) continue; // absent is not zero
      const src = isObject(w) ? w : {};
      const dur = src.windowDurationMins;
      const durOk = typeof dur === 'number' && Number.isFinite(dur) && dur > 0;
      windows.push(
        makeWindow(nowMs, {
          bucket: `${id}.${slot}`,
          windowMinutes: durOk ? dur : null,
          pct: parsePercent(src.usedPercent),
          reset: parseReset(src.resetsAt),
          status: null,
          durationInvalid: dur !== undefined && dur !== null && !durOk,
        }),
      );
    }
  }
  return finish('codex', clock, windows);
}

export function normalizeClaude(snapshot, nowMs = Date.now()) {
  const clock = readClock(snapshot, nowMs);
  const data = isObject(snapshot) && isObject(snapshot.data) ? snapshot.data : {};
  const windows = [];

  if (isObject(data.rate_limits)) {
    for (const type of ['five_hour', 'seven_day']) {
      const w = data.rate_limits[type];
      if (w === undefined || w === null) continue;
      const src = isObject(w) ? w : {};
      windows.push(
        makeWindow(nowMs, {
          bucket: type,
          windowMinutes: CLAUDE_MINUTES[type],
          pct: parsePercent(src.used_percentage),
          reset: parseReset(src.resets_at),
          status: null,
        }),
      );
    }
  }

  if (isObject(data.rate_limit_info)) {
    const info = data.rate_limit_info;
    const type = typeof info.rateLimitType === 'string' ? info.rateLimitType : null;
    const status = typeof info.status === 'string' && KEEP_STATUS.has(info.status) ? info.status : null;
    const unified = isObject(info.unifiedWindows) ? info.unifiedWindows : {};
    for (const windowType of ['five_hour', 'seven_day', 'seven_day_sonnet']) {
      const w = unified[windowType];
      if (!isObject(w)) continue;
      windows.push(makeWindow(nowMs, {
        bucket: windowType,
        windowMinutes: CLAUDE_MINUTES[windowType],
        pct: parseFraction(w.utilization),
        reset: parseReset(w.resetsAt),
        status: windowType === type ? status : null,
      }));
    }
    if (!isObject(unified[type])) windows.push(
      makeWindow(nowMs, {
        bucket: sanitize(type, 'unknown'),
        windowMinutes: type !== null && Object.hasOwn(CLAUDE_MINUTES, type) ? CLAUDE_MINUTES[type] : null,
        pct: parseFraction(info.utilization),
        reset: parseReset(info.resetsAt),
        status,
      }),
    );
  }

  return finish('claude', clock, windows);
}

function isAllModel(provider, bucket) {
  if (provider === 'claude') return CLAUDE_ALL_MODEL.has(bucket);
  return /^codex\.(primary|secondary)$/i.test(bucket);
}

function candidates(result) {
  if (result.state !== 'fresh') return [];
  return result.windows.filter(
    (w) => w.usedPercent !== null && w.windowMinutes !== null && isAllModel(result.provider, w.bucket),
  );
}

const brief = (w) => ({
  bucket: w.bucket,
  usedPercent: w.usedPercent,
  remainingPercent: w.remainingPercent,
  resetsAt: w.resetsAt,
});

export function compareUsage(codexSnapshot, claudeSnapshot, nowMs = Date.now()) {
  const codex = normalizeCodex(codexSnapshot, nowMs);
  const claude = normalizeClaude(claudeSnapshot, nowMs);
  const cands = candidates(codex);
  const clands = candidates(claude);

  const comparableWindows = [];
  const minutes = new Set(cands.map((w) => w.windowMinutes));
  for (const m of [...minutes].sort((a, b) => a - b)) {
    const a = cands.filter((w) => w.windowMinutes === m);
    const b = clands.filter((w) => w.windowMinutes === m);
    if (a.length !== 1 || b.length !== 1) continue; // none, or ambiguous
    const diff = a[0].remainingPercent - b[0].remainingPercent;
    comparableWindows.push({
      windowMinutes: m,
      codex: brief(a[0]),
      claude: brief(b[0]),
      moreRemaining: diff === 0 ? 'equal' : diff > 0 ? 'codex' : 'claude',
    });
  }

  const notes = [];
  if (codex.state !== 'fresh') notes.push(`Codex data is ${codex.state}.`);
  if (claude.state !== 'fresh') notes.push(`Claude data is ${claude.state}.`);
  if (comparableWindows.length === 0) notes.push('No comparable windows.');
  const guidance = [
    'Usage is advisory. Task fit and speed decide routing.',
    ...notes,
  ].join(' ');

  return { codex, claude, comparableWindows, guidance };
}
