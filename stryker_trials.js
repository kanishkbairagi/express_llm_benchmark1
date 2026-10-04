/**
 * stryker_trials.js
 *
 * Runs Stryker mutation testing for repeated-trial benchmark suites.
 * Loops over models ('gemini-3.6-flash', 'gpt-oss-120b') and trials (1..5).
 *
 * For each model and trial:
 * - Mutates only controllers where trial_result.json has suiteOk === true.
 * - Narrows Jest testMatch to exactly those passing suites in tests_trials/.
 * - Writes reports to reports/mutation_trials/<model>/trial_<k>/
 * - Writes CSV to results/mutation/<model>_trial<k>.csv
 * - Skips any model/trial whose CSV already exists.
 *
 * Usage:
 *   node stryker_trials.js [--model <name>] [--trial <1-5>] [--test-one]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;

const datasetDir = path.join(projectRoot, 'dataset');
const resultsTrialsDir = path.join(projectRoot, 'results', 'trials');
const resultsMutationDir = path.join(projectRoot, 'results', 'mutation');
const reportsMutationTrialsDir = path.join(projectRoot, 'reports', 'mutation_trials');

const ALL_MODELS = ['gemini-3.6-flash', 'gpt-oss-120b'];
const ALL_TRIALS = [1, 2, 3, 4, 5];

// Parse CLI args
const args = process.argv.slice(2);
let selectedModels = ALL_MODELS;
let selectedTrials = ALL_TRIALS;

if (args.includes('--test-one')) {
  selectedModels = ['gemini-3.6-flash'];
  selectedTrials = [1];
} else {
  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1 && args[modelIdx + 1]) {
    selectedModels = [args[modelIdx + 1]];
  }
  const trialIdx = args.indexOf('--trial');
  if (trialIdx !== -1 && args[trialIdx + 1]) {
    selectedTrials = [parseInt(args[trialIdx + 1], 10)];
  }
}

// Ensure results/mutation directory exists
if (!fs.existsSync(resultsMutationDir)) {
  fs.mkdirSync(resultsMutationDir, { recursive: true });
}

// Get all 25 controllers sorted
const allControllers = fs.readdirSync(datasetDir)
  .filter(f => f.endsWith('.js') && /^\d{2}_.*\.js$/.test(f))
  .sort();

console.log('===============================================================');
console.log(' Stryker Mutation Testing Harness for Repeated-Trial Benchmark');
console.log('===============================================================');
console.log(`Controllers: ${allControllers.length} controllers found in dataset/`);
console.log(`Models:      ${selectedModels.join(', ')}`);
console.log(`Trials:      ${selectedTrials.join(', ')}`);
console.log(`Results dir: ${resultsMutationDir}`);
console.log(`Reports dir: ${reportsMutationTrialsDir}\n`);

// Helper to look up mutants for a controller from mutation.json
function getFileMutants(filesObj, ctrlFileName) {
  if (!filesObj) return [];
  const targetKey1 = `dataset/${ctrlFileName}`;
  for (const [key, val] of Object.entries(filesObj)) {
    const normalizedKey = key.replace(/\\/g, '/');
    if (normalizedKey === targetKey1 || normalizedKey.endsWith(`/${ctrlFileName}`)) {
      return val.mutants || [];
    }
  }
  return [];
}

async function runTrialMutation(model, trial) {
  const csvFileName = `${model}_trial${trial}.csv`;
  const csvPath = path.join(resultsMutationDir, csvFileName);

  console.log(`\n---------------------------------------------------------------`);
  console.log(`Processing Model: ${model} | Trial: ${trial}`);
  console.log(`---------------------------------------------------------------`);

  // Skip if CSV already exists
  if (fs.existsSync(csvPath)) {
    console.log(`[SKIP] CSV already exists: ${csvPath}`);
    return { skipped: true, csvPath };
  }

  // Determine passing and failing controllers
  const runnableControllers = [];
  const controllerStatusMap = new Map();

  for (const ctrl of allControllers) {
    const ctrlBase = path.basename(ctrl, '.js');
    const trialResultPath = path.join(resultsTrialsDir, model, ctrlBase, `trial_${trial}`, 'trial_result.json');

    let suiteOk = false;
    if (fs.existsSync(trialResultPath)) {
      try {
        const tr = JSON.parse(fs.readFileSync(trialResultPath, 'utf-8'));
        suiteOk = tr.suiteOk === true;
      } catch (e) {
        console.error(`Error reading ${trialResultPath}:`, e.message);
      }
    }

    controllerStatusMap.set(ctrl, suiteOk);
    if (suiteOk) {
      runnableControllers.push(ctrl);
    }
  }

  console.log(`Runnable controllers (suiteOk=true): ${runnableControllers.length}/${allControllers.length}`);
  const notRunnableCount = allControllers.length - runnableControllers.length;
  if (notRunnableCount > 0) {
    const notRunnableList = allControllers.filter(c => !controllerStatusMap.get(c));
    console.log(`Not runnable controllers (${notRunnableCount}): ${notRunnableList.join(', ')}`);
  }

  const reportDir = path.join(reportsMutationTrialsDir, model, `trial_${trial}`);
  const htmlReportPath = path.join(reportDir, 'mutation.html').replace(/\\/g, '/');
  const jsonReportPath = path.join(reportDir, 'mutation.json').replace(/\\/g, '/');

  let mutationJsonData = null;

  if (runnableControllers.length > 0) {
    // Generate temporary Stryker config
    const tempConfigFileName = `stryker.tmp.${model}_trial${trial}.json`;
    const tempConfigPath = path.join(projectRoot, tempConfigFileName);

    const mutateGlobs = runnableControllers.map(c => `dataset/${c}`);
    const testMatchGlobs = runnableControllers.map(c => {
      const ctrlBase = path.basename(c, '.js');
      return `**/tests_trials/${ctrlBase}_${model}_trial${trial}.test.js`;
    });

    const strykerConfig = {
      $schema: "https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/api/schema/stryker-core.json",
      testRunner: "jest",
      plugins: [
        "@stryker-mutator/jest-runner"
      ],
      mutate: mutateGlobs,
      testRunnerNodeArgs: [
        "--experimental-vm-modules"
      ],
      reporters: [
        "html",
        "clear-text",
        "json"
      ],
      htmlReporter: {
        fileName: htmlReportPath
      },
      jsonReporter: {
        fileName: jsonReportPath
      },
      concurrency: 4,
      timeoutMS: 5000,
      timeoutFactor: 1.5,
      thresholds: {
        high: 80,
        low: 60,
        break: null
      },
      ignorePatterns: [
        "node_modules/**",
        "build/**",
        "dist/**",
        "coverage/**",
        ".stryker-tmp/**",
        "tests/**"
      ],
      jest: {
        projectType: "custom",
        config: {
          testMatch: testMatchGlobs,
          transform: {}
        }
      }
    };

    fs.writeFileSync(tempConfigPath, JSON.stringify(strykerConfig, null, 2), 'utf-8');
    console.log(`Created temporary Stryker config: ${tempConfigFileName}`);

    try {
      console.log(`Executing Stryker on ${runnableControllers.length} controllers...`);
      const strykerBin = path.resolve(projectRoot, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');
      const res = spawnSync(process.execPath, [strykerBin, 'run', tempConfigFileName], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: { ...process.env }
      });

      if (res.error) {
        console.error('Stryker process error:', res.error);
      }
    } finally {
      // Clean up temporary config file
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
        console.log(`Cleaned up temporary config: ${tempConfigFileName}`);
      }
    }

    // Read generated mutation.json
    if (fs.existsSync(jsonReportPath)) {
      mutationJsonData = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));
      console.log(`Successfully parsed mutation report: ${jsonReportPath}`);
    } else {
      console.error(`ERROR: Mutation report not found at ${jsonReportPath}`);
    }
  }

  // Construct CSV rows
  const headers = [
    'controller',
    'status',
    'killed',
    'timeout',
    'survived',
    'noCoverage',
    'total',
    'mutation_score_strict',
    'mutation_score_stryker'
  ];

  const rows = [];

  for (const ctrl of allControllers) {
    const isRunnable = controllerStatusMap.get(ctrl);

    if (!isRunnable) {
      // Controllers whose suite did not fully pass get status "not_runnable", no score, and NO zeros
      rows.push([
        ctrl,
        'not_runnable',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ]);
    } else {
      const mutants = getFileMutants(mutationJsonData?.files, ctrl);
      const killed = mutants.filter(m => m.status === 'Killed').length;
      const timeout = mutants.filter(m => m.status === 'Timeout').length;
      const survived = mutants.filter(m => m.status === 'Survived').length;
      const noCoverage = mutants.filter(m => m.status === 'NoCoverage').length;
      const total = killed + timeout + survived + noCoverage;

      const mutation_score_strict = total > 0 ? (killed / total) : '';
      const mutation_score_stryker = total > 0 ? ((killed + timeout) / total) : '';

      rows.push([
        ctrl,
        'ok',
        killed,
        timeout,
        survived,
        noCoverage,
        total,
        mutation_score_strict,
        mutation_score_stryker
      ]);
    }
  }

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(csvPath, csvContent, 'utf-8');
  console.log(`Mutation results CSV written to: ${csvPath}`);

  return { skipped: false, csvPath, jsonReportPath };
}

async function main() {
  for (const model of selectedModels) {
    for (const trial of selectedTrials) {
      await runTrialMutation(model, trial);
    }
  }
  console.log('\n===============================================================');
  console.log(' Stryker Mutation Testing Run Finished');
  console.log('===============================================================');
}

main().catch(err => {
  console.error('Fatal error in stryker_trials.js:', err);
  process.exit(1);
});
