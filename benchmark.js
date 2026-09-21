process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const google = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const groq = new OpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY
});

const MODELS = [
  { name: 'gemini-3.6-flash', label: 'Gemini', fetchFn: getGeminiTest },
  { name: 'gpt-oss-120b', label: 'Groq', fetchFn: getGroqTest }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getSystemPrompt(targetFilename) {
  return `You are a Senior QA Automation Engineer. Output only valid Jest unit tests using ES Module syntax. Always import target functions using relative path '../dataset/${targetFilename}'. Return ONLY valid JavaScript code in a clean markdown block (\`\`\`javascript ... \`\`\`). Do NOT include any conversational filler, explanations, markdown text outside the code block, or questions.`;
}

async function getGeminiTest(sourceCode, targetFilename, maxRetries = 5) {
  const prompt = getSystemPrompt(targetFilename);

  // Pre-call sleep to stay within free-tier RPM limits (~3s between calls)
  await sleep(3000);

  let quotaRetries = 0;
  const maxQuotaRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await google.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: `Target controller: ../dataset/${targetFilename}\n\nCode to test:\n${sourceCode}`,
        config: {
          systemInstruction: prompt
        }
      });
      return cleanCodeBlock(response.text);
    } catch (err) {
      const errMsg = err.message || '';
      const isQuotaError = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') ||
                           errMsg.includes('quota') || errMsg.includes('Quota');

      if (isQuotaError && quotaRetries < maxQuotaRetries) {
        quotaRetries++;
        console.log(`  [Gemini] Quota/rate-limit hit (attempt ${attempt}). Waiting 10s before retry ${quotaRetries}/${maxQuotaRetries}...`);
        await sleep(10000);
      } else if (!isQuotaError && attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`  [Gemini] Temporary error (${errMsg.slice(0, 60)}...). Retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        console.error(`  [Gemini] Failed after ${attempt} attempts:`, errMsg);
        return null;
      }
    }
  }
}

async function getGroqTest(sourceCode, targetFilename, maxRetries = 5) {
  const prompt = getSystemPrompt(targetFilename);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Target controller: ../dataset/${targetFilename}\n\nCode to test:\n${sourceCode}` }
        ]
      });
      return cleanCodeBlock(response.choices[0]?.message?.content);
    } catch (err) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`  [Groq] Temporary error (${err.message.slice(0, 60)}...). Retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        console.error(`  [Groq] Failed after ${maxRetries} attempts:`, err.message);
        return null;
      }
    }
  }
}

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

function runJestTest(testFilePath, targetFilename) {
  const normalizedTestPath = testFilePath.replace(/\\/g, '/');
  const jestCommand = `node --experimental-vm-modules node_modules/jest/bin/jest.js "${normalizedTestPath}" --coverage --json`;

  let outputText = '';
  try {
    outputText = execSync(jestCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 35000
    });
  } catch (err) {
    outputText = (err.stdout || '') + '\n' + (err.stderr || '');
  }

  const jsonMatch = outputText.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      passCount: 0,
      failCount: 0,
      lineCoveragePercentage: 0,
      executionStatus: 'SYNTAX_OR_RUNTIME_ERROR'
    };
  }

  try {
    const data = JSON.parse(jsonMatch[0]);
    const passCount = data.numPassedTests || 0;
    const failCount = data.numFailedTests || 0;
    const isRuntimeError =
      (data.numRuntimeErrorTestSuites || 0) > 0 || (data.numTotalTests === 0 && !data.success);

    let lineCoveragePercentage = 0;
    if (data.coverageMap) {
      const covKey = Object.keys(data.coverageMap).find(
        (k) => k.endsWith(targetFilename) || k.includes(targetFilename)
      );

      if (covKey && data.coverageMap[covKey]) {
        const statements = data.coverageMap[covKey].s || {};
        const statementKeys = Object.keys(statements);
        const covered = statementKeys.filter((k) => statements[k] > 0).length;
        const total = statementKeys.length;
        if (total > 0) {
          lineCoveragePercentage = parseFloat(((covered / total) * 100).toFixed(2));
        }
      }
    }

    return {
      passCount,
      failCount,
      lineCoveragePercentage,
      executionStatus: isRuntimeError ? 'SYNTAX_OR_RUNTIME_ERROR' : 'SUCCESS'
    };
  } catch (err) {
    return {
      passCount: 0,
      failCount: 0,
      lineCoveragePercentage: 0,
      executionStatus: 'SYNTAX_OR_RUNTIME_ERROR'
    };
  }
}

function computeAggregateMetrics(results) {
  const modelStats = {};

  for (const model of MODELS) {
    const modelResults = results.filter((r) => r.model === model.name);
    const total = modelResults.length;
    const successRuns = modelResults.filter((r) => r.executionStatus === 'SUCCESS');
    const syntaxErrors = modelResults.filter((r) => r.executionStatus === 'SYNTAX_OR_RUNTIME_ERROR').length;
    const totalPassed = modelResults.reduce((sum, r) => sum + r.passCount, 0);
    const totalFailed = modelResults.reduce((sum, r) => sum + r.failCount, 0);
    const totalAssertions = totalPassed + totalFailed;

    const meanCoverage =
      total > 0
        ? parseFloat((modelResults.reduce((sum, r) => sum + r.lineCoveragePercentage, 0) / total).toFixed(2))
        : 0;

    const passRate = totalAssertions > 0 ? parseFloat(((totalPassed / totalAssertions) * 100).toFixed(2)) : 0;
    const syntaxErrorRate = total > 0 ? parseFloat(((syntaxErrors / total) * 100).toFixed(2)) : 0;

    modelStats[model.name] = {
      evaluatedControllers: total,
      totalTestAssertionsPassed: totalPassed,
      totalTestAssertionsFailed: totalFailed,
      testPassRatePercentage: passRate,
      syntaxOrRuntimeErrorCount: syntaxErrors,
      syntaxErrorRatePercentage: syntaxErrorRate,
      meanLineCoveragePercentage: meanCoverage
    };
  }

  return modelStats;
}

function saveResults(results) {
  const modelSummary = computeAggregateMetrics(results);
  const finalOutput = {
    benchmarkTimestamp: new Date().toISOString(),
    totalControllers: new Set(results.map((r) => r.targetFile)).size,
    totalEvaluations: results.length,
    models: modelSummary,
    results
  };

  const resultsPath = path.join(process.cwd(), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(finalOutput, null, 2), 'utf-8');
}

async function runBenchmark() {
  console.log('===============================================================');
  console.log(' Starting Automated Express.js LLM Unit Test Benchmark');
  console.log('===============================================================\n');

  const datasetDir = path.join(process.cwd(), 'dataset');
  const testsDir = path.join(process.cwd(), 'tests');

  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
  }

  const files = fs
    .readdirSync(datasetDir)
    .filter((f) => f.endsWith('.js') && /^\d{2}_.*\.js$/.test(f))
    .sort();

  console.log(`Found ${files.length} controllers inside ./dataset/ to evaluate:\n`);
  files.forEach((f) => console.log(` - ${f}`));
  console.log('');

  const allResults = [];

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const controllerName = path.basename(filename, '.js');
    const controllerPath = path.join(datasetDir, filename);
    const sourceCode = fs.readFileSync(controllerPath, 'utf-8');

    const progressHeader = `[${i + 1}/${files.length}] Processed [${filename}]`;
    const statusLogs = [];

    for (const model of MODELS) {
      const testFileName = `${controllerName}_${model.name}.test.js`;
      const testFilePath = path.join(testsDir, testFileName);

      let testFileReady = false;
      const forceRegenerate = process.env.FORCE_REGENERATE === 'true';

      if (fs.existsSync(testFilePath) && !forceRegenerate) {
        testFileReady = true;
      } else {
        const generatedRaw = await model.fetchFn(sourceCode, filename);
        if (generatedRaw) {
          const sanitizedCode = sanitizeImports(generatedRaw, filename);
          fs.writeFileSync(testFilePath, sanitizedCode, 'utf-8');
          testFileReady = true;
        }
      }

      if (!testFileReady) {
        allResults.push({
          targetFile: filename,
          model: model.name,
          passCount: 0,
          failCount: 0,
          lineCoveragePercentage: 0,
          executionStatus: 'SYNTAX_OR_RUNTIME_ERROR'
        });
        statusLogs.push(`${model.label}: FAIL (Generation Error)`);
        saveResults(allResults);
        continue;
      }

      // Run Jest on each generated test individually
      const evalResult = runJestTest(testFilePath, filename);

      allResults.push({
        targetFile: filename,
        model: model.name,
        passCount: evalResult.passCount,
        failCount: evalResult.failCount,
        lineCoveragePercentage: evalResult.lineCoveragePercentage,
        executionStatus: evalResult.executionStatus
      });

      const outcome = evalResult.executionStatus === 'SUCCESS' ? 'PASS' : 'FAIL';
      statusLogs.push(
        `${model.label}: ${outcome} (${evalResult.lineCoveragePercentage}% cov, ${evalResult.passCount} pass, ${evalResult.failCount} fail)`
      );

      saveResults(allResults);

      await sleep(100);
    }

    console.log(`${progressHeader} | ${statusLogs.join(' | ')}`);
  }

  saveResults(allResults);

  console.log('\n===============================================================');
  console.log(' Benchmark Completed Successfully!');
  console.log('===============================================================\n');

  const summary = computeAggregateMetrics(allResults);
  console.table(summary);
  console.log('\nResults saved to ./results.json and 50 test files saved to ./tests/');
}

runBenchmark();