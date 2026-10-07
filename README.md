# Express.js Free-Tier LLM Unit Test Generation Benchmark

Empirical evaluation benchmarking `gemini-3.6-flash` and `gpt-oss-120b` (via Groq) on automated unit test generation for Express.js controllers in native ES Modules.

## Study Overview

This repository contains a repeated-trial benchmark evaluating two models across two controller suites:

- **Set A**: 25 author-written Express.js controllers (`dataset/*.js`), evaluated over 5 repeated trials per model ($k=5$, 250 total trials).
- **Set B**: 25 external Express.js controllers from 13 public GitHub repositories (`dataset/external/`, registered in `external_manifest.json`), evaluated over 3 repeated trials per model ($k=3$, 150 total trials).

### Evaluation Configuration
- **Sampling Parameters**: Provider-default sampling (temperature, top-p, top-k; neither model was queried with forced $T=0$).
- **Token Cap**: 32,768 max output tokens per request.
- **Execution & Test Framework**: Jest ESM (`--experimental-vm-modules`) and StrykerJS mutation testing.

## Manuscript & Documentation

- Current study manuscript and tables: [`paper/main.tex`](paper/main.tex) and [`paper/tables/`](paper/tables/).
- **Superseded Single-Run Notice**: The earlier single-run manuscript has been archived and superseded. See [`archive/superseded_single_run/SUPERSEDED.md`](archive/superseded_single_run/SUPERSEDED.md) for details on known errors in that preliminary draft.
