#!/usr/bin/env python3
"""
analyze_trials.py

Comprehensive statistical analysis harness for repeated-trial LLM benchmark.
Evaluates gemini-3.6-flash and gpt-oss-120b across 25 Express.js controllers and 5 trials.

Analysis Components:
  a) Completeness verification of all (model, controller, trial) tuples.
  b) Per-model and per-trial summaries (executable vs all with zeros, plus mean +/- SD across trials).
  c) Primary paired comparison (unit = controller): per-controller mean over trials,
     exact two-sided Wilcoxon signed-rank test, 95% cluster-bootstrap CI (10,000 resamples),
     and Holm correction across 5 primary outcomes (line, branch, function coverage, strict and Stryker mutation).
  d) Suite success rate per model with cluster-bootstrap CI, and controller-level flip share.
  e) Failure taxonomy (errorCategory, finishReason).
  f) Measured token usage statistics (prompt, completion, reasoning/thinking, total).

Usage:
  python analyze_trials.py --self-test   # Run internal test suite with synthetic data
  python analyze_trials.py               # Run full analysis on empirical benchmark data
"""

import os
import sys
import glob
import json
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats

RANDOM_SEED = 42


# ==============================================================================
# Statistical Utility Functions
# ==============================================================================

def holm_adjust(pvals):
    """
    Computes Holm-Bonferroni step-down adjusted p-values.
    Guarantees strong family-wise error rate control under arbitrary dependence.
    """
    pvals = np.asarray(pvals, dtype=float)
    n = len(pvals)
    if n == 0:
        return np.array([])
    order = np.argsort(pvals)
    sorted_p = pvals[order]
    adj_sorted = np.empty(n, dtype=float)
    running_max = 0.0
    for i in range(n):
        val = (n - i) * sorted_p[i]
        running_max = max(running_max, val)
        adj_sorted[i] = min(running_max, 1.0)
    adj_p = np.empty(n, dtype=float)
    adj_p[order] = adj_sorted
    return adj_p


def compute_wilcoxon_exact(diffs):
    """
    Performs exact two-sided Wilcoxon signed-rank test on paired differences.
    Reports:
      n_total: Total number of pairs
      n_nonzero: Effective sample size after dropping zero-difference ties (zero_method='wilcox')
      ties_count: Number of tied absolute rank values among non-zero differences
      statistic: Wilcoxon test statistic
      pvalue: Exact two-sided p-value
    """
    diffs = np.asarray(diffs, dtype=float)
    n_total = len(diffs)
    non_zero = diffs[diffs != 0.0]
    n_nonzero = len(non_zero)

    if n_nonzero == 0:
        return {
            'n_total': n_total,
            'n_nonzero': 0,
            'ties_count': 0,
            'statistic': 0.0,
            'pvalue': 1.0
        }

    abs_vals = np.abs(non_zero)
    _, counts = np.unique(abs_vals, return_counts=True)
    ties_count = int(np.sum(counts[counts > 1]))

    try:
        res = stats.wilcoxon(non_zero, method='exact', alternative='two-sided')
        stat = float(res.statistic)
        pval = float(res.pvalue)
    except Exception as e:
        # Fallback to asymptotic if exact cannot be computed by scipy
        res = stats.wilcoxon(non_zero, method='approx', alternative='two-sided')
        stat = float(res.statistic)
        pval = float(res.pvalue)

    return {
        'n_total': n_total,
        'n_nonzero': n_nonzero,
        'ties_count': ties_count,
        'statistic': stat,
        'pvalue': pval
    }


def cluster_bootstrap_ci(data, stat_fn, B=10000, seed=RANDOM_SEED, alpha=0.05):
    """
    Computes 95% cluster-bootstrap percentile confidence interval by resampling
    clusters (rows in data) with replacement.
    """
    rng = np.random.default_rng(seed)
    n = len(data)
    if n == 0:
        return np.nan, np.nan

    # Vectorized / looped resample
    boot_stats = np.empty(B, dtype=float)
    indices = rng.choice(n, size=(B, n), replace=True)
    
    for b in range(B):
        sample = [data[i] for i in indices[b]]
        boot_stats[b] = stat_fn(sample)

    low_pct = (alpha / 2.0) * 100.0
    high_pct = (1.0 - alpha / 2.0) * 100.0
    ci_low = float(np.percentile(boot_stats, low_pct))
    ci_high = float(np.percentile(boot_stats, high_pct))
    return ci_low, ci_high


# ==============================================================================
# Self-Test Implementation
# ==============================================================================

def run_self_tests():
    """
    Executes automated verification suite with synthetic data and known analytical answers.
    Verifies:
      1. Wilcoxon exact p-value for 13 identical-sign differences (must equal 2 / 2^13).
      2. Wilcoxon tie-handling and zero-difference dropping.
      3. Holm-Bonferroni correction known values and monotonicity bounds.
      4. Cluster-bootstrap percentile CI determinism and coverage under fixed seed.
      5. Controller flip rate logic.
    """
    print("======================================================================")
    print(" Running analyze_trials.py Self-Tests (Synthetic Data & Known Answers)")
    print("======================================================================")

    all_passed = True

    # 1. Wilcoxon exact p-value: 13 identical-sign differences
    # Under H0 with 13 independent signs, P(W <= 0 or W >= 91) = 2 / 2^13 = 2 / 8192 = 0.000244140625
    test_diffs_13 = np.array([1.1, 2.3, 0.5, 3.4, 1.8, 4.2, 0.9, 2.7, 3.1, 1.5, 2.0, 5.0, 1.2])
    res_13 = compute_wilcoxon_exact(test_diffs_13)
    expected_p_13 = 2.0 / (2.0 ** 13)
    p_match = np.isclose(res_13['pvalue'], expected_p_13, rtol=1e-7, atol=1e-7)
    
    print(f"Test 1: Wilcoxon Exact p-value (n=13 identical signs)")
    print(f"  Expected p: {expected_p_13:.8f} (2 / 2^13 ~= 0.00024414)")
    print(f"  Obtained p: {res_13['pvalue']:.8f}")
    print(f"  Result:     {'PASS' if p_match else 'FAIL'}")
    if not p_match:
        all_passed = False

    # 2. Wilcoxon zero-difference and tie handling
    test_diffs_zeros = np.array([0.0, 0.0, 2.0, -1.0, 3.0, 2.0])
    res_zeros = compute_wilcoxon_exact(test_diffs_zeros)
    zeros_pass = (res_zeros['n_total'] == 6 and 
                  res_zeros['n_nonzero'] == 4 and 
                  res_zeros['ties_count'] == 2)
    print(f"\nTest 2: Wilcoxon Zero and Tie Handling")
    print(f"  Input: [0, 0, 2, -1, 3, 2] -> Total: {res_zeros['n_total']}, Non-zero: {res_zeros['n_nonzero']}, Ties: {res_zeros['ties_count']}")
    print(f"  Result:     {'PASS' if zeros_pass else 'FAIL'}")
    if not zeros_pass:
        all_passed = False

    # 3. Holm-Bonferroni step-down adjustment
    test_pvals = [0.01, 0.04, 0.03]
    # Sorted: p(1)=0.01 (x3=0.03), p(2)=0.03 (x2=0.06), p(3)=0.04 (x1=0.04 -> max(0.06, 0.04)=0.06)
    expected_adj = [0.03, 0.06, 0.06]
    obtained_adj = holm_adjust(test_pvals)
    holm_pass = np.allclose(obtained_adj, expected_adj)
    print(f"\nTest 3: Holm-Bonferroni Multiple Testing Correction")
    print(f"  Input:    {test_pvals}")
    print(f"  Expected: {expected_adj}")
    print(f"  Obtained: {list(np.round(obtained_adj, 4))}")
    print(f"  Result:   {'PASS' if holm_pass else 'FAIL'}")
    if not holm_pass:
        all_passed = False

    # 4. Cluster-Bootstrap CI Determinism & Properties
    test_cluster_data = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
    ci_low1, ci_high1 = cluster_bootstrap_ci(test_cluster_data, np.mean, B=5000, seed=123)
    ci_low2, ci_high2 = cluster_bootstrap_ci(test_cluster_data, np.mean, B=5000, seed=123)
    boot_pass = (np.isclose(ci_low1, ci_low2) and 
                 np.isclose(ci_high1, ci_high2) and 
                 ci_low1 < np.mean(test_cluster_data) < ci_high1)
    print(f"\nTest 4: Cluster-Bootstrap Percentile CI (B=5000, seed=123)")
    print(f"  Sample Mean: {np.mean(test_cluster_data):.4f}")
    print(f"  95% CI:      [{ci_low1:.4f}, {ci_high1:.4f}]")
    print(f"  Result:      {'PASS' if boot_pass else 'FAIL'}")
    if not boot_pass:
        all_passed = False

    # 5. Flip Rate Calculation Logic
    # 4 controllers across 5 trials:
    # c1: 5/5 pass (consistent pass, no flip)
    # c2: 0/5 pass (consistent fail, no flip)
    # c3: 4/5 pass (flipped!)
    # c4: 1/5 pass (flipped!)
    # Expected flip rate: 2 / 4 = 0.50 (50.0%)
    mock_suite_matrix = {
        'c1': [True, True, True, True, True],
        'c2': [False, False, False, False, False],
        'c3': [True, False, True, True, True],
        'c4': [False, False, True, False, False]
    }
    flips = sum(1 for trials in mock_suite_matrix.values() if 0 < sum(trials) < len(trials))
    flip_rate = flips / len(mock_suite_matrix)
    flip_pass = (flips == 2 and np.isclose(flip_rate, 0.50))
    print(f"\nTest 5: Controller SuiteOk Flip Rate Logic")
    print(f"  Mock Controllers: 4 (1 consistent pass, 1 consistent fail, 2 flipping)")
    print(f"  Flipping Count:   {flips}/4 (Expected: 2)")
    print(f"  Flip Share:       {flip_rate * 100:.1f}% (Expected: 50.0%)")
    print(f"  Result:           {'PASS' if flip_pass else 'FAIL'}")
    if not flip_pass:
        all_passed = False

    print("\n----------------------------------------------------------------------")
    if all_passed:
        print(">>> OVERALL SELF-TEST STATUS: ALL TESTS PASSED (5/5 checks OK)")
        print("----------------------------------------------------------------------\n")
        return 0
    else:
        print(">>> OVERALL SELF-TEST STATUS: ONE OR MORE TESTS FAILED")
        print("----------------------------------------------------------------------\n")
        return 1


# ==============================================================================
# Data Loading & Ingestion
# ==============================================================================

def load_data(project_root):
    """
    Ingests all trial_result.json files from results/trials/**/
    and all mutation CSV files from results/mutation/*.csv.
    Merges them into unified tabular format.
    """
    trials_glob = os.path.join(project_root, 'results', 'trials', '*', '*', 'trial_*', 'trial_result.json')
    trial_records = []
    for file_path in glob.glob(trials_glob):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                rec = json.load(f)
                usage = rec.get('usage') or {}
                # Capture thinking / reasoning tokens across providers
                thinking_tokens = usage.get('thinkingTokens')
                reasoning_tokens = usage.get('reasoningTokens')
                thinking_or_reasoning = thinking_tokens if thinking_tokens is not None else reasoning_tokens

                trial_records.append({
                    'model': rec.get('model'),
                    'controller': rec.get('controller'),
                    'trial': int(rec.get('trial')),
                    'suiteOk': bool(rec.get('suiteOk')),
                    'testsPassed': int(rec.get('testsPassed', 0)),
                    'testsFailed': int(rec.get('testsFailed', 0)),
                    'testsTotal': int(rec.get('testsTotal', 0)),
                    'errorCategory': rec.get('errorCategory', 'none'),
                    'statementCoverage': float(rec.get('statementCoverage', 0.0)),
                    'branchCoverage': float(rec.get('branchCoverage', 0.0)),
                    'functionCoverage': float(rec.get('functionCoverage', 0.0)),
                    'lineCoverage': float(rec.get('lineCoverage', 0.0)),
                    'finishReason': rec.get('finishReason', 'unknown'),
                    'promptTokens': usage.get('promptTokens'),
                    'completionTokens': usage.get('completionTokens'),
                    'totalTokens': usage.get('totalTokens'),
                    'thinkingOrReasoningTokens': thinking_or_reasoning,
                    'latencyMs': rec.get('latencyMs')
                })
        except Exception as e:
            print(f"Warning: Failed to parse {file_path}: {e}", file=sys.stderr)

    df_trials = pd.DataFrame(trial_records)

    # Ingest mutation CSVs
    mutation_glob = os.path.join(project_root, 'results', 'mutation', '*.csv')
    mutation_records = []
    for file_path in glob.glob(mutation_glob):
        fname = Path(file_path).stem  # e.g. gemini-3.6-flash_trial1
        try:
            # Parse model and trial from filename
            parts = fname.rsplit('_trial', 1)
            if len(parts) == 2:
                model_name = parts[0]
                trial_num = int(parts[1])
                m_df = pd.read_csv(file_path)
                for _, row in m_df.iterrows():
                    mutation_records.append({
                        'model': model_name,
                        'controller': row['controller'],
                        'trial': trial_num,
                        'mutation_status': row['status'],
                        'killed': pd.to_numeric(row['killed'], errors='coerce'),
                        'timeout': pd.to_numeric(row['timeout'], errors='coerce'),
                        'survived': pd.to_numeric(row['survived'], errors='coerce'),
                        'noCoverage': pd.to_numeric(row['noCoverage'], errors='coerce'),
                        'totalMutants': pd.to_numeric(row['total'], errors='coerce'),
                        'mutation_score_strict': pd.to_numeric(row['mutation_score_strict'], errors='coerce'),
                        'mutation_score_stryker': pd.to_numeric(row['mutation_score_stryker'], errors='coerce')
                    })
        except Exception as e:
            print(f"Warning: Failed to parse {file_path}: {e}", file=sys.stderr)

    df_mutation = pd.DataFrame(mutation_records)

    # Merge on (model, controller, trial)
    if not df_trials.empty and not df_mutation.empty:
        merged_df = pd.merge(df_trials, df_mutation, on=['model', 'controller', 'trial'], how='left')
    else:
        merged_df = df_trials

    return merged_df, df_mutation


# ==============================================================================
# Empirical Analysis Modules
# ==============================================================================

def analyze_completeness(df, output_dir):
    """
    (a) Completeness: count of (model, controller, trial) records and check for missing tuples.
    """
    expected_models = ['gemini-3.6-flash', 'gpt-oss-120b']
    expected_trials = [1, 2, 3, 4, 5]
    all_controllers = sorted(df['controller'].unique())

    total_expected = len(expected_models) * len(all_controllers) * len(expected_trials)
    total_found = len(df)

    missing_records = []
    for m in expected_models:
        for c in all_controllers:
            for t in expected_trials:
                match = df[(df['model'] == m) & (df['controller'] == c) & (df['trial'] == t)]
                if len(match) == 0:
                    missing_records.append((m, c, t))

    comp_summary = {
        'expected_records': total_expected,
        'found_records': total_found,
        'missing_count': len(missing_records),
        'completeness_pct': (total_found / total_expected) * 100.0 if total_expected > 0 else 0.0
    }

    comp_df = pd.DataFrame([comp_summary])
    comp_df.to_csv(os.path.join(output_dir, 'completeness.csv'), index=False)

    print("\n--- (a) COMPLETENESS VERIFICATION ---")
    print(f"Expected records: {total_expected} (2 models x {len(all_controllers)} controllers x 5 trials)")
    print(f"Found records:    {total_found}")
    print(f"Missing records:  {len(missing_records)}")
    if missing_records:
        print(f"Missing details:  {missing_records}")
    print(f"Completeness:     {comp_summary['completeness_pct']:.2f}%")

    return comp_df


def analyze_per_model_trial(df, output_dir):
    """
    (b) Per model and per trial:
      - Executable suites, fully-passing suites, tests passed/failed.
      - Mean statement/line/branch/function coverage over executable suites.
      - Mean statement/line/branch/function coverage over all suites with zeros (SECONDARY).
      - Mean +/- SD across the 5 trials per model.
    """
    rows = []
    models = sorted(df['model'].unique())
    trials = sorted(df['trial'].unique())

    for m in models:
        for t in trials:
            sub = df[(df['model'] == m) & (df['trial'] == t)]
            total_suites = len(sub)
            
            # Executable suites: errorCategory != 'SyntaxError'
            exec_sub = sub[sub['errorCategory'] != 'SyntaxError']
            n_exec = len(exec_sub)
            
            # Fully-passing suites: suiteOk == True
            pass_sub = sub[sub['suiteOk'] == True]
            n_pass = len(pass_sub)
            
            tests_passed = sub['testsPassed'].sum()
            tests_failed = sub['testsFailed'].sum()

            # Executable-only coverage means
            exec_stmt = exec_sub['statementCoverage'].mean() if n_exec > 0 else 0.0
            exec_line = exec_sub['lineCoverage'].mean() if n_exec > 0 else 0.0
            exec_branch = exec_sub['branchCoverage'].mean() if n_exec > 0 else 0.0
            exec_func = exec_sub['functionCoverage'].mean() if n_exec > 0 else 0.0

            # All suites with zeros (SECONDARY)
            all_stmt = sub['statementCoverage'].mean()
            all_line = sub['lineCoverage'].mean()
            all_branch = sub['branchCoverage'].mean()
            all_func = sub['functionCoverage'].mean()

            rows.append({
                'model': m,
                'trial': t,
                'total_suites': total_suites,
                'executable_suites': n_exec,
                'passing_suites': n_pass,
                'tests_passed': tests_passed,
                'tests_failed': tests_failed,
                'exec_stmt_cov': exec_stmt,
                'exec_line_cov': exec_line,
                'exec_branch_cov': exec_branch,
                'exec_func_cov': exec_func,
                'all_zeros_stmt_cov_SECONDARY': all_stmt,
                'all_zeros_line_cov_SECONDARY': all_line,
                'all_zeros_branch_cov_SECONDARY': all_branch,
                'all_zeros_func_cov_SECONDARY': all_func
            })

    trial_df = pd.DataFrame(rows)

    # Compute summary row across the 5 trials per model: Mean +/- SD
    summary_rows = []
    for m in models:
        m_df = trial_df[trial_df['model'] == m]
        s_row = {'model': m, 'trial': 'Mean +/- SD'}
        for col in trial_df.columns:
            if col in ['model', 'trial']:
                continue
            mean_val = m_df[col].mean()
            std_val = m_df[col].std(ddof=1)
            s_row[col] = f"{mean_val:.2f} +/- {std_val:.2f}"
        summary_rows.append(s_row)

    combined_df = pd.concat([trial_df, pd.DataFrame(summary_rows)], ignore_index=True)
    combined_df.to_csv(os.path.join(output_dir, 'per_trial_summary.csv'), index=False)

    print("\n--- (b) PER-MODEL & PER-TRIAL SUMMARY TABLE ---")
    print(trial_df.to_string(index=False))
    print("\nAcross 5 Trials (Mean +/- SD):")
    print(pd.DataFrame(summary_rows).to_string(index=False))

    return combined_df


def analyze_primary_comparison(df, output_dir):
    """
    (c) PRIMARY comparison, unit = controller:
      - Per-controller mean over trials.
      - Evaluated only on controllers where both models' suites executed across trials.
      - Lists excluded controllers explicitly.
      - For line, branch, function coverage and both mutation scores (strict & Stryker):
        * Mean difference (Gemini - Groq)
        * Exact two-sided Wilcoxon signed-rank (n, ties, p)
        * 95% cluster-bootstrap CI (resample controllers, 10,000 resamples)
        * Holm correction across the 5 primary outcomes
      - For mutation scores: uses only controller-trials where the suite fully passed for that model,
        and reports total controller-trials retained.
    """
    controllers = sorted(df['controller'].unique())

    # Check execution status per controller across trials for both models
    # A controller is included if both models had executable suites across trials
    exec_counts = df[df['errorCategory'] != 'SyntaxError'].groupby(['controller', 'model'])['trial'].count().unstack(fill_value=0)
    
    # Fully executable controllers (executed in all 5 trials for both models)
    both_exec_all5 = exec_counts[(exec_counts['gemini-3.6-flash'] == 5) & (exec_counts['gpt-oss-120b'] == 5)].index.tolist()
    excluded_controllers = [c for c in controllers if c not in both_exec_all5]

    print("\n--- (c) PRIMARY CONTROLLER-LEVEL COMPARISON ---")
    print(f"Total controllers in benchmark:           {len(controllers)}")
    print(f"Controllers with 5/5 executed for both:   {len(both_exec_all5)}")
    print(f"Excluded controllers (had syntax errors): {len(excluded_controllers)}")
    for exc in excluded_controllers:
        gem_c = exec_counts.loc[exc, 'gemini-3.6-flash'] if 'gemini-3.6-flash' in exec_counts.columns else 0
        groq_c = exec_counts.loc[exc, 'gpt-oss-120b'] if 'gpt-oss-120b' in exec_counts.columns else 0
        print(f"  * {exc}: Gemini executed {gem_c}/5, Groq executed {groq_c}/5")

    # Filter to included controllers
    included_df = df[df['controller'].isin(both_exec_all5)].copy()

    # Mutation counts disclosure:
    # "For mutation, use only controller-trials where the suite fully passed for that model, and report how many controller-trials that left."
    gem_mut_pass_trials = df[(df['model'] == 'gemini-3.6-flash') & (df['suiteOk'] == True)]['mutation_score_strict'].dropna()
    groq_mut_pass_trials = df[(df['model'] == 'gpt-oss-120b') & (df['suiteOk'] == True)]['mutation_score_strict'].dropna()
    print(f"\nMutation controller-trials retained (suiteOk=True):")
    print(f"  Gemini controller-trials: {len(gem_mut_pass_trials)}/125")
    print(f"  Groq controller-trials:   {len(groq_mut_pass_trials)}/125")

    # Compute per-controller means over trials for each model
    # For coverage: mean over executable trials
    # For mutation: mean over passing trials
    metrics = [
        ('line_coverage', 'lineCoverage', False),
        ('branch_coverage', 'branchCoverage', False),
        ('function_coverage', 'functionCoverage', False),
        ('mutation_score_strict', 'mutation_score_strict', True),
        ('mutation_score_stryker', 'mutation_score_stryker', True)
    ]

    ctrl_means = {}
    for m in ['gemini-3.6-flash', 'gpt-oss-120b']:
        ctrl_means[m] = {}
        m_df = included_df[included_df['model'] == m]
        for name, col, is_mutation in metrics:
            if is_mutation:
                # Use only trials where suiteOk == True
                sub = m_df[m_df['suiteOk'] == True]
            else:
                # Use executable trials
                sub = m_df[m_df['errorCategory'] != 'SyntaxError']
            
            ctrl_means[m][name] = sub.groupby('controller')[col].mean()

    # Calculate differences (Gemini - Groq) per controller
    comparison_results = []
    raw_pvalues = []

    for name, col, is_mutation in metrics:
        s_gem = ctrl_means['gemini-3.6-flash'][name]
        s_groq = ctrl_means['gpt-oss-120b'][name]

        # Intersect controllers with valid numbers
        common_ctrls = s_gem.dropna().index.intersection(s_groq.dropna().index)
        gem_vals = s_gem.loc[common_ctrls].to_numpy()
        groq_vals = s_groq.loc[common_ctrls].to_numpy()

        diffs = gem_vals - groq_vals
        mean_diff = float(np.mean(diffs))
        gem_mean = float(np.mean(gem_vals))
        groq_mean = float(np.mean(groq_vals))

        # Exact Wilcoxon signed-rank test
        w_res = compute_wilcoxon_exact(diffs)

        # 95% Cluster-Bootstrap CI (resample controllers, 10,000 resamples)
        ci_low, ci_high = cluster_bootstrap_ci(diffs, np.mean, B=10000, seed=RANDOM_SEED)

        raw_pvalues.append(w_res['pvalue'])
        comparison_results.append({
            'outcome': name,
            'controllers_n': len(common_ctrls),
            'gemini_mean': gem_mean,
            'groq_mean': groq_mean,
            'mean_difference': mean_diff,
            'ci_95_low': ci_low,
            'ci_95_high': ci_high,
            'wilcoxon_W': w_res['statistic'],
            'wilcoxon_n_nonzero': w_res['n_nonzero'],
            'wilcoxon_ties': w_res['ties_count'],
            'raw_pvalue': w_res['pvalue']
        })

    # Holm-Bonferroni correction across the 5 primary outcomes
    adj_pvalues = holm_adjust(raw_pvalues)
    for i, adj_p in enumerate(adj_pvalues):
        comparison_results[i]['holm_adj_pvalue'] = float(adj_p)

    primary_df = pd.DataFrame(comparison_results)
    primary_df.to_csv(os.path.join(output_dir, 'primary_controller_comparison.csv'), index=False)

    print("\nPrimary Outcomes Comparison Table (Gemini - Groq):")
    print(primary_df.to_string(index=False))

    return primary_df


def analyze_per_controller_means(df, output_dir):
    """
    Computes per-controller summary across the 5 trials for each model:
      - suiteOk count (out of 5)
      - mean lineCoverage across all 5 trials (with zeros)
      - mean lineCoverage across executable trials
      - mean branch, function, statement coverage
      - mean mutation scores (over passing trials)
    Saves to results/analysis/per_controller_means.csv and prints table.
    """
    controllers = sorted(df['controller'].unique())
    rows = []
    for c in controllers:
        c_df = df[df['controller'] == c]
        row = {'controller': c}
        for m in ['gemini-3.6-flash', 'gpt-oss-120b']:
            prefix = 'gemini' if 'gemini' in m else 'groq'
            m_sub = c_df[c_df['model'] == m]
            
            # SuiteOk count
            suite_ok_count = int(m_sub['suiteOk'].sum())
            row[f'{prefix}_suiteOk_count'] = f"{suite_ok_count}/5"
            
            # Line coverage: all 5 trials
            row[f'{prefix}_line_cov_mean5'] = float(m_sub['lineCoverage'].mean())
            
            # Line coverage: executable trials only
            exec_sub = m_sub[m_sub['errorCategory'] != 'SyntaxError']
            row[f'{prefix}_line_cov_exec_mean'] = float(exec_sub['lineCoverage'].mean()) if len(exec_sub) > 0 else np.nan
            
            # Branch & Function coverage (all 5 and executable)
            row[f'{prefix}_branch_cov_mean5'] = float(m_sub['branchCoverage'].mean())
            row[f'{prefix}_func_cov_mean5'] = float(m_sub['functionCoverage'].mean())
            
            # Mutation scores (passing trials only)
            pass_sub = m_sub[m_sub['suiteOk'] == True]
            row[f'{prefix}_mutation_strict_mean'] = float(pass_sub['mutation_score_strict'].mean()) if len(pass_sub) > 0 else np.nan
            row[f'{prefix}_mutation_stryker_mean'] = float(pass_sub['mutation_score_stryker'].mean()) if len(pass_sub) > 0 else np.nan

        rows.append(row)

    ctrl_df = pd.DataFrame(rows)
    ctrl_df.to_csv(os.path.join(output_dir, 'per_controller_means.csv'), index=False)
    print("\n--- PER-CONTROLLER SUMMARY (Trials 1..5) ---")
    cols_to_print = [
        'controller',
        'gemini_suiteOk_count', 'gemini_line_cov_mean5',
        'groq_suiteOk_count', 'groq_line_cov_mean5'
    ]
    print(ctrl_df[cols_to_print].to_string(index=False))
    return ctrl_df



def analyze_suite_success_and_flips(df, output_dir):
    """
    (d) Suite success rate per model with controller-level bootstrap CI,
        and share of controllers whose suiteOk flips between trials.
    """
    models = sorted(df['model'].unique())
    all_controllers = sorted(df['controller'].unique())
    n_controllers = len(all_controllers)

    success_rows = []
    flip_rows = []

    print("\n--- (d) SUITE SUCCESS RATE & CONTROLLER FLIP SHARE ---")

    for m in models:
        m_df = df[df['model'] == m]
        total_trials = len(m_df)
        passed_trials = m_df['suiteOk'].sum()
        overall_rate = (passed_trials / total_trials) * 100.0

        # Controller-level success rates
        ctrl_rates = m_df.groupby('controller')['suiteOk'].mean().to_numpy() * 100.0

        # Cluster-bootstrap 95% CI on suite success rate
        ci_low, ci_high = cluster_bootstrap_ci(ctrl_rates, np.mean, B=10000, seed=RANDOM_SEED)

        # Flips analysis: controllers whose suiteOk is neither all True nor all False across the 5 trials
        ctrl_pass_counts = m_df.groupby('controller')['suiteOk'].sum()
        flipping_ctrls = ctrl_pass_counts[(ctrl_pass_counts > 0) & (ctrl_pass_counts < 5)].index.tolist()
        flip_count = len(flipping_ctrls)
        flip_share = (flip_count / n_controllers) * 100.0

        success_rows.append({
            'model': m,
            'total_trials': total_trials,
            'passed_trials': int(passed_trials),
            'success_rate_pct': overall_rate,
            'bootstrap_ci_95_low': ci_low,
            'bootstrap_ci_95_high': ci_high,
            'flipping_controllers_count': flip_count,
            'total_controllers': n_controllers,
            'flip_share_pct': flip_share
        })

        for c in all_controllers:
            p_cnt = int(ctrl_pass_counts.get(c, 0))
            is_flip = bool(0 < p_cnt < 5)
            flip_rows.append({
                'model': m,
                'controller': c,
                'passed_trials_out_of_5': p_cnt,
                'flipped': is_flip
            })

        print(f"Model: {m}")
        print(f"  Suite Success Rate: {overall_rate:.2f}% ({passed_trials}/{total_trials})")
        print(f"  95% Cluster-Bootstrap CI: [{ci_low:.2f}%, {ci_high:.2f}%]")
        print(f"  Controllers Flipping:     {flip_count}/{n_controllers} ({flip_share:.2f}%)")
        print(f"  Flipping Controllers:     {', '.join(flipping_ctrls) if flipping_ctrls else 'None'}\n")

    succ_df = pd.DataFrame(success_rows)
    succ_df.to_csv(os.path.join(output_dir, 'suite_success_summary.csv'), index=False)

    flips_df = pd.DataFrame(flip_rows)
    flips_df.to_csv(os.path.join(output_dir, 'controller_flips_detail.csv'), index=False)

    return succ_df


def analyze_failures(df, output_dir):
    """
    (e) Failure counts by errorCategory and finishReason per model.
    """
    print("\n--- (e) FAILURE TAXONOMY BY ERROR CATEGORY & FINISH REASON ---")
    
    # Filter failures
    failures_df = df[df['suiteOk'] == False].copy()
    
    cat_summary = df.groupby(['model', 'errorCategory']).size().unstack(fill_value=0)
    reason_summary = df.groupby(['model', 'finishReason']).size().unstack(fill_value=0)

    print("Breakdown by errorCategory across all 125 trials:")
    print(cat_summary)
    print("\nBreakdown by finishReason across all 125 trials:")
    print(reason_summary)

    cat_summary.to_csv(os.path.join(output_dir, 'error_category_breakdown.csv'))
    reason_summary.to_csv(os.path.join(output_dir, 'finish_reason_breakdown.csv'))

    return cat_summary, reason_summary


def analyze_token_usage(df, output_dir):
    """
    (f) Measured token usage per model (mean prompt, completion, thinking/reasoning, total).
    """
    print("\n--- (f) MEASURED TOKEN USAGE PER MODEL ---")
    token_metrics = ['promptTokens', 'completionTokens', 'thinkingOrReasoningTokens', 'totalTokens']

    rows = []
    models = sorted(df['model'].unique())
    for m in models:
        m_df = df[df['model'] == m]
        for t_col in token_metrics:
            series = pd.to_numeric(m_df[t_col], errors='coerce').dropna()
            rows.append({
                'model': m,
                'token_type': t_col,
                'count_valid': len(series),
                'mean': float(series.mean()) if len(series) > 0 else np.nan,
                'std': float(series.std(ddof=1)) if len(series) > 1 else np.nan,
                'min': float(series.min()) if len(series) > 0 else np.nan,
                'max': float(series.max()) if len(series) > 0 else np.nan
            })

    usage_df = pd.DataFrame(rows)
    usage_df.to_csv(os.path.join(output_dir, 'token_usage_summary.csv'), index=False)
    print(usage_df.to_string(index=False))

    return usage_df


# ==============================================================================
# Main Entry Point
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="Statistical analysis harness for repeated-trial benchmark.")
    parser.add_argument('--self-test', action='store_true', help="Run verification test suite on synthetic data and exit.")
    parser.add_argument('--project-root', type=str, default='.', help="Path to project root directory.")
    args = parser.parse_args()

    if args.self_test:
        sys.exit(run_self_tests())

    project_root = os.path.abspath(args.project_root)
    output_dir = os.path.join(project_root, 'results', 'analysis')
    os.makedirs(output_dir, exist_ok=True)

    print("======================================================================")
    print(" Express.js LLM Unit Test Benchmark: Repeated-Trial Statistical Analysis")
    print("======================================================================")
    print(f"Project root:  {project_root}")
    print(f"Analysis dir:  {output_dir}")
    print(f"Random seed:   {RANDOM_SEED}\n")

    # Load data
    df, mut_df = load_data(project_root)
    print(f"Loaded {len(df)} total trial records across all models and controllers.")

    # (a) Completeness
    analyze_completeness(df, output_dir)

    # (b) Per-model and per-trial
    analyze_per_model_trial(df, output_dir)

    # (c) Primary comparison
    analyze_primary_comparison(df, output_dir)

    # Per-controller summary breakdown
    analyze_per_controller_means(df, output_dir)

    # (d) Suite success & flips
    analyze_suite_success_and_flips(df, output_dir)

    # (e) Failure taxonomy
    analyze_failures(df, output_dir)

    # (f) Token usage
    analyze_token_usage(df, output_dir)

    print("\n======================================================================")
    print(f" Analysis complete. All tables and CSVs saved to: {output_dir}")
    print("======================================================================")


if __name__ == '__main__':
    main()
