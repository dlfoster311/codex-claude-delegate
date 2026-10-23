import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeClaude, compareUsage } from '../skills/claude-code-delegate/scripts/usage.mjs';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const OBSERVED = '2026-10-22T11:59:00Z';
const FUTURE_SEC = NOW / 1000 + 3600;
const PAST_SEC = NOW / 1000 - 10;

const snap = (data, observedAt = OBSERVED) => ({ observedAt, data });

const codexBucket = (limitId, primary, secondary) => ({ limitId, primary, secondary });
const cw = (usedPercent, windowDurationMins, resetsAt = FUTURE_SEC) => ({ usedPercent, windowDurationMins, resetsAt });

// ---- Codex ----

test('codex: prefers rateLimitsByLimitId over rateLimits', () => {
  const r = normalizeCodex(
    snap({
      rateLimits: codexBucket('legacy', cw(99, 300)),
      rateLimitsByLimitId: { codex: codexBucket('codex', cw(20, 300), cw(40, 10080)) },
    }),
    NOW,
  );
  assert.equal(r.provider, 'codex');
  assert.equal(r.state, 'fresh');
  assert.equal(r.observedAt, '2026-10-22T11:59:00.000Z');
  assert.deepEqual(
    r.windows.map((w) => [w.bucket, w.windowMinutes, w.usedPercent, w.remainingPercent, w.status]),
    [
      ['codex.primary', 300, 20, 80, 'ok'],
      ['codex.secondary', 10080, 40, 60, 'ok'],
    ],
  );
  assert.equal(r.windows[0].resetsAt, new Date(FUTURE_SEC * 1000).toISOString());
});

test('codex: falls back to rateLimits', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(10, 300)) }), NOW);
  assert.equal(r.state, 'fresh');
  assert.equal(r.windows.length, 1);
  assert.equal(r.windows[0].usedPercent, 10);
});

test('codex: empty rateLimitsByLimitId falls back to rateLimits', () => {
  const r = normalizeCodex(snap({ rateLimitsByLimitId: {}, rateLimits: codexBucket('codex', cw(10, 300)) }), NOW);
  assert.equal(r.windows.length, 1);
});

test('codex: supports multiple buckets', () => {
  const r = normalizeCodex(
    snap({
      rateLimitsByLimitId: {
        codex: codexBucket('codex', cw(5, 300), cw(6, 10080)),
        codex_other: codexBucket('codex_other', cw(70, 300)),
      },
    }),
    NOW,
  );
  assert.deepEqual(r.windows.map((w) => w.bucket), ['codex.primary', 'codex.secondary', 'codex_other.primary']);
});

test('codex: zero usage is real zero', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(0, 300)) }), NOW);
  assert.equal(r.windows[0].usedPercent, 0);
  assert.equal(r.windows[0].remainingPercent, 100);
  assert.equal(r.state, 'fresh');
});

test('codex: missing secondary is not zero and not invented', () => {
  const r = normalizeCodex(snap({ rateLimits: { limitId: 'codex', primary: cw(30, 300) } }), NOW);
  assert.equal(r.windows.length, 1);
  assert.equal(r.windows[0].bucket, 'codex.primary');
  const n = normalizeCodex(snap({ rateLimits: { limitId: 'codex', primary: cw(30, 300), secondary: null } }), NOW);
  assert.equal(n.windows.length, 1);
});

test('codex: missing usedPercent is unknown, not zero', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', { windowDurationMins: 300, resetsAt: FUTURE_SEC }) }), NOW);
  assert.equal(r.windows[0].usedPercent, null);
  assert.equal(r.windows[0].remainingPercent, null);
  assert.equal(r.windows[0].status, 'unknown');
  assert.equal(r.state, 'unknown');
});

test('codex: rejects invalid percentages', () => {
  for (const bad of [-1, 100.5, NaN, Infinity, '50', true, {}]) {
    const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(bad, 300)) }), NOW);
    assert.equal(r.windows[0].usedPercent, null, String(bad));
    assert.equal(r.windows[0].status, 'invalid', String(bad));
    assert.equal(r.state, 'unknown');
  }
  const hundred = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(100, 300)) }), NOW);
  assert.equal(hundred.windows[0].usedPercent, 100);
  assert.equal(hundred.windows[0].remainingPercent, 0);
});

test('codex: expired reset is not current capacity', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(50, 300, PAST_SEC)) }), NOW);
  assert.equal(r.windows[0].status, 'expired');
  assert.equal(r.windows[0].usedPercent, null);
  assert.equal(r.windows[0].remainingPercent, null);
  assert.equal(r.state, 'unknown');
});

test('codex: reset exactly at now is expired', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(50, 300, NOW / 1000)) }), NOW);
  assert.equal(r.windows[0].status, 'expired');
});

test('codex: millisecond reset is invalid, not guessed', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(50, 300, NOW + 3600_000)) }), NOW);
  assert.equal(r.windows[0].status, 'invalid');
  assert.equal(r.windows[0].usedPercent, null);
});

test('codex: partial window keeps valid percent when duration missing', () => {
  const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', { usedPercent: 12, resetsAt: FUTURE_SEC }) }), NOW);
  assert.equal(r.windows[0].windowMinutes, null);
  assert.equal(r.windows[0].usedPercent, 12);
});

test('codex: invalid duration is invalid', () => {
  for (const bad of [0, -5, '300']) {
    const r = normalizeCodex(snap({ rateLimits: codexBucket('codex', cw(10, bad)) }), NOW);
    assert.equal(r.windows[0].status, 'invalid', String(bad));
    assert.equal(r.windows[0].usedPercent, null);
  }
});

test('codex: output has no raw data, credits, or ids beyond bucket', () => {
  const r = normalizeCodex(
    snap({
      accountId: 'acct_secret',
      email: 'a@b.com',
      credits: { unlimited: true, balance: '99.00' },
      rateLimits: { ...codexBucket('codex', cw(10, 300)), credits: { balance: '12.34' }, planType: 'pro' },
    }),
    NOW,
  );
  const text = JSON.stringify(r);
  for (const s of ['acct_secret', 'a@b.com', '99.00', '12.34', 'credits', 'pro"', 'unlimited']) {
    assert.ok(!text.includes(s), s);
  }
  assert.deepEqual(Object.keys(r).sort(), ['observedAt', 'provider', 'state', 'windows']);
  assert.deepEqual(
    Object.keys(r.windows[0]).sort(),
    ['bucket', 'remainingPercent', 'resetsAt', 'status', 'usedPercent', 'windowMinutes'],
  );
});

test('codex: empty or garbage data is unknown', () => {
  assert.equal(normalizeCodex(snap({}), NOW).state, 'unknown');
  assert.equal(normalizeCodex(snap('x'), NOW).state, 'unknown');
  assert.equal(normalizeCodex(null, NOW).state, 'unknown');
  assert.equal(normalizeCodex(undefined, NOW).state, 'unknown');
});

// ---- Timestamps (both providers) ----

const goodCodex = { rateLimits: codexBucket('codex', cw(10, 300)) };
const goodClaude = { rate_limits: { five_hour: { used_percentage: 10, resets_at: FUTURE_SEC } } };

for (const [name, fn, data] of [
  ['codex', normalizeCodex, goodCodex],
  ['claude', normalizeClaude, goodClaude],
]) {
  test(`${name}: missing or invalid observedAt is unknown`, () => {
    for (const observedAt of [undefined, null, '', 'garbage', 12345, '2026-10-22 11:59:00', '2026-10-22T11:59:00+02:00', '2026-10-22T11:59:00']) {
      const r = fn({ observedAt, data }, NOW);
      assert.equal(r.state, 'unknown', String(observedAt));
      assert.equal(r.observedAt, null);
      assert.ok(r.windows.every((w) => w.usedPercent === null && w.remainingPercent === null && w.status === 'unknown'));
    }
  });

  test(`${name}: age boundary is 15 minutes`, () => {
    const at = (ms) => new Date(NOW - ms).toISOString();
    assert.equal(fn(snap(data, at(15 * 60_000)), NOW).state, 'fresh');
    const stale = fn(snap(data, at(15 * 60_000 + 1000)), NOW);
    assert.equal(stale.state, 'stale');
    assert.ok(stale.windows.length > 0);
    assert.ok(stale.windows.every((w) => w.usedPercent === null && w.remainingPercent === null && w.status === 'stale'));
    assert.equal(stale.observedAt, at(15 * 60_000 + 1000));
  });

  test(`${name}: future boundary is 60 seconds`, () => {
    const at = (ms) => new Date(NOW + ms).toISOString();
    assert.equal(fn(snap(data, at(60_000)), NOW).state, 'fresh');
    const r = fn(snap(data, at(61_000)), NOW);
    assert.equal(r.state, 'unknown');
    assert.ok(r.windows.every((w) => w.usedPercent === null));
  });

  test(`${name}: non-finite nowMs is unknown`, () => {
    assert.equal(fn(snap(data), NaN).state, 'unknown');
  });
}

// ---- Claude: status line ----

test('claude: status-line shape', () => {
  const r = normalizeClaude(
    snap({
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: FUTURE_SEC },
        seven_day: { used_percentage: 41.2, resets_at: FUTURE_SEC + 86400 },
      },
    }),
    NOW,
  );
  assert.equal(r.provider, 'claude');
  assert.equal(r.state, 'fresh');
  assert.deepEqual(
    r.windows.map((w) => [w.bucket, w.windowMinutes, w.usedPercent, w.remainingPercent, w.status]),
    [
      ['five_hour', 300, 23.5, 76.5, 'ok'],
      ['seven_day', 10080, 41.2, 58.8, 'ok'],
    ],
  );
});

test('claude: status-line zero is real zero', () => {
  const r = normalizeClaude(snap({ rate_limits: { five_hour: { used_percentage: 0, resets_at: FUTURE_SEC } } }), NOW);
  assert.equal(r.windows[0].usedPercent, 0);
  assert.equal(r.windows[0].remainingPercent, 100);
  assert.equal(r.state, 'fresh');
});

test('claude: status-line missing window is absent, not zero', () => {
  const r = normalizeClaude(snap({ rate_limits: { seven_day: { used_percentage: 5, resets_at: FUTURE_SEC } } }), NOW);
  assert.deepEqual(r.windows.map((w) => w.bucket), ['seven_day']);
});

test('claude: status-line missing percentage is unknown', () => {
  const r = normalizeClaude(snap({ rate_limits: { five_hour: { resets_at: FUTURE_SEC } } }), NOW);
  assert.equal(r.windows[0].usedPercent, null);
  assert.equal(r.windows[0].status, 'unknown');
  assert.equal(r.state, 'unknown');
});

test('claude: status-line invalid percentages', () => {
  for (const bad of [-0.1, 101, NaN, '10']) {
    const r = normalizeClaude(snap({ rate_limits: { five_hour: { used_percentage: bad, resets_at: FUTURE_SEC } } }), NOW);
    assert.equal(r.windows[0].usedPercent, null, String(bad));
    assert.equal(r.windows[0].status, 'invalid');
  }
});

test('claude: status-line expired reset', () => {
  const r = normalizeClaude(snap({ rate_limits: { five_hour: { used_percentage: 90, resets_at: PAST_SEC } } }), NOW);
  assert.equal(r.windows[0].status, 'expired');
  assert.equal(r.windows[0].usedPercent, null);
  assert.equal(r.state, 'unknown');
});

test('claude: one expired window does not hide the other', () => {
  const r = normalizeClaude(
    snap({
      rate_limits: {
        five_hour: { used_percentage: 90, resets_at: PAST_SEC },
        seven_day: { used_percentage: 10, resets_at: FUTURE_SEC },
      },
    }),
    NOW,
  );
  assert.equal(r.state, 'fresh');
  assert.equal(r.windows[0].status, 'expired');
  assert.equal(r.windows[1].usedPercent, 10);
});

// ---- Claude: stream event ----

const info = (o) => snap({ rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', resetsAt: FUTURE_SEC, ...o } });

test('claude: event utilization fraction converts to percent', () => {
  const r = normalizeClaude(info({ utilization: 0.07 }), NOW);
  assert.equal(r.windows[0].usedPercent, 7);
  assert.equal(r.windows[0].remainingPercent, 93);
  assert.equal(r.windows[0].status, 'allowed');
  assert.equal(r.windows[0].windowMinutes, 300);
});

test('claude: event utilization zero and one', () => {
  assert.equal(normalizeClaude(info({ utilization: 0 }), NOW).windows[0].usedPercent, 0);
  const one = normalizeClaude(info({ utilization: 1 }), NOW).windows[0];
  assert.equal(one.usedPercent, 100);
  assert.equal(one.remainingPercent, 0);
});

test('claude: allowed without utilization is not zero usage', () => {
  const r = normalizeClaude(info({}), NOW);
  assert.equal(r.windows[0].usedPercent, null);
  assert.equal(r.windows[0].remainingPercent, null);
  assert.equal(r.windows[0].status, 'allowed');
});

test('claude: warning and rejected status kept without utilization', () => {
  for (const status of ['allowed_warning', 'rejected']) {
    const r = normalizeClaude(info({ status }), NOW);
    assert.equal(r.windows[0].status, status);
    assert.equal(r.windows[0].usedPercent, null);
    assert.equal(r.state, 'fresh');
  }
});

test('claude: warning status kept when utilization is invalid', () => {
  const r = normalizeClaude(info({ status: 'rejected', utilization: 7 }), NOW);
  assert.equal(r.windows[0].status, 'rejected');
  assert.equal(r.windows[0].usedPercent, null);
});

test('claude: utilization outside 0..1 is invalid (not a percent)', () => {
  for (const bad of [-0.01, 1.01, 50, NaN, '0.5']) {
    const r = normalizeClaude(info({ utilization: bad }), NOW);
    assert.equal(r.windows[0].usedPercent, null, String(bad));
    assert.equal(r.windows[0].status, 'invalid', String(bad));
  }
});

test('claude: event expired reset', () => {
  const r = normalizeClaude(info({ status: 'rejected', utilization: 1, resetsAt: PAST_SEC }), NOW);
  assert.equal(r.windows[0].status, 'expired');
  assert.equal(r.windows[0].usedPercent, null);
});

test('claude: event types map to durations; unknown type has none', () => {
  const week = normalizeClaude(info({ rateLimitType: 'seven_day', utilization: 0.5 }), NOW).windows[0];
  assert.equal(week.windowMinutes, 10080);
  const sonnet = normalizeClaude(info({ rateLimitType: 'seven_day_sonnet', utilization: 0.5 }), NOW).windows[0];
  assert.equal(sonnet.bucket, 'seven_day_sonnet');
  assert.equal(sonnet.windowMinutes, 10080);
  const other = normalizeClaude(info({ rateLimitType: 'weird type!', utilization: 0.5 }), NOW).windows[0];
  assert.equal(other.bucket, 'weird_type_');
  assert.equal(other.windowMinutes, null);
});

test('claude: unrecognized status string is not retained', () => {
  const r = normalizeClaude(info({ status: 'something', utilization: 0.2 }), NOW).windows[0];
  assert.equal(r.status, 'ok');
  const none = normalizeClaude(info({ status: 'something' }), NOW).windows[0];
  assert.equal(none.status, 'unknown');
});

test('claude: output excludes extra fields', () => {
  const r = normalizeClaude(
    snap({
      session_id: 'sess_secret',
      token: 'tok_secret',
      email: 'x@y.com',
      cost: { total_cost_usd: 12.34 },
      rate_limits: { five_hour: { used_percentage: 1, resets_at: FUTURE_SEC } },
    }),
    NOW,
  );
  const text = JSON.stringify(r);
  for (const s of ['sess_secret', 'tok_secret', 'x@y.com', '12.34', 'cost']) assert.ok(!text.includes(s), s);
});

test('claude: empty or garbage data is unknown', () => {
  assert.equal(normalizeClaude(snap({}), NOW).state, 'unknown');
  assert.equal(normalizeClaude(snap([]), NOW).state, 'unknown');
  assert.equal(normalizeClaude(null, NOW).state, 'unknown');
});

// ---- compareUsage ----

const codexData = (p, s) => ({
  rateLimitsByLimitId: { codex: codexBucket('codex', p && cw(...p), s && cw(...s)) },
});

test('compare: pairs equal-duration all-model windows', () => {
  const r = compareUsage(
    snap(codexData([20, 300], [60, 10080])),
    snap({
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: FUTURE_SEC },
        seven_day: { used_percentage: 10, resets_at: FUTURE_SEC },
      },
    }),
    NOW,
  );
  assert.equal(r.comparableWindows.length, 2);
  const [short, long] = r.comparableWindows;
  assert.equal(short.windowMinutes, 300);
  assert.equal(short.codex.remainingPercent, 80);
  assert.equal(short.claude.remainingPercent, 50);
  assert.equal(short.moreRemaining, 'codex');
  assert.equal(long.windowMinutes, 10080);
  assert.equal(long.moreRemaining, 'claude');
  assert.equal(r.codex.provider, 'codex');
  assert.equal(r.claude.provider, 'claude');
});

test('compare: equal remaining and zero usage', () => {
  const r = compareUsage(
    snap(codexData([0, 300])),
    snap({ rate_limits: { five_hour: { used_percentage: 0, resets_at: FUTURE_SEC } } }),
    NOW,
  );
  assert.equal(r.comparableWindows.length, 1);
  assert.equal(r.comparableWindows[0].moreRemaining, 'equal');
  assert.equal(r.comparableWindows[0].codex.usedPercent, 0);
});

test('compare: per-model weekly is not compared as all-model weekly', () => {
  const r = compareUsage(
    snap(codexData(null, [10, 10080])),
    snap({ rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day_sonnet', utilization: 0.3, resetsAt: FUTURE_SEC } }),
    NOW,
  );
  assert.equal(r.comparableWindows.length, 0);
  assert.equal(r.claude.windows[0].usedPercent, 30);
});

test('compare: all-model event window is comparable', () => {
  const r = compareUsage(
    snap(codexData(null, [10, 10080])),
    snap({ rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.3, resetsAt: FUTURE_SEC } }),
    NOW,
  );
  assert.equal(r.comparableWindows.length, 1);
  assert.equal(r.comparableWindows[0].claude.usedPercent, 30);
});

test('compare: non-codex Codex buckets are not all-model', () => {
  const r = compareUsage(
    snap({ rateLimitsByLimitId: { codex_other: codexBucket('codex_other', cw(10, 300)) } }),
    snap(goodClaude),
    NOW,
  );
  assert.equal(r.comparableWindows.length, 0);
});

test('compare: different durations are not compared', () => {
  const r = compareUsage(
    snap(codexData([10, 60])),
    snap(goodClaude),
    NOW,
  );
  assert.equal(r.comparableWindows.length, 0);
});

test('compare: stale side is excluded and noted', () => {
  const r = compareUsage(snap(codexData([10, 300]), '2026-10-22T11:00:00Z'), snap(goodClaude), NOW);
  assert.equal(r.codex.state, 'stale');
  assert.equal(r.comparableWindows.length, 0);
  assert.match(r.guidance, /Codex data is stale/);
});

test('compare: unknown side is excluded and noted', () => {
  const r = compareUsage(snap(codexData([10, 300])), { observedAt: 'nope', data: goodClaude }, NOW);
  assert.equal(r.claude.state, 'unknown');
  assert.equal(r.comparableWindows.length, 0);
  assert.match(r.guidance, /Claude data is unknown/);
});

test('compare: window without utilization is not comparable', () => {
  const r = compareUsage(snap(codexData([10, 300])), snap({ rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: FUTURE_SEC } }), NOW);
  assert.equal(r.comparableWindows.length, 0);
  assert.equal(r.claude.windows[0].status, 'rejected');
});

test('compare: expired window is not comparable', () => {
  const r = compareUsage(snap(codexData([10, 300, PAST_SEC])), snap(goodClaude), NOW);
  assert.equal(r.comparableWindows.length, 0);
});

test('compare: ambiguous equal-duration Codex windows are skipped', () => {
  const r = compareUsage(snap(codexData([10, 300], [20, 300])), snap(goodClaude), NOW);
  assert.equal(r.comparableWindows.length, 0);
});

test('compare: guidance is advisory and sets no limits', () => {
  const r = compareUsage(snap(codexData([10, 300])), snap(goodClaude), NOW);
  assert.match(r.guidance, /advisory/);
  assert.match(r.guidance, /Task fit and speed decide routing/);
  assert.doesNotMatch(r.guidance, /\$|budget|ratio|cap\b|saved/i);
  assert.deepEqual(Object.keys(r).sort(), ['claude', 'codex', 'comparableWindows', 'guidance']);
});

test('compare: token counts and USD are never turned into percentages', () => {
  const r = compareUsage(
    snap({ ...codexData([10, 300]), tokens: { used: 5000 }, estimatedUsd: 3.5 }),
    snap({ ...goodClaude, cost: { total_cost_usd: 2 }, context_window: { total_input_tokens: 9000 } }),
    NOW,
  );
  const text = JSON.stringify(r);
  for (const s of ['5000', '3.5', '9000', 'tokens', 'usd', 'Usd']) assert.ok(!text.includes(s), s);
});

test('compare: handles missing snapshots', () => {
  const r = compareUsage(undefined, null, NOW);
  assert.equal(r.codex.state, 'unknown');
  assert.equal(r.claude.state, 'unknown');
  assert.deepEqual(r.comparableWindows, []);
  assert.match(r.guidance, /advisory/);
});

test('claude: native unified windows expose both limits without duplicate active windows', () => {
  const now = Date.parse('2026-10-22T18:00:00Z');
  const snapshot = { observedAt: '2026-10-22T18:00:00Z', data: { rate_limit_info: {
    status: 'allowed', rateLimitType: 'five_hour', resetsAt: now / 1000 + 3600,
    unifiedWindows: {
      five_hour: { utilization: 0.01, resetsAt: now / 1000 + 3600 },
      seven_day: { utilization: 0.19, resetsAt: now / 1000 + 86400 },
    },
  } } };
  const result = normalizeClaude(snapshot, now);
  assert.equal(result.windows.length, 2);
  assert.equal(result.windows[0].usedPercent, 1);
  assert.equal(result.windows[1].usedPercent, 19);
});

test('compare: a Codex model bucket does not become an all-model bucket by prefix', () => {
  const now = Date.parse('2026-10-22T18:00:00Z');
  const observedAt = '2026-10-22T18:00:00Z';
  const codex = { observedAt, data: { rateLimitsByLimitId: { 'codex.opus': { limitId: 'codex.opus', primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: now / 1000 + 3600 } } } } };
  const claude = { observedAt, data: { rate_limits: { five_hour: { used_percentage: 20, resets_at: now / 1000 + 3600 } } } };
  assert.equal(compareUsage(codex, claude, now).comparableWindows.length, 0);
});
