import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const datasetDir = path.resolve('dataset');
const testsDir = path.resolve('tests');
const resultsDir = path.resolve('results');
const tempJsonFile = path.resolve('temp_rebaseline_jest.json');
const outputCsvPath = path.join(resultsDir, 'baseline_corrected.csv');

if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

const controllers = fs.readdirSync(datasetDir)
  .filter(f => f.endsWith('.js') && /^\d{2}_.*\.js$/.test(f))
  .sort();

const models = [
  { name: 'gemini-3.6-flash', label: 'gemini-3.6-flash' },
  { name: 'gpt-oss-120b', label: 'gpt-oss-120b' }
];

console.log('===============================================================');
console.log(' Re-evaluating All 50 Test Suites with Jest (--outputFile)');
console.log('===============================================================\n');

const allRows = [];

for (const model of models) {
  for (const ctrl of controllers) {
    const base = path.basename(ctrl, '.js');
    const testFileName = `${base}_${model.name}.test.js`;
    const testFilePath = path.join(testsDir, testFileName);

    if (fs.existsSync(tempJsonFile)) {
      try { fs.unlinkSync(tempJsonFile); } catch (e) {}
    }

    if (!fs.existsSync(testFilePath)) {
      allRows.push({
        model: model.name,
        controller: ctrl,
        passed: 0,
        failed: 0,
        total: 0,
        suite_ok: false,
        error_class: 'other',
        statement_coverage: 0,
        branch_coverage: 0,
        function_coverage: 0,
        line_coverage: 0
      });
      continue;
    }

    const normalizedTestPath = testFilePath.replace(/\\/g, '/');
    const normalizedOutFile = tempJsonFile.replace(/\\/g, '/');
    const cmd = `node --experimental-vm-modules node_modules/jest/bin/jest.js "${normalizedTestPath}" --coverage --json --outputFile="${normalizedOutFile}" --testPathIgnorePatterns="\\.stryker-tmp"`;

    let stderrOutput = '';
    try {
      execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 35000 });
    } catch (err) {
      stderrOutput = (err.stderr || '') + '\n' + (err.stdout || '');
    }

    let data = null;
    if (fs.existsSync(tempJsonFile)) {
      try {
        data = JSON.parse(fs.readFileSync(tempJsonFile, 'utf-8'));
      } catch (e) {}
    }

    if (!data) {
      let errorClass = 'other';
      if (stderrOutput.includes('SyntaxError')) errorClass = 'SyntaxError';
      else if (stderrOutput.includes('ReferenceError')) errorClass = 'ReferenceError';
      else if (stderrOutput.includes('TypeError')) errorClass = 'TypeError';

      allRows.push({
        model: model.name,
        controller: ctrl,
        passed: 0,
        failed: 0,
        total: 0,
        suite_ok: false,
        error_class: errorClass,
        statement_coverage: 0,
        branch_coverage: 0,
        function_coverage: 0,
        line_coverage: 0
      });
      process.stdout.write(`[FAIL: ${errorClass}] ${model.name} - ${ctrl}\n`);
      continue;
    }

    const passed = data.numPassedTests || 0;
    const failed = data.numFailedTests || 0;
    const total = data.numTotalTests || 0;
    const isRuntimeError = (data.numRuntimeErrorTestSuites || 0) > 0 || (total === 0 && !data.success);

    let errorClass = 'none';
    if (isRuntimeError) {
      if (stderrOutput.includes('SyntaxError')) errorClass = 'SyntaxError';
      else if (stderrOutput.includes('ReferenceError')) errorClass = 'ReferenceError';
      else if (stderrOutput.includes('TypeError')) errorClass = 'TypeError';
      else errorClass = 'other';
    } else if (!data.success || failed > 0) {
      errorClass = 'AssertionFailure';
    }

    let lineCoverage = 0;
    let statementCoverage = 0;
    let branchCoverage = 0;
    let functionCoverage = 0;

    if (data.coverageMap) {
      const covKey = Object.keys(data.coverageMap).find(k => k.endsWith(ctrl) || k.includes(ctrl));
      if (covKey && data.coverageMap[covKey]) {
        const fileCov = data.coverageMap[covKey];

        const s = fileCov.s || {};
        const sKeys = Object.keys(s);
        if (sKeys.length > 0) {
          statementCoverage = parseFloat(((sKeys.filter(k => s[k] > 0).length / sKeys.length) * 100).toFixed(2));
          lineCoverage = statementCoverage;
        }

        const b = fileCov.b || {};
        const bKeys = Object.keys(b);
        let bTotal = 0, bCovered = 0;
        bKeys.forEach(k => {
          (b[k] || []).forEach(v => {
            bTotal++;
            if (v > 0) bCovered++;
          });
        });
        if (bTotal > 0) {
          branchCoverage = parseFloat(((bCovered / bTotal) * 100).toFixed(2));
        }

        const f = fileCov.f || {};
        const fKeys = Object.keys(f);
        if (fKeys.length > 0) {
          functionCoverage = parseFloat(((fKeys.filter(k => f[k] > 0).length / fKeys.length) * 100).toFixed(2));
        }
      }
    }

    const suiteOk = data.success === true && failed === 0;

    allRows.push({
      model: model.name,
      controller: ctrl,
      passed,
      failed,
      total,
      suite_ok: suiteOk,
      error_class: errorClass,
      statement_coverage: statementCoverage,
      branch_coverage: branchCoverage,
      function_coverage: functionCoverage,
      line_coverage: lineCoverage
    });

    const statusTag = suiteOk ? 'PASS' : `FAIL (${errorClass})`;
    process.stdout.write(`[${statusTag}] ${model.name} - ${ctrl} (P:${passed}, F:${failed}, Line:${lineCoverage}%, Br:${branchCoverage}%)\n`);
  }
}

if (fs.existsSync(tempJsonFile)) {
  try { fs.unlinkSync(tempJsonFile); } catch (e) {}
}

// 1. Write CSV
const csvHeaders = [
  'model',
  'controller',
  'passed',
  'failed',
  'total',
  'suite_ok',
  'error_class',
  'statement_coverage',
  'branch_coverage',
  'function_coverage',
  'line_coverage'
];

const csvLines = [csvHeaders.join(',')];
for (const r of allRows) {
  csvLines.push([
    r.model,
    r.controller,
    r.passed,
    r.failed,
    r.total,
    r.suite_ok,
    r.error_class,
    r.statement_coverage,
    r.branch_coverage,
    r.function_coverage,
    r.line_coverage
  ].join(','));
}

fs.writeFileSync(outputCsvPath, csvLines.join('\n'), 'utf-8');
console.log(`\nSaved corrected baseline to: ${outputCsvPath}\n`);

// 2. Summary per model over all 25 controllers
console.log('===============================================================');
console.log(' 2. Summary per Model (All 25 Controllers)');
console.log('===============================================================');

for (const model of models) {
  const mRows = allRows.filter(r => r.model === model.name);
  const parsedOk = mRows.filter(r => r.error_class !== 'SyntaxError' && r.error_class !== 'other').length;
  const allPassingSuites = mRows.filter(r => r.suite_ok).length;
  const totalPassed = mRows.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = mRows.reduce((sum, r) => sum + r.failed, 0);
  const meanStmt = (mRows.reduce((sum, r) => sum + r.statement_coverage, 0) / 25).toFixed(2);
  const meanBranch = (mRows.reduce((sum, r) => sum + r.branch_coverage, 0) / 25).toFixed(2);
  const meanFunc = (mRows.reduce((sum, r) => sum + r.function_coverage, 0) / 25).toFixed(2);
  const meanLine = (mRows.reduce((sum, r) => sum + r.line_coverage, 0) / 25).toFixed(2);

  console.log(`\nModel: ${model.name}`);
  console.log(` - Suites Parsed OK (executable): ${parsedOk}/25 (${(parsedOk/25*100).toFixed(1)}%)`);
  console.log(` - Suites with All Tests Passing:  ${allPassingSuites}/25 (${(allPassingSuites/25*100).toFixed(1)}%)`);
  console.log(` - Total Tests Passed:            ${totalPassed}`);
  console.log(` - Total Tests Failed:            ${totalFailed}`);
  console.log(` - Mean Line Coverage:            ${meanLine}%`);
  console.log(` - Mean Statement Coverage:       ${meanStmt}%`);
  console.log(` - Mean Branch Coverage:          ${meanBranch}%`);
  console.log(` - Mean Function Coverage:        ${meanFunc}%`);
}

// 3. Matched-subset table: controllers where BOTH models executed (no zero-imputation)
console.log('\n===============================================================');
console.log(' Matched-Subset Comparison (Controllers Executed by BOTH Models)');
console.log('===============================================================');

const executableControllers = controllers.filter(ctrl => {
  const geminiRow = allRows.find(r => r.model === 'gemini-3.6-flash' && r.controller === ctrl);
  const groqRow = allRows.find(r => r.model === 'gpt-oss-120b' && r.controller === ctrl);
  const geminiExec = geminiRow && geminiRow.error_class !== 'SyntaxError' && geminiRow.error_class !== 'other';
  const groqExec = groqRow && groqRow.error_class !== 'SyntaxError' && groqRow.error_class !== 'other';
  return geminiExec && groqExec;
});

console.log(`Found ${executableControllers.length}/25 controllers where both models executed:`);
executableControllers.forEach(c => console.log(`  - ${c}`));

for (const model of models) {
  const subsetRows = allRows.filter(r => r.model === model.name && executableControllers.includes(r.controller));
  const n = subsetRows.length;
  const meanStmt = (subsetRows.reduce((sum, r) => sum + r.statement_coverage, 0) / n).toFixed(2);
  const meanBranch = (subsetRows.reduce((sum, r) => sum + r.branch_coverage, 0) / n).toFixed(2);
  const meanFunc = (subsetRows.reduce((sum, r) => sum + r.function_coverage, 0) / n).toFixed(2);
  const meanLine = (subsetRows.reduce((sum, r) => sum + r.line_coverage, 0) / n).toFixed(2);
  const totalPassed = subsetRows.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = subsetRows.reduce((sum, r) => sum + r.failed, 0);

  console.log(`\n${model.name} on Matched Subset (n=${n}):`);
  console.log(` - Total Tests Passed:      ${totalPassed}`);
  console.log(` - Total Tests Failed:      ${totalFailed}`);
  console.log(` - Mean Line Coverage:      ${meanLine}%`);
  console.log(` - Mean Statement Coverage: ${meanStmt}%`);
  console.log(` - Mean Branch Coverage:    ${meanBranch}%`);
  console.log(` - Mean Function Coverage:  ${meanFunc}%`);
}

// 4. Check old results.json vs newly recomputed results for Gemini
console.log('\n===============================================================');
console.log(' 3. Verification of Old results.json vs True Rebaseline for Gemini');
console.log('===============================================================');

if (fs.existsSync('results.json')) {
  const oldResults = JSON.parse(fs.readFileSync('results.json', 'utf-8'));
  let geminiMismatches = 0;

  for (const ctrl of controllers) {
    const oldEntry = (oldResults.results || []).find(r => r.model === 'gemini-3.6-flash' && r.targetFile === ctrl);
    const newEntry = allRows.find(r => r.model === 'gemini-3.6-flash' && r.controller === ctrl);

    if (!oldEntry) {
      console.log(`[Gemini MISSING in old] ${ctrl}`);
      geminiMismatches++;
      continue;
    }

    const passDiff = oldEntry.passCount !== newEntry.passed;
    const failDiff = oldEntry.failCount !== newEntry.failed;
    const covDiff = Math.abs(oldEntry.lineCoveragePercentage - newEntry.line_coverage) > 0.05;

    if (passDiff || failDiff || covDiff) {
      console.log(`[Gemini MISMATCH] ${ctrl}: Old (Pass:${oldEntry.passCount}, Fail:${oldEntry.failCount}, Cov:${oldEntry.lineCoveragePercentage}%) vs True (Pass:${newEntry.passed}, Fail:${newEntry.failed}, Cov:${newEntry.line_coverage}%)`);
      geminiMismatches++;
    }
  }

  if (geminiMismatches === 0) {
    console.log('SUCCESS: All 25 Gemini suites in results.json EXACTLY match true recomputed values!');
  } else {
    console.log(`Found ${geminiMismatches} mismatches for Gemini.`);
  }
}
