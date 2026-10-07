/**
 * stryker_trials_external.js
 *
 * Runs Stryker mutation testing for Set B external repeated-trial benchmark suites.
 * Loops over models ('gemini-3.6-flash', 'gpt-oss-120b') and trials (1..3).
 *
 * For each model and trial:
 * - Mutates only external controllers where trial_result.json has suiteOk === true.
 * - Mutates only the target controller file under dataset/external/<owner>__<repo>/<path>, not its dependencies.
 * - Resolves controller dependencies in Stryker sandbox.
 * - Narrows Jest testMatch to exactly those passing suites in tests_trials_external/.
 * - Writes reports to reports/mutation_trials_external/<model>/trial_<k>/
 * - Writes CSV to results/mutation_external/<model>_trial<k>.csv
 * - Skips any model/trial whose CSV already exists.
 *
 * Usage:
 *   node stryker_trials_external.js [--model <name>] [--trial <1-3>] [--test-one]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;

const datasetDir = path.join(projectRoot, 'dataset');
const resultsTrialsDir = path.join(projectRoot, 'results', 'trials_external');
const testsTrialsDir = path.join(projectRoot, 'tests_trials_external');
const resultsMutationDir = path.join(projectRoot, 'results', 'mutation_external');
const reportsMutationTrialsDir = path.join(projectRoot, 'reports', 'mutation_trials_external');

const ALL_MODELS = ['gemini-3.6-flash', 'gpt-oss-120b'];
const ALL_TRIALS = [1, 2, 3];

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

// Ensure results/mutation_external and reports/mutation_trials_external exist
if (!fs.existsSync(resultsMutationDir)) {
  fs.mkdirSync(resultsMutationDir, { recursive: true });
}
if (!fs.existsSync(reportsMutationTrialsDir)) {
  fs.mkdirSync(reportsMutationTrialsDir, { recursive: true });
}

// Load Set B external controllers from manifest
const manifestPath = path.join(projectRoot, 'external_manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`external_manifest.json not found at: ${manifestPath}`);
}
const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

const allControllers = manifestData.map(item => {
  const repoFolder = item.repo_url.replace('https://github.com/', '').replace('/', '__');
  const targetFilename = `external/${repoFolder}/${item.file_path}`;
  const safeId = `${repoFolder}__${path.basename(item.file_path, '.js')}`;
  return {
    safeId,
    targetFilename,
    fullDiskPath: path.join(datasetDir, targetFilename)
  };
}).sort((a, b) => a.safeId.localeCompare(b.safeId));

console.log('===============================================================');
console.log(' Stryker Mutation Testing Harness for Set B External Benchmark');
console.log('===============================================================');
console.log(`Controllers: ${allControllers.length} external controllers found in external_manifest.json`);
console.log(`Models:      ${selectedModels.join(', ')}`);
console.log(`Trials:      ${selectedTrials.join(', ')}`);
console.log(`Results dir: ${resultsMutationDir}`);
console.log(`Reports dir: ${reportsMutationTrialsDir}\n`);

// Helper to look up mutants for a controller from mutation.json
function getFileMutants(filesObj, targetFilename) {
  if (!filesObj) return [];
  const targetKey = `dataset/${targetFilename.replace(/\\/g, '/')}`;
  for (const [key, val] of Object.entries(filesObj)) {
    const normalizedKey = key.replace(/\\/g, '/');
    if (normalizedKey === targetKey || normalizedKey.endsWith(targetKey) || normalizedKey.endsWith(targetFilename.replace(/\\/g, '/'))) {
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
    const trialResultPath = path.join(resultsTrialsDir, model, ctrl.safeId, `trial_${trial}`, 'trial_result.json');

    let suiteOk = false;
    if (fs.existsSync(trialResultPath)) {
      try {
        const tr = JSON.parse(fs.readFileSync(trialResultPath, 'utf-8'));
        suiteOk = tr.suiteOk === true;
      } catch (e) {
        console.error(`Error reading ${trialResultPath}:`, e.message);
      }
    }

    controllerStatusMap.set(ctrl.safeId, suiteOk);
    if (suiteOk) {
      runnableControllers.push(ctrl);
    }
  }

  console.log(`Runnable controllers (suiteOk=true): ${runnableControllers.length}/${allControllers.length}`);
  const notRunnableCount = allControllers.length - runnableControllers.length;
  if (notRunnableCount > 0) {
    const notRunnableList = allControllers.filter(c => !controllerStatusMap.get(c.safeId)).map(c => c.safeId);
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

    // Mutate ONLY the target controller file under dataset/external/<owner>__<repo>/<path>, not its dependencies
    const mutateGlobs = runnableControllers.map(c => `dataset/${c.targetFilename.replace(/\\/g, '/')}`);
    const testMatchGlobs = runnableControllers.map(c => {
      return `**/tests_trials_external/${c.safeId}_${model}_trial${trial}.test.js`;
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
        "tests/**",
        "tests_trials/**"
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
    const isRunnable = controllerStatusMap.get(ctrl.safeId);

    if (!isRunnable) {
      // Controllers whose suite did not fully pass get status "not_runnable", no score, and NO zeros
      rows.push([
        ctrl.safeId,
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
      const mutants = getFileMutants(mutationJsonData?.files, ctrl.targetFilename);
      const killed = mutants.filter(m => m.status === 'Killed').length;
      const timeout = mutants.filter(m => m.status === 'Timeout').length;
      const survived = mutants.filter(m => m.status === 'Survived').length;
      const noCoverage = mutants.filter(m => m.status === 'NoCoverage').length;
      const total = killed + timeout + survived + noCoverage;

      const mutation_score_strict = total > 0 ? (killed / total) : '';
      const mutation_score_stryker = total > 0 ? ((killed + timeout) / total) : '';

      rows.push([
        ctrl.safeId,
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
  console.error('Fatal error in stryker_trials_external.js:', err);
  process.exit(1);
});
