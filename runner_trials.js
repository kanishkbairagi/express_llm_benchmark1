/**
 * runner_trials.js
 *
 * Repeated-trial harness for benchmarking Express.js unit test generation.
 * Evaluates gemini-3.6-flash and gpt-oss-120b (via Groq) across k trials per controller.
 *
 * Loop order: Trial-major (for trial = 1..k, for each controller, for each model).
 *
 * Usage:
 *   node runner_trials.js [--k <trials>] [--dry-run] [--mock] [--max-tokens <tokens>] [--gemini-interval <ms>] [--insecure-tls]
 *
 * Examples:
 *   # Test harness end-to-end without calling APIs (mocked LLM responses, real Jest execution & CSV):
 *   node runner_trials.js --dry-run --mock
 *
 *   # Dry-run with real APIs (k=2 trials on 1 controller):
 *   node runner_trials.js --dry-run
 *
 *   # Full benchmark (k=5 trials on all 25 controllers):
 *   node runner_trials.js --k 5
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// ─── CLI Arguments Parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isMock = args.includes('--mock');

function getArgValue(flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}

const K_TRIALS = isDryRun ? 2 : parseInt(getArgValue('--k', '5'), 10);
const MAX_OUTPUT_TOKENS = parseInt(getArgValue('--max-tokens', '32768'), 10);
const GEMINI_MIN_INTERVAL_MS = parseInt(getArgValue('--gemini-interval', '4500'), 10);

// ─── TLS / Certificate Configuration ─────────────────────────────────────────
// In environments with corporate proxy / SSL inspection:
// Option A (Secure / Recommended): Export proxy/corporate root CA to a PEM file:
//   Windows PowerShell: $env:NODE_EXTRA_CA_CERTS="C:\path\to\corporate-ca.crt"
//   (To export: Open certmgr.msc -> Trusted Root Certification Authorities -> Certificates -> Export to Base-64 .CER)
// Option B (Insecure opt-in): Pass --insecure-tls flag on CLI.
const allowInsecureTls = args.includes('--insecure-tls');
const hasCustomCa = Boolean(process.env.NODE_EXTRA_CA_CERTS);

let tlsMode = 'system_default';
if (allowInsecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  tlsMode = 'insecure';
} else if (hasCustomCa) {
  tlsMode = 'custom_ca';
}

// ─── Directories ─────────────────────────────────────────────────────────────
const projectRoot = process.cwd();
const datasetDir = path.join(projectRoot, 'dataset');
const testsTrialsDir = path.join(projectRoot, 'tests_trials');
const baseResultsDir = path.join(projectRoot, isDryRun ? 'results/trials_dryrun' : 'results/trials');
const apiFailuresLogPath = path.join(baseResultsDir, 'api_failures.jsonl');

if (!fs.existsSync(testsTrialsDir)) {
  fs.mkdirSync(testsTrialsDir, { recursive: true });
}
if (!fs.existsSync(baseResultsDir)) {
  fs.mkdirSync(baseResultsDir, { recursive: true });
}

// ─── API Clients Initialisation ──────────────────────────────────────────────
const geminiApiKey = process.env.GEMINI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

if (!isMock) {
  if (!geminiApiKey) {
    console.warn('[WARNING] GEMINI_API_KEY not found in environment.');
  }
  if (!groqApiKey) {
    console.warn('[WARNING] GROQ_API_KEY not found in environment.');
  }
}

const google = (!isMock && geminiApiKey) ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const groq = (!isMock && groqApiKey) ? new OpenAI({ apiKey: groqApiKey, baseURL: 'https://api.groq.com/openai/v1' }) : null;

// ─── Rate Limiting & Sleep ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastGeminiRequestStartTime = 0;

async function throttleGemini() {
  if (isMock) return;
  const now = Date.now();
  const elapsed = now - lastGeminiRequestStartTime;
  if (elapsed < GEMINI_MIN_INTERVAL_MS) {
    const waitTime = GEMINI_MIN_INTERVAL_MS - elapsed;
    await sleep(waitTime);
  }
  lastGeminiRequestStartTime = Date.now();
}

// ─── Quota Classification Helpers (Exported for Unit Testing) ────────────────
export function classifyGeminiError(err) {
  const errMsg = err?.message || String(err || '');
  const isDailyQuota = errMsg.includes('PerDay');
  const isPerMinuteLimit = !isDailyQuota && (
    errMsg.includes('PerMinute') ||
    errMsg.includes('429') ||
    errMsg.includes('RESOURCE_EXHAUSTED')
  );
  return { isDailyQuota, isPerMinuteLimit, errMsg };
}

export function classifyGroqError(err) {
  const errMsg = err?.message || String(err || '');
  const isDailyLimit = errMsg.includes('TPD') ||
                       errMsg.includes('PerDay') ||
                       errMsg.includes('tokens per day') ||
                       errMsg.includes('requests per day');

  const status = err?.status || (errMsg.includes('429') ? 429 : null);
  const isRateLimit = !isDailyLimit && (status === 429 || errMsg.includes('rate_limit_exceeded'));

  let waitMs = 5000;
  const retryHeader = err?.headers ? (err.headers['retry-after'] || err.headers['retry-after-ms']) : null;
  if (retryHeader) {
    const parsed = parseFloat(retryHeader);
    if (!isNaN(parsed)) {
      waitMs = parsed > 100 ? Math.round(parsed) : Math.round(parsed * 1000);
    }
  }

  return { isDailyLimit, isRateLimit, waitMs, errMsg };
}

// ─── System Prompt & Sanitization (Exact Identity with benchmark.js) ────────
export function getSystemPrompt(targetFilename) {
  return `You are a Senior QA Automation Engineer. Output only valid Jest unit tests using ES Module syntax. Always import target functions using relative path '../dataset/${targetFilename}'. Return ONLY valid JavaScript code in a clean markdown block (\`\`\`javascript ... \`\`\`). Do NOT include any conversational filler, explanations, markdown text outside the code block, or questions.`;
}

export function cleanCodeBlock(rawText) {
  if (!rawText) return '';
  let cleaned = rawText.trim();
  const match = cleaned.match(/```(?:js|javascript)?([\s\S]*?)```/i);
  if (match) {
    cleaned = match[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:js|javascript)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  return cleaned;
}

export function sanitizeImports(testCode, targetFilename) {
  if (!testCode) return '';
  const targetRelativePath = `../dataset/${targetFilename}`;
  const baseName = targetFilename.replace(/\.js$/, '');
  const escapedBase = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  let sanitized = testCode;

  // Clean any residual markdown fences
  sanitized = sanitized.replace(/^```(?:js|javascript)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // In ES Module mode with --experimental-vm-modules, jest is not injected globally by default
  if (/\bjest\./.test(sanitized) && !sanitized.includes('@jest/globals')) {
    sanitized = `import { jest } from '@jest/globals';\n` + sanitized;
  }

  // 1. Rewrite relative imports pointing to target controller variants to the exact dataset path
  const importTargetRegex = new RegExp(`from\\s+['"][^'"]*${escapedBase}(\\.js)?['"]`, 'g');
  sanitized = sanitized.replace(importTargetRegex, `from '${targetRelativePath}'`);

  // 2. Rewrite common generic default imports if model hallucinated generic names
  sanitized = sanitized.replace(
    /from\s+['"]\.\/(?:userController|controller|sample-controller|authController|productController)(\.js)?['"]/g,
    `from '${targetRelativePath}'`
  );

  // 3. Ensure any import from ../dataset/... has .js extension for ES Module compliance
  sanitized = sanitized.replace(
    /from\s+['"](\.\.\/dataset\/[^'"]+?)(?<!\.js)['"]/g,
    "from '$1.js'"
  );

  return sanitized;
}

// ─── Model Callers (with Usage & Finish Reason Extraction) ───────────────────
async function fetchGeminiTrial(sourceCode, targetFilename, maxRetries = 5) {
  if (isMock) {
    const fnBase = targetFilename.replace(/\.js$/, '');
    const mockCode = `\`\`\`javascript\nimport { jest } from '@jest/globals';\nimport * as controller from '../dataset/${targetFilename}';\n\ndescribe('${fnBase} suite (mock)', () => {\n  test('should be defined', () => {\n    expect(controller).toBeDefined();\n  });\n});\n\`\`\``;
    return {
      rawText: mockCode,
      finishReason: 'STOP',
      usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165, thinkingTokens: 0 },
      latencyMs: 15,
      modelVersion: 'gemini-3.6-flash-mock',
      responseId: 'mock-gemini-resp-id',
      effectiveConfig: { model: 'gemini-3.6-flash', maxOutputTokens: MAX_OUTPUT_TOKENS, mock: true }
    };
  }

  if (!google) throw new Error('Google GenAI client not initialized (missing API key)');
  const prompt = getSystemPrompt(targetFilename);

  let quotaRetries = 0;
  const maxQuotaRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await throttleGemini();
    const reqStart = Date.now();
    try {
      const response = await google.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Target controller: ../dataset/${targetFilename}\n\nCode to test:\n${sourceCode}`,
        config: {
          systemInstruction: prompt,
          maxOutputTokens: MAX_OUTPUT_TOKENS
          // temperature, top_p, top_k omitted to use provider defaults
        }
      });

      const latencyMs = Date.now() - reqStart;
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason || 'STOP';
      const rawText = response.text || '';
      const modelVersion = response.modelVersion ?? null;
      const responseId = response.responseId ?? response.id ?? null;

      const usage = {
        promptTokens: response.usageMetadata?.promptTokenCount ?? null,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        totalTokens: response.usageMetadata?.totalTokenCount ?? null,
        thinkingTokens: response.usageMetadata?.thoughtsTokenCount ?? null
      };

      return {
        rawText,
        finishReason,
        usage,
        latencyMs,
        modelVersion,
        responseId,
        effectiveConfig: {
          model: 'gemini-3.6-flash',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 'provider default',
          top_p: 'provider default',
          top_k: 'provider default',
          thinking: 'provider default'
        }
      };
    } catch (err) {
      const { isDailyQuota, isPerMinuteLimit, errMsg } = classifyGeminiError(err);

      if (isDailyQuota) {
        console.error(`\n[Gemini] Daily quota limit reached (contains 'PerDay'): ${errMsg}`);
        return { fatalQuota: true, thrownError: errMsg };
      }

      if (isPerMinuteLimit && quotaRetries < maxQuotaRetries) {
        quotaRetries++;
        console.log(`  [Gemini] Per-minute rate limit hit (attempt ${attempt}). Waiting 10s (retry ${quotaRetries}/${maxQuotaRetries})...`);
        await sleep(10000);
      } else if (!isPerMinuteLimit && attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`  [Gemini] Temporary error (${errMsg.slice(0, 60)}...). Retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        console.error(`  [Gemini] Request failed after ${attempt} attempts:`, errMsg);
        return { thrownError: errMsg, rawText: '' };
      }
    }
  }
  return { thrownError: 'Exceeded max retries', rawText: '' };
}

async function fetchGroqTrial(sourceCode, targetFilename, maxRetries = 5) {
  if (isMock) {
    const fnBase = targetFilename.replace(/\.js$/, '');
    const mockCode = `\`\`\`javascript\nimport { jest } from '@jest/globals';\nimport * as controller from '../dataset/${targetFilename}';\n\ndescribe('${fnBase} suite (mock)', () => {\n  test('should be defined', () => {\n    expect(controller).toBeDefined();\n  });\n});\n\`\`\``;
    return {
      rawText: mockCode,
      finishReason: 'stop',
      usage: { promptTokens: 110, completionTokens: 42, totalTokens: 152, reasoningTokens: 0 },
      latencyMs: 12,
      model: 'openai/gpt-oss-120b',
      system_fingerprint: 'fp_mock_groq',
      id: 'mock-groq-resp-id',
      effectiveConfig: { model: 'openai/gpt-oss-120b', maxOutputTokens: MAX_OUTPUT_TOKENS, mock: true }
    };
  }

  if (!groq) throw new Error('Groq OpenAI client not initialized (missing API key)');
  const prompt = getSystemPrompt(targetFilename);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const reqStart = Date.now();
    try {
      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Target controller: ../dataset/${targetFilename}\n\nCode to test:\n${sourceCode}` }
        ],
        max_tokens: MAX_OUTPUT_TOKENS
        // temperature, top_p omitted to use provider defaults
      });

      const latencyMs = Date.now() - reqStart;
      const choice = response.choices?.[0];
      const finishReason = choice?.finish_reason || 'stop';
      const rawText = choice?.message?.content || '';
      const model = response.model ?? null;
      const system_fingerprint = response.system_fingerprint ?? null;
      const id = response.id ?? null;

      const usage = {
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
        reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens ?? null
      };

      return {
        rawText,
        finishReason,
        usage,
        latencyMs,
        model,
        system_fingerprint,
        id,
        effectiveConfig: {
          model: 'openai/gpt-oss-120b',
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 'provider default',
          top_p: 'provider default'
        }
      };
    } catch (err) {
      const { isDailyLimit, isRateLimit, waitMs, errMsg } = classifyGroqError(err);

      if (isDailyLimit) {
        console.error(`\n[Groq] Daily quota limit reached (TPD/PerDay): ${errMsg}`);
        return { fatalQuota: true, thrownError: errMsg };
      }

      if (isRateLimit && attempt < maxRetries) {
        console.log(`  [Groq] Rate limit hit (attempt ${attempt}). Waiting ${(waitMs / 1000).toFixed(1)}s as per retry-after header...`);
        await sleep(waitMs);
      } else if (attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`  [Groq] Temporary error (${errMsg.slice(0, 60)}...). Retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        console.error(`  [Groq] Request failed after ${attempt} attempts:`, errMsg);
        return { thrownError: errMsg, rawText: '' };
      }
    }
  }
  return { thrownError: 'Exceeded max retries', rawText: '' };
}

// ─── Jest Execution & Result Parsing ─────────────────────────────────────────
function runJestOnTrial(testFilePath, targetFilename) {
  const tempJsonOut = path.join(path.dirname(testFilePath), `temp_${path.basename(testFilePath)}.json`);
  if (fs.existsSync(tempJsonOut)) {
    try { fs.unlinkSync(tempJsonOut); } catch (e) {}
  }

  const normalizedTestPath = testFilePath.replace(/\\/g, '/');
  const normalizedOutPath = tempJsonOut.replace(/\\/g, '/');
  const cmd = `node --experimental-vm-modules node_modules/jest/bin/jest.js "${normalizedTestPath}" --coverage --json --outputFile="${normalizedOutPath}" --testPathIgnorePatterns="\\.stryker-tmp" --testMatch="**/*.test.js"`;

  let stderrOut = '';
  let isJestTimeout = false;
  try {
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 35000 });
  } catch (err) {
    stderrOut = (err.stderr || '') + '\n' + (err.stdout || '');
    if (err.code === 'ETIMEDOUT' || err.killed || err.signal === 'SIGTERM') {
      isJestTimeout = true;
    }
  }

  let data = null;
  if (fs.existsSync(tempJsonOut)) {
    try {
      data = JSON.parse(fs.readFileSync(tempJsonOut, 'utf-8'));
      fs.unlinkSync(tempJsonOut);
    } catch (e) {}
  }

  if (isJestTimeout) {
    return {
      suiteOk: false,
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
      errorCategory: 'jest_timeout',
      statementCoverage: 0,
      branchCoverage: 0,
      functionCoverage: 0,
      lineCoverage: 0,
      rawJestOutput: { error: 'Jest execution timed out after 35s', details: stderrOut }
    };
  }

  if (!data) {
    let errorCategory = 'other_error';
    if (stderrOut.includes('SyntaxError')) errorCategory = 'SyntaxError';
    else if (stderrOut.includes('ReferenceError: jest is not defined')) errorCategory = 'harness_import_issue';
    else if (stderrOut.includes('ReferenceError')) errorCategory = 'ReferenceError';
    else if (stderrOut.includes('TypeError')) errorCategory = 'TypeError';

    return {
      suiteOk: false,
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
      errorCategory,
      statementCoverage: 0,
      branchCoverage: 0,
      functionCoverage: 0,
      lineCoverage: 0,
      rawJestOutput: { error: stderrOut }
    };
  }

  const testsPassed = data.numPassedTests || 0;
  const testsFailed = data.numFailedTests || 0;
  const testsTotal = data.numTotalTests || 0;
  const isRuntimeError = (data.numRuntimeErrorTestSuites || 0) > 0 || (testsTotal === 0 && !data.success);

  let errorCategory = 'none';
  if (isRuntimeError) {
    if (stderrOut.includes('SyntaxError')) errorCategory = 'SyntaxError';
    else if (stderrOut.includes('ReferenceError: jest is not defined')) errorCategory = 'harness_import_issue';
    else if (stderrOut.includes('ReferenceError')) errorCategory = 'ReferenceError';
    else if (stderrOut.includes('TypeError')) errorCategory = 'TypeError';
    else errorCategory = 'runtime_error';
  } else if (!data.success || testsFailed > 0) {
    errorCategory = 'AssertionFailure';
  }

  let lineCoverage = 0, statementCoverage = 0, branchCoverage = 0, functionCoverage = 0;

  if (data.coverageMap) {
    const covKey = Object.keys(data.coverageMap).find(k => k.endsWith(targetFilename) || k.includes(targetFilename));
    if (covKey && data.coverageMap[covKey]) {
      const fileCov = data.coverageMap[covKey];

      // 1. Statement coverage from s
      const s = fileCov.s || {};
      const sKeys = Object.keys(s);
      if (sKeys.length > 0) {
        statementCoverage = parseFloat(((sKeys.filter(k => s[k] > 0).length / sKeys.length) * 100).toFixed(2));
      }

      // 2. True line coverage via statementMap (a line is covered if any statement starting on it has count > 0)
      const statementMap = fileCov.statementMap || {};
      const linesMap = new Map();
      for (const [stmtId, range] of Object.entries(statementMap)) {
        const lineNum = range.start?.line;
        if (lineNum !== undefined) {
          const isCovered = (s[stmtId] || 0) > 0;
          if (!linesMap.has(lineNum)) {
            linesMap.set(lineNum, isCovered);
          } else if (isCovered) {
            linesMap.set(lineNum, true);
          }
        }
      }
      const totalLines = linesMap.size;
      const coveredLines = Array.from(linesMap.values()).filter(Boolean).length;
      if (totalLines > 0) {
        lineCoverage = parseFloat(((coveredLines / totalLines) * 100).toFixed(2));
      }

      // 3. Branch coverage
      const b = fileCov.b || {};
      const bKeys = Object.keys(b);
      let bTotal = 0, bCovered = 0;
      bKeys.forEach(k => {
        (b[k] || []).forEach(v => {
          bTotal++;
          if (v > 0) bCovered++;
        });
      });
      if (bTotal > 0) branchCoverage = parseFloat(((bCovered / bTotal) * 100).toFixed(2));

      // 4. Function coverage
      const f = fileCov.f || {};
      const fKeys = Object.keys(f);
      if (fKeys.length > 0) {
        functionCoverage = parseFloat(((fKeys.filter(k => f[k] > 0).length / fKeys.length) * 100).toFixed(2));
      }
    }
  }

  const suiteOk = data.success === true && testsFailed === 0;

  return {
    suiteOk,
    testsPassed,
    testsFailed,
    testsTotal,
    errorCategory,
    statementCoverage,
    branchCoverage,
    functionCoverage,
    lineCoverage,
    rawJestOutput: data
  };
}

// ─── Environment & Run Metadata ──────────────────────────────────────────────
function getInstalledVersion(pkgRelativePath) {
  try {
    const pkgJsonPath = path.join(projectRoot, 'node_modules', pkgRelativePath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      return pkg.version || 'unknown';
    }
  } catch (e) {}
  return 'unknown';
}

function getToolVersions() {
  return {
    node: process.version,
    jest: getInstalledVersion('jest'),
    stryker: getInstalledVersion('@stryker-mutator/core'),
    googleGenAi: getInstalledVersion('@google/genai'),
    openai: getInstalledVersion('openai'),
    platform: process.platform,
    arch: process.arch
  };
}

function writeRunMetadata(baseDir) {
  const versions = getToolVersions();
  const timestamp = new Date().toISOString();
  const filename = `run_metadata_${timestamp.replace(/:/g, '-')}.json`;
  const metadataPath = path.join(baseDir, filename);

  const metadata = {
    benchmarkTimestamp: timestamp,
    kTrials: K_TRIALS,
    cliArgs: process.argv.slice(2),
    tlsMode,
    hasNodeExtraCaCerts: hasCustomCa,
    isDryRun,
    isMock,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    geminiMinIntervalMs: GEMINI_MIN_INTERVAL_MS,
    samplingParameters: {
      temperature: 'provider default',
      top_p: 'provider default',
      top_k: 'provider default'
    },
    models: [
      {
        id: 'gemini-3.6-flash',
        provider: 'Google GenAI SDK (@google/genai)',
        callStyle: 'models.generateContent'
      },
      {
        id: 'openai/gpt-oss-120b',
        provider: 'Groq (OpenAI-compatible client)',
        callStyle: 'chat.completions.create'
      }
    ],
    toolVersions: versions,
    systemPromptText: getSystemPrompt('<targetFilename>')
  };

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  return metadataPath;
}

// ─── CSV Summary Generator ──────────────────────────────────────────────────
function generateSummaryCsv(baseDir) {
  const csvPath = path.join(baseDir, 'trials_summary.csv');
  const rows = [];
  const headers = [
    'model',
    'controller',
    'trial',
    'startedAt',
    'finishedAt',
    'suiteOk',
    'testsPassed',
    'testsFailed',
    'testsTotal',
    'errorCategory',
    'statementCoverage',
    'branchCoverage',
    'functionCoverage',
    'lineCoverage',
    'finishReason',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'thinkingOrReasoningTokens',
    'latencyMs'
  ];

  function findTrialResults(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        findTrialResults(fullPath);
      } else if (item === 'trial_result.json') {
        try {
          const res = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          const thinkingOrReasoning = res.usage?.thinkingTokens ?? res.usage?.reasoningTokens ?? '';
          rows.push([
            res.model,
            res.controller,
            res.trial,
            res.startedAt,
            res.finishedAt,
            res.suiteOk,
            res.testsPassed,
            res.testsFailed,
            res.testsTotal,
            res.errorCategory,
            res.statementCoverage,
            res.branchCoverage,
            res.functionCoverage,
            res.lineCoverage,
            res.finishReason,
            res.usage?.promptTokens ?? '',
            res.usage?.completionTokens ?? '',
            res.usage?.totalTokens ?? '',
            thinkingOrReasoning,
            res.latencyMs ?? ''
          ]);
        } catch (e) {}
      }
    }
  }

  findTrialResults(baseDir);

  rows.sort((a, b) => {
    if (a[2] !== b[2]) return a[2] - b[2];
    if (a[1] !== b[1]) return String(a[1]).localeCompare(String(b[1]));
    return String(a[0]).localeCompare(String(b[0]));
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(csvPath, csvContent, 'utf-8');
  console.log(`\n  Summary CSV written to: ${csvPath} (${rows.length} trial records)`);
}

// ─── Main Runner Loop (Trial-Major) ──────────────────────────────────────────
async function main() {
  console.log('===============================================================');
  console.log(` Repeated-Trial Benchmark Harness (${isDryRun ? (isMock ? 'DRY-RUN [MOCK API]' : 'DRY-RUN [LIVE API]') : `k=${K_TRIALS} Trials`})`);
  console.log('===============================================================');
  console.log(`Loop Strategy: Trial-major (trial = 1..k, for each controller, for each model)`);
  console.log(`Max Output Tokens: ${MAX_OUTPUT_TOKENS}`);
  console.log(`TLS Mode: ${tlsMode}`);
  console.log(`Gemini Min Request Start Interval: ${GEMINI_MIN_INTERVAL_MS}ms`);
  console.log(`Results Root: ${baseResultsDir}`);
  console.log(`Tests Output Root: ${testsTrialsDir}\n`);

  const metaPath = writeRunMetadata(baseResultsDir);
  console.log(`Run metadata logged to: ${metaPath}\n`);

  let controllers = fs.readdirSync(datasetDir)
    .filter(f => f.endsWith('.js') && /^\d{2}_.*\.js$/.test(f))
    .sort();

  if (isDryRun) {
    controllers = [controllers[0]]; // 1 controller for dry-run
  }

  const models = [
    { name: 'gemini-3.6-flash', fetcher: fetchGeminiTrial },
    { name: 'gpt-oss-120b', fetcher: fetchGroqTrial }
  ];

  // Trial-major loop: trial 1..k, for each controller, for each model
  for (let trial = 1; trial <= K_TRIALS; trial++) {
    console.log(`\n===============================================================`);
    console.log(` >>> STARTING TRIAL REPLICATE [${trial}/${K_TRIALS}] ACROSS ALL CONTROLLERS`);
    console.log(`===============================================================`);

    for (const ctrl of controllers) {
      const ctrlBase = path.basename(ctrl, '.js');
      const sourceCode = fs.readFileSync(path.join(datasetDir, ctrl), 'utf-8');

      for (const model of models) {
        const trialDir = path.join(baseResultsDir, model.name, ctrlBase, `trial_${trial}`);
        const trialResultPath = path.join(trialDir, 'trial_result.json');

        // Resume support: skip already completed trials
        if (fs.existsSync(trialResultPath)) {
          console.log(`  [Trial ${trial} | ${ctrl} | ${model.name}] Already completed. Skipping.`);
          continue;
        }

        const startedAt = new Date().toISOString();
        console.log(`  [Trial ${trial} | ${ctrl} | ${model.name}] Dispatching request at ${startedAt}...`);

        const fetchResult = await model.fetcher(sourceCode, ctrl);

        if (fetchResult.fatalQuota) {
          console.error(`\n[ABORT] Stopping benchmark cleanly due to daily quota exhaustion.`);
          console.log(`Progress has been preserved. Run the script again to resume where it stopped.`);
          process.exit(0);
        }

        // Only thrown exceptions that exhausted all retries go to api_failures.jsonl
        if (fetchResult.thrownError) {
          const failureRecord = {
            model: model.name,
            controller: ctrl,
            trial,
            error: fetchResult.thrownError,
            timestamp: new Date().toISOString()
          };
          fs.appendFileSync(apiFailuresLogPath, JSON.stringify(failureRecord) + '\n', 'utf-8');
          console.log(`  └─ API call threw error (${fetchResult.thrownError}). Logged to api_failures.jsonl. Will retry on resume.`);
          continue;
        }

        if (!fs.existsSync(trialDir)) {
          fs.mkdirSync(trialDir, { recursive: true });
        }

        const rawResponse = fetchResult.rawText || '';
        const finishReason = fetchResult.finishReason || 'unknown';
        const isTruncated = finishReason === 'length' || finishReason === 'MAX_TOKENS';
        const isEmpty = rawResponse.trim() === '';

        // Provider identifiers
        const providerIdentifiers = model.name.startsWith('gemini')
          ? {
              modelVersion: fetchResult.modelVersion ?? null,
              responseId: fetchResult.responseId ?? null
            }
          : {
              model: fetchResult.model ?? null,
              system_fingerprint: fetchResult.system_fingerprint ?? null,
              id: fetchResult.id ?? null
            };

        // Save raw LLM response
        fs.writeFileSync(path.join(trialDir, 'raw_response.txt'), rawResponse, 'utf-8');

        let trialRecord = null;

        if (isEmpty) {
          // Model returned 200 OK but with empty response: record as completed failure
          const finishedAt = new Date().toISOString();
          const errorCategory = isTruncated ? 'truncated_output' : 'empty_response';

          trialRecord = {
            model: model.name,
            controller: ctrl,
            trial,
            startedAt,
            finishedAt,
            suiteOk: false,
            testsPassed: 0,
            testsFailed: 0,
            testsTotal: 0,
            errorCategory,
            statementCoverage: 0,
            branchCoverage: 0,
            functionCoverage: 0,
            lineCoverage: 0,
            finishReason,
            usage: fetchResult.usage || null,
            latencyMs: fetchResult.latencyMs || null
          };

          fs.writeFileSync(path.join(trialDir, 'response_meta.json'), JSON.stringify({
            finishReason,
            isTruncated,
            isEmpty,
            usage: fetchResult.usage || null,
            latencyMs: fetchResult.latencyMs || null,
            effectiveConfig: fetchResult.effectiveConfig || null,
            ...providerIdentifiers
          }, null, 2), 'utf-8');

          fs.writeFileSync(trialResultPath, JSON.stringify(trialRecord, null, 2), 'utf-8');
          console.log(`  └─ Result: FAIL (${errorCategory}) | Empty response returned from provider.`);
          continue;
        }

        // Clean and sanitize
        const cleaned = cleanCodeBlock(rawResponse);
        const sanitized = sanitizeImports(cleaned, ctrl);

        // Flat test file path for module resolution: tests_trials/<ctrl>_<model>_trial<k>.test.js
        const flatTestFileName = `${ctrlBase}_${model.name}_trial${trial}.test.js`;
        const flatTestFilePath = path.join(testsTrialsDir, flatTestFileName);

        fs.writeFileSync(flatTestFilePath, sanitized, 'utf-8');
        fs.writeFileSync(path.join(trialDir, 'test_suite.js'), sanitized, 'utf-8');

        // Execute Jest
        const jestRes = runJestOnTrial(flatTestFilePath, ctrl);

        // If response was truncated, override errorCategory to truncated_output
        if (isTruncated) {
          jestRes.errorCategory = 'truncated_output';
        }

        const finishedAt = new Date().toISOString();

        // Save artifacts
        fs.writeFileSync(path.join(trialDir, 'jest_output.json'), JSON.stringify(jestRes.rawJestOutput, null, 2), 'utf-8');
        fs.writeFileSync(path.join(trialDir, 'response_meta.json'), JSON.stringify({
          finishReason,
          isTruncated,
          isEmpty: false,
          usage: fetchResult.usage || null,
          latencyMs: fetchResult.latencyMs || null,
          effectiveConfig: fetchResult.effectiveConfig || null,
          ...providerIdentifiers
        }, null, 2), 'utf-8');

        trialRecord = {
          model: model.name,
          controller: ctrl,
          trial,
          startedAt,
          finishedAt,
          suiteOk: jestRes.suiteOk,
          testsPassed: jestRes.testsPassed,
          testsFailed: jestRes.testsFailed,
          testsTotal: jestRes.testsTotal,
          errorCategory: jestRes.errorCategory,
          statementCoverage: jestRes.statementCoverage,
          branchCoverage: jestRes.branchCoverage,
          functionCoverage: jestRes.functionCoverage,
          lineCoverage: jestRes.lineCoverage,
          finishReason,
          usage: fetchResult.usage || null,
          latencyMs: fetchResult.latencyMs || null
        };

        fs.writeFileSync(trialResultPath, JSON.stringify(trialRecord, null, 2), 'utf-8');

        const statusTag = jestRes.suiteOk ? 'PASS' : `FAIL (${jestRes.errorCategory})`;
        console.log(`  └─ Result: ${statusTag} | Pass: ${jestRes.testsPassed}/${jestRes.testsTotal} | Cov: ${jestRes.lineCoverage}% (Line), ${jestRes.statementCoverage}% (Stmt) | Finish: ${finishReason}`);
      }
    }
  }

  // Generate combined summary CSV
  generateSummaryCsv(baseResultsDir);

  console.log('\n===============================================================');
  console.log(` Benchmark Run Completed Successfully!`);
  console.log(` Results stored in: ${baseResultsDir}`);
  console.log('===============================================================');
}

// Only execute main when called directly via CLI
if (process.argv[1] && process.argv[1].endsWith('runner_trials.js')) {
  main().catch(err => {
    console.error('[FATAL ERROR]', err);
    process.exit(1);
  });
}
