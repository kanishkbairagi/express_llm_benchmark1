import fs from 'fs';
import crypto from 'crypto';

function extractFunctionBody(code, funcName) {
  const regex = new RegExp(`export\\s+function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = code.match(regex);
  if (!match) return null;
  return match[1];
}

function normalizeCode(str) {
  if (!str) return '';
  return str
    .replace(/\/\/[^\n]*/g, '') // remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove multi-line comments
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const runnerTrialsCode = fs.readFileSync('runner_trials.js', 'utf-8');
const runnerExternalCode = fs.readFileSync('runner_trials_external.js', 'utf-8');

console.log('===============================================================');
console.log(' Function & Prompt Identity Verification: Set A vs Set B');
console.log(' (runner_trials.js vs runner_trials_external.js)');
console.log('===============================================================\n');

const functionsToTest = ['getSystemPrompt', 'cleanCodeBlock', 'sanitizeImports'];

let allPass = true;

for (const fn of functionsToTest) {
  const aBody = extractFunctionBody(runnerTrialsCode, fn);
  const bBody = extractFunctionBody(runnerExternalCode, fn);

  const aNorm = normalizeCode(aBody);
  const bNorm = normalizeCode(bBody);

  const aHash = sha256(aNorm);
  const bHash = sha256(bNorm);

  const pass = aHash === bHash;
  if (!pass) allPass = false;
  console.log(`Function: ${fn}`);
  console.log(`  runner_trials.js hash:          ${aHash}`);
  console.log(`  runner_trials_external.js hash: ${bHash}`);
  console.log(`  Status:                         ${pass ? 'PASS (100% Identical)' : 'FAIL (Mismatch)'}\n`);
}

// User message template extraction
function extractUserMessageTemplate(code) {
  // Looks for `Target controller: ../dataset/...`
  const match = code.match(/Target controller:\s*\.\.\/dataset\/[^`"']+/);
  return match ? normalizeCode(match[0]) : null;
}

const aMsg = extractUserMessageTemplate(runnerTrialsCode);
const bMsg = extractUserMessageTemplate(runnerExternalCode);
const aMsgHash = sha256(aMsg || '');
const bMsgHash = sha256(bMsg || '');
const msgPass = aMsgHash === bMsgHash;
if (!msgPass) allPass = false;

console.log(`User Message Template:`);
console.log(`  runner_trials.js template:          "${aMsg}"`);
console.log(`  runner_trials_external.js template: "${bMsg}"`);
console.log(`  runner_trials.js hash:              ${aMsgHash}`);
console.log(`  runner_trials_external.js hash:     ${bMsgHash}`);
console.log(`  Status:                             ${msgPass ? 'PASS (100% Identical)' : 'FAIL (Mismatch)'}\n`);

console.log('===============================================================');
console.log(`OVERALL IDENTITY VERIFICATION: ${allPass ? 'ALL 4 ITEMS PASS (100% IDENTICAL)' : 'FAIL'}`);
console.log('===============================================================');
