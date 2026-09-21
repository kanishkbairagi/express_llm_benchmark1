/**
 * benchmark_gemini_resume.js
 *
 * Runs the Gemini model ONLY on controllers 06_user_controller.js through
 * 25_health_controller.js. Loads existing results.json, replaces (or inserts)
 * the Gemini entries for those files, saves back to results.json.
 *
 * Usage:  node benchmark_gemini_resume.js
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

// ─── Constants ───────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-3.6-flash';
const RESUME_FROM_FILE = '06_user_controller.js'; // inclusive start
const MODEL_NAME = GEMINI_MODEL;

const google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const datasetDir = path.resolve('dataset');
const testsDir   = path.resolve('tests');
const resultsPath = path.resolve('results.json');

// ─── System Prompt ────────────────────────────────────────────────────────────
function getSystemPrompt(targetFilename) {
  return (
    `You are a Senior QA Automation Engineer. Output only valid Jest unit tests using ES Module syntax. ` +
    `Always import target functions using relative path '../dataset/${targetFilename}'. ` +
    `Return ONLY valid JavaScript code in a clean markdown block (\`\`\`javascript ... \`\`\`). ` +
    `Do NOT include any conversational filler, explanations, markdown text outside the code block, or questions.`
  );
}

// ─── Code Sanitization ───────────────────────────────────────────────────────
function cleanCodeBlock(rawText) {
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

function sanitizeImports(testCode, targetFilename) {
  if (!testCode) return '';
  const targetRelativePath = `../dataset/${targetFilename}`;
  const baseName = targetFilename.replace(/\.js$/, '');
  const escapedBase = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  let s = testCode;

  // Strip residual fences
  s = s.replace(/^```(?:js|javascript)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // Inject jest globals for ES Module compat
  if (/\bjest\./.test(s) && !s.includes('@jest/globals')) {
    s = `import { jest } from '@jest/globals';\n` + s;
  }

  // Rewrite controller-matching imports
  const importTargetRegex = new RegExp(`from\\s+['"][^'"]*${escapedBase}(\\.js)?['"]`, 'g');
  s = s.replace(importTargetRegex, `from '${targetRelativePath}'`);

  // Rewrite common generic hallucinated names
  s = s.replace(
    /from\s+['"]\.\/(?:userController|controller|sample-controller|authController|productController)(\.js)?['"]/g,
    `from '${targetRelativePath}'`
  );

  // Ensure .js extension on dataset imports
  s = s.replace(/from\s+['"](\.\.\/dataset\/[^'"]+?)(?<!\.js)['"]/g, "from '$1.js'");

  return s;
}

// ─── Gemini API Call ─────────────────────────────────────────────────────────
async function getGeminiTest(sourceCode, targetFilename) {
  const prompt = getSystemPrompt(targetFilename);

  // Pre-call sleep: respect free-tier RPM (20 req/min = 1 req per 3s)
  await sleep(3000);

  let quotaRetries = 0;
  const maxQuotaRetries = 3;
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await google.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Target controller: ../dataset/${targetFilename}\n\nCode to test:\n${sourceCode}`,
        config: { systemInstruction: prompt }
      });
      return cleanCodeBlock(response.text);
    } catch (err) {
      const errMsg = err.message || '';
      const isQuota = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') ||
                      errMsg.includes('quota') || errMsg.includes('Quota');

      if (isQuota && quotaRetries < maxQuotaRetries) {
        quotaRetries++;
        console.log(`  [Gemini] ⏳ Quota hit (attempt ${attempt}). Waiting 10s... (quota retry ${quotaRetries}/${maxQuotaRetries})`);
        await sleep(10000);
      } else if (!isQuota && attempt < maxAttempts) {
        const waitTime = attempt * 3000;
        console.log(`  [Gemini] ⚠️  Transient error: ${errMsg.slice(0, 80)}. Retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        console.error(`  [Gemini] ❌ Failed after ${attempt} attempts: ${errMsg.slice(0, 120)}`);
        return null;
      }
    }
  }
  return null;
}

// ─── Jest Runner ─────────────────────────────────────────────────────────────
function runJestTest(testFilePath, targetFilename) {
  const normalized = testFilePath.replace(/\\/g, '/');
  const cmd = `node --experimental-vm-modules node_modules/jest/bin/jest.js "${normalized}" --coverage --json`;

  let out = '';
  try {
    out = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 40000 });
  } catch (err) {
    out = (err.stdout || '') + '\n' + (err.stderr || '');
  }

  const jsonMatch = out.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
  if (!jsonMatch) {
    return { passCount: 0, failCount: 0, lineCoveragePercentage: 0, executionStatus: 'SYNTAX_OR_RUNTIME_ERROR' };
  }

  try {
    const data = JSON.parse(jsonMatch[0]);
    const passCount = data.numPassedTests || 0;
    const failCount = data.numFailedTests || 0;
    const isRtError = (data.numRuntimeErrorTestSuites || 0) > 0 || (data.numTotalTests === 0 && !data.success);

    let lineCoveragePercentage = 0;
    if (data.coverageMap) {
      const covKey = Object.keys(data.coverageMap).find(
        (k) => k.endsWith(targetFilename) || k.includes(targetFilename)
      );
      if (covKey) {
        const s = data.coverageMap[covKey].s || {};
        const keys = Object.keys(s);
        const covered = keys.filter((k) => s[k] > 0).length;
        if (keys.length > 0) lineCoveragePercentage = parseFloat(((covered / keys.length) * 100).toFixed(2));
      }
    }

    return {
      passCount, failCount, lineCoveragePercentage,
      executionStatus: isRtError ? 'SYNTAX_OR_RUNTIME_ERROR' : 'SUCCESS'
    };
  } catch {
    return { passCount: 0, failCount: 0, lineCoveragePercentage: 0, executionStatus: 'SYNTAX_OR_RUNTIME_ERROR' };
  }
}

// ─── Aggregate Metrics ───────────────────────────────────────────────────────
function computeAggregateMetrics(results) {
  const modelNames = [...new Set(results.map((r) => r.model))];
  const modelStats = {};

  for (const modelName of modelNames) {
    const mr = results.filter((r) => r.model === modelName);
    const total = mr.length;
    const syntaxErrors = mr.filter((r) => r.executionStatus === 'SYNTAX_OR_RUNTIME_ERROR').length;
    const totalPassed  = mr.reduce((s, r) => s + r.passCount, 0);
    const totalFailed  = mr.reduce((s, r) => s + r.failCount, 0);
    const totalAsserts = totalPassed + totalFailed;
    const meanCoverage = total > 0
      ? parseFloat((mr.reduce((s, r) => s + r.lineCoveragePercentage, 0) / total).toFixed(2))
      : 0;

    modelStats[modelName] = {
      evaluatedControllers: total,
      totalTestAssertionsPassed: totalPassed,
      totalTestAssertionsFailed: totalFailed,
      testPassRatePercentage: totalAsserts > 0 ? parseFloat(((totalPassed / totalAsserts) * 100).toFixed(2)) : 0,
      syntaxOrRuntimeErrorCount: syntaxErrors,
      syntaxErrorRatePercentage: total > 0 ? parseFloat(((syntaxErrors / total) * 100).toFixed(2)) : 0,
      meanLineCoveragePercentage: meanCoverage
    };
  }
  return modelStats;
}

// ─── Save Helper ─────────────────────────────────────────────────────────────
function saveResults(allResults) {
  const modelSummary = computeAggregateMetrics(allResults);
  const output = {
    benchmarkTimestamp: new Date().toISOString(),
    totalControllers: new Set(allResults.map((r) => r.targetFile)).size,
    totalEvaluations: allResults.length,
    models: modelSummary,
    results: allResults
  };
  fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2), 'utf-8');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=================================================================');
  console.log(' Gemini Resume Benchmark — Controllers 06 through 25');
  console.log('=================================================================\n');

  if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

  // Load existing results
  let existingResults = [];
  if (fs.existsSync(resultsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
      existingResults = parsed.results || [];
      console.log(`Loaded ${existingResults.length} existing result entries from results.json.\n`);
    } catch {
      console.warn('Could not parse existing results.json — starting fresh.\n');
    }
  }

  // Get the target file list
  const allFiles = fs.readdirSync(datasetDir)
    .filter((f) => /^\d{2}_.*\.js$/.test(f))
    .sort();

  const startIdx = allFiles.findIndex((f) => f === RESUME_FROM_FILE);
  if (startIdx === -1) {
    console.error(`Could not find starting file: ${RESUME_FROM_FILE}`);
    process.exit(1);
  }

  const targetFiles = allFiles.slice(startIdx);
  console.log(`Will run Gemini on ${targetFiles.length} controllers:\n`);
  targetFiles.forEach((f) => console.log(` - ${f}`));
  console.log('');

  // Working copy of all results — we'll upsert Gemini entries as we go
  const workingResults = [...existingResults];

  const upsertResult = (entry) => {
    const idx = workingResults.findIndex(
      (r) => r.targetFile === entry.targetFile && r.model === entry.model
    );
    if (idx > -1) {
      workingResults[idx] = entry;
    } else {
      workingResults.push(entry);
    }
  };

  for (let i = 0; i < targetFiles.length; i++) {
    const filename = targetFiles[i];
    const controllerName = path.basename(filename, '.js');
    const sourceCode = fs.readFileSync(path.join(datasetDir, filename), 'utf-8');

    const testFileName = `${controllerName}_${MODEL_NAME}.test.js`;
    const testFilePath = path.join(testsDir, testFileName);

    const existingEntry = workingResults.find(
      (r) => r.targetFile === filename && r.model === MODEL_NAME && r.executionStatus === 'SUCCESS' && r.lineCoveragePercentage > 0
    );
    if (existingEntry && fs.existsSync(testFilePath)) {
      console.log(`[${i + 1}/${targetFiles.length}] Already completed: ${filename} (Cov: ${existingEntry.lineCoveragePercentage}%, Pass: ${existingEntry.passCount}). Skipping re-generation.\n`);
      continue;
    }

    console.log(`[${i + 1}/${targetFiles.length}] Generating Gemini test for: ${filename}`);

    const rawCode = await getGeminiTest(sourceCode, filename);
    const sanitized = sanitizeImports(rawCode, filename);

    if (!sanitized) {
      const entry = {
        targetFile: filename, model: MODEL_NAME,
        passCount: 0, failCount: 0,
        lineCoveragePercentage: 0,
        executionStatus: 'SYNTAX_OR_RUNTIME_ERROR',
        note: 'Generation failed (quota/API error)'
      };
      upsertResult(entry);
      saveResults(workingResults);
      console.log(`  └─ Gemini: FAIL (Generation Error)\n`);
      continue;
    }

    fs.writeFileSync(testFilePath, sanitized, 'utf-8');

    const evalResult = runJestTest(testFilePath, filename);
    const entry = {
      targetFile: filename, model: MODEL_NAME,
      passCount: evalResult.passCount,
      failCount: evalResult.failCount,
      lineCoveragePercentage: evalResult.lineCoveragePercentage,
      executionStatus: evalResult.executionStatus
    };

    upsertResult(entry);
    saveResults(workingResults);

    const outcome = evalResult.executionStatus === 'SUCCESS' ? '✅ PASS' : '❌ FAIL';
    console.log(
      `  └─ Gemini: ${outcome} | Cov: ${evalResult.lineCoveragePercentage}% | ` +
      `Pass: ${evalResult.passCount} | Fail: ${evalResult.failCount}\n`
    );
  }

  console.log('=================================================================');
  console.log(' Gemini Resume Benchmark COMPLETE');
  console.log('=================================================================\n');

  const summary = computeAggregateMetrics(workingResults);
  console.table(summary);
  console.log('\nFull metrics saved to ./results.json');
}

main();
