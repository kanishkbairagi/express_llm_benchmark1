import fs from 'fs';
import crypto from 'crypto';

function extractFunctionBody(code, funcName) {
  const regex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`);
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

const benchmarkCode = fs.readFileSync('benchmark.js', 'utf-8');
const runnerCode = fs.readFileSync('runner_trials.js', 'utf-8');

console.log('===============================================================');
console.log(' Function & Prompt Identity Verification');
console.log('===============================================================\n');

const functionsToTest = ['getSystemPrompt', 'cleanCodeBlock', 'sanitizeImports'];

for (const fn of functionsToTest) {
  const bBody = extractFunctionBody(benchmarkCode, fn);
  const rBody = extractFunctionBody(runnerCode, fn);

  const bNorm = normalizeCode(bBody);
  const rNorm = normalizeCode(rBody);

  const bHash = sha256(bNorm);
  const rHash = sha256(rNorm);

  const pass = bHash === rHash;
  console.log(`Function: ${fn}`);
  console.log(`  benchmark.js hash:    ${bHash}`);
  console.log(`  runner_trials.js hash: ${rHash}`);
  console.log(`  Status:               ${pass ? 'PASS (100% Identical)' : 'FAIL (Mismatch)'}\n`);
}

// User message template extraction
function extractUserMessageTemplate(code) {
  // Looks for `Target controller: ../dataset/...`
  const match = code.match(/Target controller:\s*\.\.\/dataset\/[^`"']+/);
  return match ? normalizeCode(match[0]) : null;
}

const bMsg = extractUserMessageTemplate(benchmarkCode);
const rMsg = extractUserMessageTemplate(runnerCode);
const bMsgHash = sha256(bMsg || '');
const rMsgHash = sha256(rMsg || '');
const msgPass = bMsgHash === rMsgHash;

console.log(`User Message Template:`);
console.log(`  benchmark.js template:    "${bMsg}"`);
console.log(`  runner_trials.js template: "${rMsg}"`);
console.log(`  benchmark.js hash:        ${bMsgHash}`);
console.log(`  runner_trials.js hash:    ${rMsgHash}`);
console.log(`  Status:                   ${msgPass ? 'PASS (100% Identical)' : 'FAIL (Mismatch)'}\n`);

console.log('===============================================================');
console.log(' System Prompt in benchmark.js vs Paper Discrepancy Check');
console.log('===============================================================');

// Extract exact string inside getSystemPrompt
const sysPromptMatch = benchmarkCode.match(/function\s+getSystemPrompt\([^)]*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/);
const benchmarkPromptText = sysPromptMatch ? sysPromptMatch[1].trim() : 'NOT_FOUND';

console.log('\nExact system prompt in benchmark.js:');
console.log('---------------------------------------------------------------');
console.log(benchmarkPromptText);
console.log('---------------------------------------------------------------');

const paperPromptText = `Write a complete, executable Jest unit test file for the following Express.js controller. Requirements: 1) Use ES Module syntax (import/export). 2) Explicitly import { jest } from '@jest/globals'. 3) Mock all external dependencies, Express req, res, and next objects. 4) Ensure high statement and branch coverage. Return ONLY executable code inside a JavaScript code block.`;

console.log('\nPrompt printed in manuscript.tex (line 147):');
console.log('---------------------------------------------------------------');
console.log(paperPromptText);
console.log('---------------------------------------------------------------');

const promptsMatch = normalizeCode(benchmarkPromptText) === normalizeCode(paperPromptText);
console.log(`\nDo they match? ${promptsMatch ? 'YES' : 'NO - MAJOR DISCREPANCY'}`);
