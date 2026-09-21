# Express.js Free-Tier LLM Unit Test Generation Benchmark

Companion repository for *"A Single-Run Empirical Comparison of Free-Tier LLMs
on Express.js Unit Test Generation and Line Coverage"* (Kanishk Bairagi).

This repo contains everything needed to reproduce the benchmark, and to
extend it into a repeated-trial study (see [Limitations](#limitations) below).

## Contents

- `dataset/` — 25 hand-authored Express.js controller modules (native ESM),
  covering the domains listed in Table I of the paper (auth, payment, cart,
  webhook, etc.)
- `run-benchmark.mjs` — evaluation harness: queries both models, sanitizes
  output, executes under Jest with `--experimental-vm-modules`, and
  aggregates results (single-run or repeated-trial mode)
- `results/` — raw and aggregated output from harness runs
- `express_llm_benchmark.tex` / `.pdf` — the paper itself

## Requirements

- Node.js >= 18
- `npm install jest --save-dev`
- API keys for both endpoints (both free-tier at time of writing):
  - `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/)
  - `GROQ_API_KEY` — [Groq Console](https://console.groq.com/)

## Running the benchmark

Single run (as reported in the paper):

```bash
GEMINI_API_KEY=... GROQ_API_KEY=... node run-benchmark.mjs --trials 1
```

Repeated-trial mode (recommended — see Limitations):

```bash
GEMINI_API_KEY=... GROQ_API_KEY=... node run-benchmark.mjs --trials 5
```

Output lands in `./results/raw-trials.json` and `./results/aggregated.{json,csv}`.

## Limitations

As discussed in the paper's Threats to Validity section, the results
reported are from a **single run per controller per model** ($k=1$,
temperature $T=0$). This harness supports repeated trials
(`--trials N`) specifically so this limitation can be addressed; PRs
with `k >= 3` result sets are welcome.

The benchmark dataset was hand-authored by the same person who ran the
evaluation, which is a known source of potential dataset-model alignment
bias — see the paper for full discussion.

## License

MIT (or your preferred license — add a LICENSE file before publishing)

## Citation

If you use this dataset or harness, please cite the accompanying paper.
