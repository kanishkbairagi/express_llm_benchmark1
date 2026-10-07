/**
 * baseline_naive.js
 *
 * Deterministic baseline test generator and runner for Express.js controllers.
 * Evaluates Set A (dataset/*.js, 25 controllers) and Set B (external_manifest.json, 25 controllers).
 *
 * For each controller, generates a Jest ESM test file in tests_baseline/ that:
 *  - Imports the controller via relative path
 *  - Discovers all exported functions (named exports, or functions on default object, skipping Router instances)
 *  - Calls each function with 3 fixed mock cases:
 *      (1) Empty req/res/next mocks
 *      (2) req with empty body, params, query
 *      (3) req with a user object
 *  - Awaits each call inside try/catch with a 2-second timeout
 *  - Asserts that the call settled (returned or threw) without hanging
 *  - Does not mock any dependencies
 *
 * Runs each generated file using the exact Jest command and coverage-extraction logic
 * as runner_trials.js and runner_trials_external.js.
 *
 * Outputs:
 *   results/baseline_naive/baseline_setA.csv
 *   results/baseline_naive/baseline_setB.csv
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const projectRoot = process.cwd();
const testsBaselineDir = path.join(projectRoot, 'tests_baseline');
const resultsBaselineDir = path.join(projectRoot, 'results', 'baseline_naive');
const datasetDir = path.join(projectRoot, 'dataset');
const manifestPath = path.join(projectRoot, 'external_manifest.json');

// Ensure output directories exist
if (!fs.existsSync(testsBaselineDir)) {
  fs.mkdirSync(testsBaselineDir, { recursive: true });
}
if (!fs.existsSync(resultsBaselineDir)) {
  fs.mkdirSync(resultsBaselineDir, { recursive: true });
}

// ─── Test Generator Template ─────────────────────────────────────────────────
function generateTestContent(relImportPath) {
  return `import * as controllerModule from '${relImportPath}';

function isExpressRouter(fn) {
  if (typeof fn !== 'function') return false;
  if (fn.name === 'router') return true;
  if (Array.isArray(fn.stack)) return true;
  if (typeof fn.use === 'function' && typeof fn.route === 'function') return true;
  return false;
}

function createMockRes() {
  const res = {};
  res.status = function() { return res; };
  res.json = function() { return res; };
  res.send = function() { return res; };
  res.end = function() { return res; };
  res.cookie = function() { return res; };
  res.redirect = function() { return res; };
  res.sendStatus = function() { return res; };
  res.setHeader = function() { return res; };
  res.header = function() { return res; };
  res.type = function() { return res; };
  res.contentType = function() { return res; };
  res.location = function() { return res; };
  return res;
}

function createMockNext() {
  return function() {};
}

function runWithTimeout(fn, req, res, next, ms = 2000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let done = false;

    timer = setTimeout(() => {
      done = true;
      reject(new Error(\`Timed out after \${ms}ms\`));
    }, ms);

    try {
      Promise.resolve(fn(req, res, next))
        .then((val) => {
          if (!done) {
            clearTimeout(timer);
            resolve({ status: 'resolved', value: val });
          }
        })
        .catch((err) => {
          if (!done) {
            clearTimeout(timer);
            resolve({ status: 'rejected', error: err });
          }
        });
    } catch (syncErr) {
      if (!done) {
        clearTimeout(timer);
        resolve({ status: 'rejected', error: syncErr });
      }
    }
  });
}

const targetFunctions = [];

// Named exports
for (const [key, value] of Object.entries(controllerModule)) {
  if (key === 'default') continue;
  if (typeof value === 'function' && !isExpressRouter(value)) {
    targetFunctions.push({ name: key, fn: value });
  }
}

// Functions on default export object or default function
if (controllerModule.default) {
  if (typeof controllerModule.default === 'function' && !isExpressRouter(controllerModule.default)) {
    targetFunctions.push({ name: 'default', fn: controllerModule.default });
  } else if (typeof controllerModule.default === 'object' && controllerModule.default !== null) {
    for (const [key, value] of Object.entries(controllerModule.default)) {
      if (typeof value === 'function' && !isExpressRouter(value)) {
        targetFunctions.push({ name: \`default.\${key}\`, fn: value });
      }
    }
  }
}

const seenFns = new Set();
const uniqueTargets = [];
for (const target of targetFunctions) {
  if (!seenFns.has(target.fn)) {
    seenFns.add(target.fn);
    uniqueTargets.push(target);
  }
}

describe('Naive baseline tests', () => {
  for (const { name, fn } of uniqueTargets) {
    describe(\`Function: \${name}\`, () => {
      test('case 1: empty req/res/next mocks', async () => {
        const req = {};
        const res = createMockRes();
        const next = createMockNext();
        let settled = false;
        try {
          await runWithTimeout(fn, req, res, next, 2000);
          settled = true;
        } catch (err) {
          settled = false;
        }
        expect(settled).toBe(true);
      });

      test('case 2: req with empty body, params and query', async () => {
        const req = { body: {}, params: {}, query: {} };
        const res = createMockRes();
        const next = createMockNext();
        let settled = false;
        try {
          await runWithTimeout(fn, req, res, next, 2000);
          settled = true;
        } catch (err) {
          settled = false;
        }
        expect(settled).toBe(true);
      });

      test('case 3: req with a user object', async () => {
        const req = {
          user: { id: 'test-user-id', _id: 'test-user-id', role: 'admin', email: 'test@example.com' },
          body: {},
          params: {},
          query: {}
        };
        const res = createMockRes();
        const next = createMockNext();
        let settled = false;
        try {
          await runWithTimeout(fn, req, res, next, 2000);
          settled = true;
        } catch (err) {
          settled = false;
        }
        expect(settled).toBe(true);
      });
    });
  }
});
`;
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
    const normalizedTarget = targetFilename.replace(/\\/g, '/');
    const covKey = Object.keys(data.coverageMap).find(k => {
      const normalizedKey = k.replace(/\\/g, '/');
      return normalizedKey.endsWith(normalizedTarget) || normalizedKey.includes(normalizedTarget);
    });

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

// ─── Main Execution ──────────────────────────────────────────────────────────
function main() {
  console.log('======================================================================');
  console.log(' Running Naive Baseline Generator & Runner');
  console.log('======================================================================\n');

  // 1. Process Set A
  console.log('>>> [1/2] Generating and running Set A controllers...');
  const setAFiles = fs.readdirSync(datasetDir)
    .filter(f => f.endsWith('.js') && /^\d{2}_.*\.js$/.test(f))
    .sort();

  const setAResults = [];

  for (let i = 0; i < setAFiles.length; i++) {
    const ctrlFile = setAFiles[i];
    const ctrlBase = path.basename(ctrlFile, '.js');
    const testFileName = `setA__${ctrlBase}.test.js`;
    const testFilePath = path.join(testsBaselineDir, testFileName);
    const relImport = `../dataset/${ctrlFile}`;

    // Generate test
    fs.writeFileSync(testFilePath, generateTestContent(relImport), 'utf-8');

    // Run test
    const res = runJestOnTrial(testFilePath, ctrlFile);
    console.log(`  [Set A ${i + 1}/${setAFiles.length}] ${ctrlFile}: suiteOk=${res.suiteOk}, tests=${res.testsPassed}/${res.testsTotal}, lineCov=${res.lineCoverage}%`);

    setAResults.push({
      controller: ctrlFile,
      suiteOk: res.suiteOk,
      testsPassed: res.testsPassed,
      testsFailed: res.testsFailed,
      testsTotal: res.testsTotal,
      errorCategory: res.errorCategory,
      statementCoverage: res.statementCoverage,
      lineCoverage: res.lineCoverage,
      branchCoverage: res.branchCoverage,
      functionCoverage: res.functionCoverage
    });
  }

  // Write Set A CSV
  const setACsvPath = path.join(resultsBaselineDir, 'baseline_setA.csv');
  const csvHeader = 'controller,suiteOk,testsPassed,testsFailed,testsTotal,errorCategory,statementCoverage,lineCoverage,branchCoverage,functionCoverage\n';
  const setACsvBody = setAResults.map(r => 
    `${r.controller},${r.suiteOk},${r.testsPassed},${r.testsFailed},${r.testsTotal},${r.errorCategory},${r.statementCoverage},${r.lineCoverage},${r.branchCoverage},${r.functionCoverage}`
  ).join('\n');
  fs.writeFileSync(setACsvPath, csvHeader + setACsvBody + '\n', 'utf-8');
  console.log(`Saved Set A results to: ${setACsvPath}\n`);

  // 2. Process Set B
  console.log('>>> [2/2] Generating and running Set B controllers...');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`external_manifest.json not found at: ${manifestPath}`);
  }
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const setBResults = [];

  for (let i = 0; i < manifestData.length; i++) {
    const item = manifestData[i];
    const repoFolder = item.repo_url.replace('https://github.com/', '').replace('/', '__');
    const targetFilename = `external/${repoFolder}/${item.file_path}`;
    const safeId = `${repoFolder}__${path.basename(item.file_path, '.js')}`;
    const testFileName = `setB__${safeId}.test.js`;
    const testFilePath = path.join(testsBaselineDir, testFileName);
    const relImport = `../dataset/${targetFilename}`;

    // Generate test
    fs.writeFileSync(testFilePath, generateTestContent(relImport), 'utf-8');

    // Run test
    const res = runJestOnTrial(testFilePath, targetFilename);
    console.log(`  [Set B ${i + 1}/${manifestData.length}] ${safeId}: suiteOk=${res.suiteOk}, tests=${res.testsPassed}/${res.testsTotal}, lineCov=${res.lineCoverage}%`);

    setBResults.push({
      controller: safeId,
      suiteOk: res.suiteOk,
      testsPassed: res.testsPassed,
      testsFailed: res.testsFailed,
      testsTotal: res.testsTotal,
      errorCategory: res.errorCategory,
      statementCoverage: res.statementCoverage,
      lineCoverage: res.lineCoverage,
      branchCoverage: res.branchCoverage,
      functionCoverage: res.functionCoverage
    });
  }

  // Write Set B CSV
  const setBCsvPath = path.join(resultsBaselineDir, 'baseline_setB.csv');
  const setBCsvBody = setBResults.map(r => 
    `${r.controller},${r.suiteOk},${r.testsPassed},${r.testsFailed},${r.testsTotal},${r.errorCategory},${r.statementCoverage},${r.lineCoverage},${r.branchCoverage},${r.functionCoverage}`
  ).join('\n');
  fs.writeFileSync(setBCsvPath, csvHeader + setBCsvBody + '\n', 'utf-8');
  console.log(`Saved Set B results to: ${setBCsvPath}\n`);

  console.log('======================================================================');
  console.log(' Naive Baseline Execution Complete');
  console.log('======================================================================');
}

main();
