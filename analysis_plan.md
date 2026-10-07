# Statistical Analysis Plan

**Pre-registration Date:** 2026-10-04  
**Project:** Express.js LLM Unit Test Generation Benchmark  

---

## 1. Set A Analysis Plan (Synthetic Benchmark Dataset)

### 1.1 Completeness & Integrity
- Count of `(model, controller, trial)` tuples across $k=5$ trials for 25 controllers and both models (`gemini-3.6-flash`, `gpt-oss-120b`).
- Validation of raw artifacts: `trial_result.json`, `jest_output.json`, `response_meta.json`, `raw_response.txt`, `test_suite.js`.

### 1.2 Summary Statistics per Model and per Trial
- Executable test suites, fully passing test suites (`suiteOk = true`), and total test counts (passed/failed).
- Mean statement, line, branch, and function coverage computed over executable test suites.
- Secondary analysis: Mean coverage over all 25 suites with non-executable suites assigned zero coverage (labeled SECONDARY).
- Aggregate metrics: Mean $\pm$ SD across the 5 repeated trials.

### 1.3 Primary Hypothesis Testing & Paired Comparison
- **Unit of Analysis:** Controller ($n=25$).
- **Trial Aggregation:** For each controller, compute the mean metric across trials.
  - Primary: Evaluated across controllers where suites executed for both models.
  - Sensitivity A: Trial-level matching (average only over trials where both models executed; include all controllers with $\ge 1$ matched trial).
  - Sensitivity B: All 25 controllers with non-executable suites imputed as zero (SECONDARY).
- **Outcomes:** Line coverage, branch coverage, function coverage, strict mutation score ($killed / total$), and Stryker mutation score ($(killed + timeout) / total$).
- **Statistical Tests:**
  - Mean difference ($\text{Gemini} - \text{Groq}$).
  - Exact two-sided Wilcoxon signed-rank test reporting $n$, ties (zero differences), and $p$-value.
  - 95% cluster-bootstrap confidence interval (resampling controllers, 10,000 resamples).
  - Multiplicity adjustment: Holm-Bonferroni correction across the primary outcomes.
- **Mutation Evaluation:** Evaluated on controller-trials where test suites fully passed (`suiteOk = true`).

### 1.4 Suite Reliability, Failure Modes, and Token Efficiency
- Suite success rate per model with controller-level bootstrap CI.
- Proportion of controllers exhibiting between-trial success flipping.
- Categorization of failures by `errorCategory` and `finishReason`.
- Measured token consumption (prompt tokens, completion tokens, reasoning/thinking tokens, total output tokens).

---

## 2. Addendum: External Evaluation Dataset (Set B) — 2026-10-04
*(Written before any Set B test generation)*

- **Sample Size / Repetitions:** Set B uses $k=3$ trials per controller per model.
- **Generation Settings:** Identical prompt (`getSystemPrompt`), runtime settings, model configurations, and token cap as Set A.
- **Unit of Analysis:** The unit of analysis is the controller.
- **Clustering & Resampling:** Because up to 3 files originate from any single repository, the 95% bootstrap confidence interval resamples repositories (clusters), not individual files.
- **Statistical Testing & Multiplicity:** Same primary outcomes (line coverage, branch coverage, function coverage, strict mutation score, Stryker mutation score), exact two-sided Wilcoxon signed-rank test, and the same Holm-Bonferroni correction across primary outcomes.
- **Descriptive Metrics:** Repository star counts are reported descriptively.
- **Limitations:** Potential training data contamination risk for popular public repositories is an explicitly stated limitation.
- **Deviations:** Any protocol deviation during execution must be logged in `LAB_NOTEBOOK.md`.
Post-hoc (written after seeing Set B failure breakdowns): failure classification table; no change to primary analysis.
Post-hoc (written after seeing Set B results): 'executable' in the registered analysis counted suites that crashed before running any test; sensitivity C restricts to suites with at least one test run. Primary analysis unchanged.
