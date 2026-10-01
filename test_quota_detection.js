import { classifyGeminiError, classifyGroqError } from './runner_trials.js';

console.log('===============================================================');
console.log(' Quota & Rate Limit Detection Unit Tests');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(description, condition) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${description}`);
  } else {
    console.error(`[FAIL] ${description}`);
  }
}

// ─── Test 1: Gemini Per-Minute 429 Rate Limit ────────────────────────────────
const geminiPerMinuteErr = new Error(
  "[GoogleGenAI: 429] RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'GenerateContent requests' and limit 'GenerateContent requests per minute' of service 'generativelanguage.googleapis.com' for consumer 'project_number:12345'. QuotaId: GenerateContentRequestsPerMinutePerProject"
);
const geminiPerMinuteRes = classifyGeminiError(geminiPerMinuteErr);

assert(
  'Gemini Per-Minute 429 is detected as per-minute limit (isPerMinuteLimit=true)',
  geminiPerMinuteRes.isPerMinuteLimit === true
);
assert(
  'Gemini Per-Minute 429 is NOT flagged as daily quota (isDailyQuota=false)',
  geminiPerMinuteRes.isDailyQuota === false
);

// ─── Test 2: Gemini Daily Quota Limit (Contains 'PerDay') ────────────────────
const geminiPerDayErr = new Error(
  "[GoogleGenAI: 429] RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'GenerateContent requests' and limit 'GenerateContent requests per day' of service 'generativelanguage.googleapis.com' for consumer 'project_number:12345'. QuotaId: GenerateContentRequestsPerDayPerProject"
);
const geminiPerDayRes = classifyGeminiError(geminiPerDayErr);

assert(
  'Gemini PerDay 429 is detected as daily quota (isDailyQuota=true)',
  geminiPerDayRes.isDailyQuota === true
);
assert(
  'Gemini PerDay 429 does NOT fall back to transient per-minute handling (isPerMinuteLimit=false)',
  geminiPerDayRes.isPerMinuteLimit === false
);

// ─── Test 3: Groq Rate Limit 429 with Retry-After Header ─────────────────────
const groqRateLimitErr = {
  status: 429,
  message: "Rate limit reached for model `openai/gpt-oss-120b` in organization `org_abc`: Limit 30, Used 30, Requested 1. Please try again in 4.2s. Visit https://console.groq.com/docs/rate-limits for more information.",
  headers: {
    'retry-after': '4.2',
    'x-ratelimit-remaining-requests': '0'
  }
};
const groqRateLimitRes = classifyGroqError(groqRateLimitErr);

assert(
  'Groq 429 rate limit is detected as rate limit (isRateLimit=true)',
  groqRateLimitRes.isRateLimit === true
);
assert(
  'Groq 429 rate limit is NOT flagged as daily quota (isDailyLimit=false)',
  groqRateLimitRes.isDailyLimit === false
);
assert(
  'Groq 429 parses retry-after header correctly into milliseconds (waitMs=4200)',
  groqRateLimitRes.waitMs === 4200
);

// ─── Test 4: Groq Daily Limit / TPD Exhaustion ──────────────────────────────
const groqTpdErr = {
  status: 429,
  message: "Tokens per day (TPD) limit exceeded for model `openai/gpt-oss-120b`: Daily limit of 500000 reached. Quota resets at 00:00 UTC.",
  headers: {
    'retry-after': '36000'
  }
};
const groqTpdRes = classifyGroqError(groqTpdErr);

assert(
  'Groq TPD error is detected as daily limit (isDailyLimit=true)',
  groqTpdRes.isDailyLimit === true
);
assert(
  'Groq TPD error is NOT treated as a transient retryable rate limit (isRateLimit=false)',
  groqTpdRes.isRateLimit === false
);

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);

if (passedTests !== totalTests) {
  process.exit(1);
}
