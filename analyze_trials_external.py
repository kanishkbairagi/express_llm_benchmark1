#!/usr/bin/env python3
"""
analyze_trials_external.py

Comprehensive statistical analysis harness for Set B external repeated-trial LLM benchmark.
Evaluates gemini-3.6-flash and gpt-oss-120b across 25 external Express.js controllers and 3 trials (k=3).

Analysis Components:
  a) Completeness verification of all (model, controller, trial) tuples (k=3).
  b) Per-model and per-trial summaries (executable vs all with zeros, plus mean +/- SD across 3 trials).
  c) Primary paired comparison (unit = controller, cluster = repository):
     per-controller mean over trials, exact two-sided Wilcoxon signed-rank test,
     95% cluster-bootstrap CI (10,000 resamples of repository clusters),
     and Holm correction across 5 primary outcomes (line, branch, function coverage, strict and Stryker mutation).
  d) Suite success rate per model with repository-cluster bootstrap CI, and controller-level flip share across 3 trials.
  e) Failure taxonomy (errorCategory, finishReason).
  f) Measured token usage statistics (prompt, completion, reasoning/thinking, total).
  Sensitivity Analyses:
    - Sensitivity A: Trial-level matching (pairs matched on trial where both executed).
    - Sensitivity B: All 25 controllers with zeros for non-executable suites (SECONDARY).

Outputs written to results/analysis_external/.
"""

import os
import sys
import glob
import json
import argparse
from pathlib import Path
from collections import defaultdict
import numpy as np
import pandas as pd
from scipy import stats

RANDOM_SEED = 42


# ==============================================================================
# Statistical Utility Functions & Repository Cluster Helpers
# ==============================================================================

def get_repo_cluster(controller_id):
    """
    Extracts the owner__repo cluster identifier from a controller safeId.
    Example: 'burakorkmez__mern-github-app__user.controller' -> 'burakorkmez__mern-github-app'
    """
    if '__' in controller_id:
        return controller_id.rsplit('__', 1)[0]
    return controller_id



def group_by_repo_cluster(ctrl_series):
    """
    Groups a pandas Series indexed by controller name into a list of clusters (lists of values),
    where each cluster corresponds to one repository.
    """
    repo_clusters = defaultdict(list)
    for ctrl, val in ctrl_series.items():
        if pd.notna(val):
            repo = get_repo_cluster(ctrl)
            repo_clusters[repo].append(float(val))
    return [vals for vals in repo_clusters.values() if len(vals) > 0]


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

    zero_diffs = int(np.sum(diffs == 0.0))

    if n_nonzero == 0:
        return {
            'n_total': n_total,
            'n_nonzero': 0,
            'ties_count': zero_diffs,
            'statistic': 0.0,
            'pvalue': 1.0
        }

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
        'ties_count': zero_diffs,
        'statistic': stat,
        'pvalue': pval
    }


def cluster_bootstrap_ci(data, stat_fn, B=10000, seed=RANDOM_SEED, alpha=0.05):
    """
    Computes 95% cluster-bootstrap percentile confidence interval by resampling
    clusters with replacement.
    If data is a list of clusters (lists/arrays), resamples clusters and flattens
    the sampled units before calling stat_fn.
    If data is a 1D list/array of scalars, each element is treated as an individual cluster.
    """
    rng = np.random.default_rng(seed)
    n = len(data)
    if n == 0:
        return np.nan, np.nan

    is_clustered = len(data) > 0 and isinstance(data[0], (list, tuple, np.ndarray))

    boot_stats = np.empty(B, dtype=float)
    indices = rng.choice(n, size=(B, n), replace=True)

    for b in range(B):
        if is_clustered:
            sample = [v for idx in indices[b] for v in data[idx]]
        else:
            sample = [data[idx] for idx in indices[b]]
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
      6. Repository-cluster bootstrap resampling logic.
    """
    print("======================================================================")
    print(" Running analyze_trials_external.py Self-Tests (Synthetic Data & Known Answers)")
    print("======================================================================")

    all_passed = True

    # 1. Wilcoxon exact p-value: 13 identical-sign differences
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

    # 4. Cluster-Bootstrap CI Determinism & Properties (scalar clusters)
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

    # 5. Controller Flip Rate Logic
    mock_suite_matrix = {
        'c1': [True, True, True],
        'c2': [False, False, False],
        'c3': [True, False, True],
        'c4': [False, True, False]
    }
    flips = sum(1 for trials in mock_suite_matrix.values() if 0 < sum(trials) < len(trials))
    flip_rate = flips / len(mock_suite_matrix)
    flip_pass = (flips == 2 and np.isclose(flip_rate, 0.50))
    print(f"\nTest 5: Controller SuiteOk Flip Rate Logic (k=3)")
    print(f"  Mock Controllers: 4 (1 consistent pass, 1 consistent fail, 2 flipping)")
    print(f"  Flipping Count:   {flips}/4 (Expected: 2)")
    print(f"  Flip Share:       {flip_rate * 100:.1f}% (Expected: 50.0%)")
    print(f"  Result:           {'PASS' if flip_pass else 'FAIL'}")
    if not flip_pass:
        all_passed = False

    # 6. Repository-Cluster Resampling Logic
    mock_series = pd.Series({
        'ownerA__repoA__ctrl1': 10.0,
        'ownerA__repoA__ctrl2': 20.0,
        'ownerB__repoB__ctrl1': 30.0,
        'ownerC__repoC__ctrl1': 40.0
    })

    clusters = group_by_repo_cluster(mock_series)
    repo_pass = (len(clusters) == 3 and
                 sorted([len(c) for c in clusters]) == [1, 1, 2])
    c_low, c_high = cluster_bootstrap_ci(clusters, np.mean, B=5000, seed=123)
    repo_ci_pass = (c_low < 25.0 < c_high)
    print(f"\nTest 6: Repository Cluster Grouping & Bootstrap Resampling")
    print(f"  Clusters Found:   {len(clusters)} (Expected: 3)")
    print(f"  Cluster Sizes:    {[len(c) for c in clusters]} (Expected: [2, 1, 1])")
    print(f"  Cluster Mean CI:  [{c_low:.2f}, {c_high:.2f}]")
    print(f"  Result:           {'PASS' if (repo_pass and repo_ci_pass) else 'FAIL'}")
    if not (repo_pass and repo_ci_pass):
        all_passed = False

    print("\n----------------------------------------------------------------------")
    if all_passed:
        print(">>> OVERALL SELF-TEST STATUS: ALL TESTS PASSED (6/6 checks OK)")
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
    Ingests all trial_result.json files from results/trials_external/**/
    and all mutation CSV files from results/mutation_external/*.csv.
    Merges them into unified tabular format.
    """
    trials_glob = os.path.join(project_root, 'results', 'trials_external', '*', '*', 'trial_*', 'trial_result.json')
    trial_records = []
    for file_path in glob.glob(trials_glob):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                rec = json.load(f)
                usage = rec.get('usage') or {}
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
    mutation_glob = os.path.join(project_root, 'results', 'mutation_external', '*.csv')
    mutation_records = []
    for file_path in glob.glob(mutation_glob):
        fname = Path(file_path).stem  # e.g. gemini-3.6-flash_trial1
        try:
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
    (a) Completeness: count of (model, controller, trial) records and check for missing tuples (k=3).
    """
    expected_models = ['gemini-3.6-flash', 'gpt-oss-120b']
    expected_trials = [1, 2, 3]
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

    is_complete = (len(missing_records) == 0) and (total_found == total_expected)

    summary_data = {
        'total_expected': [total_expected],
        'total_found': [total_found],
        'models_count': [len(expected_models)],
        'controllers_count': [len(all_controllers)],
        'trials_per_controller': [len(expected_trials)],
        'missing_count': [len(missing_records)],
        'is_complete': [is_complete]
    }
    comp_df = pd.DataFrame(summary_data)
    comp_df.to_csv(os.path.join(output_dir, 'completeness.csv'), index=False)

    print("\n--- (a) COMPLETENESS VERIFICATION ---")
    print(f"Total expected records: {total_expected} (2 models * {len(all_controllers)} controllers * 3 trials)")
    print(f"Total records ingested: {total_found}")
    print(f"Completeness status:    {'100% COMPLETE' if is_complete else 'INCOMPLETE'}")
    if missing_records:
        print(f"Missing records ({len(missing_records)}): {missing_records}")

    return comp_df


def analyze_per_trial_summary(df, output_dir):
    """
    (b) Per-model and per-trial summaries across trials 1..3.
    """
    print("\n--- (b) PER-TRIAL SUMMARY STATISTICS ---")
    models = ['gemini-3.6-flash', 'gpt-oss-120b']
    trials = [1, 2, 3]

    rows = []
    for m in models:
        for t in trials:
            sub = df[(df['model'] == m) & (df['trial'] == t)]
            n_total = len(sub)
            n_suite_ok = sub['suiteOk'].sum()

            exec_sub = sub[sub['errorCategory'] != 'SyntaxError']
            n_exec = len(exec_sub)

            rows.append({
                'model': m,
                'trial': t,
                'controllers_total': n_total,
                'suites_passed': n_suite_ok,
                'suites_executable': n_exec,
                # Executable suites means
                'line_cov_exec_mean': exec_sub['lineCoverage'].mean() if n_exec > 0 else np.nan,
                'branch_cov_exec_mean': exec_sub['branchCoverage'].mean() if n_exec > 0 else np.nan,
                'func_cov_exec_mean': exec_sub['functionCoverage'].mean() if n_exec > 0 else np.nan,
                'stmt_cov_exec_mean': exec_sub['statementCoverage'].mean() if n_exec > 0 else np.nan,
                # All 25 with zeros for non-executable
                'line_cov_all_mean': sub['lineCoverage'].mean(),
                'branch_cov_all_mean': sub['branchCoverage'].mean(),
                'func_cov_all_mean': sub['functionCoverage'].mean(),
                'stmt_cov_all_mean': sub['statementCoverage'].mean(),
                # Strict and Stryker mutation (passing suites only)
                'mutation_strict_mean': sub[sub['suiteOk'] == True]['mutation_score_strict'].mean(),
                'mutation_stryker_mean': sub[sub['suiteOk'] == True]['mutation_score_stryker'].mean()
            })

    trial_summary_df = pd.DataFrame(rows)

    # Aggregate across 3 trials: Mean +/- SD
    summary_rows = []
    for m in models:
        m_trials = trial_summary_df[trial_summary_df['model'] == m]
        metric_cols = [c for c in trial_summary_df.columns if 'mean' in c]
        agg_dict = {'model': m}
        for col in metric_cols:
            vals = m_trials[col].dropna()
            mean_val = vals.mean()
            sd_val = vals.std(ddof=1) if len(vals) > 1 else 0.0
            agg_dict[f'{col}_3trial_mean'] = mean_val
            agg_dict[f'{col}_3trial_sd'] = sd_val
        summary_rows.append(agg_dict)

    combined_df = trial_summary_df.copy()
    combined_df.to_csv(os.path.join(output_dir, 'per_trial_summary.csv'), index=False)

    print("\nPer-Trial Summary Table:")
    print(trial_summary_df[['model', 'trial', 'suites_passed', 'suites_executable', 'line_cov_exec_mean', 'branch_cov_exec_mean', 'func_cov_exec_mean']].to_string(index=False))

    print("\nAcross 3 Trials (Mean +/- SD):")
    print(pd.DataFrame(summary_rows).to_string(index=False))

    return combined_df


def analyze_primary_comparison(df, output_dir):
    """
    (c) PRIMARY comparison, unit = controller, cluster = repository:
      - Per-controller mean over trials (k=3).
      - Evaluated on controllers where both models' suites executed across all 3 trials.
      - Lists excluded controllers explicitly.
      - For line, branch, function coverage and both mutation scores (strict & Stryker):
        * Mean difference (Gemini - Groq)
        * Exact two-sided Wilcoxon signed-rank (n, ties, p)
        * 95% cluster-bootstrap CI (resample repository clusters, 10,000 resamples)
        * Holm correction across the 5 primary outcomes
      - For mutation scores: uses only controller-trials where the suite fully passed for that model,
        and reports total controller-trials retained.
    """
    controllers = sorted(df['controller'].unique())

    # Check execution status per controller across trials for both models
    exec_counts = df[df['errorCategory'] != 'SyntaxError'].groupby(['controller', 'model'])['trial'].count().unstack(fill_value=0)

    # Controllers executed in all 3 trials for both models
    both_exec_all3 = exec_counts[(exec_counts['gemini-3.6-flash'] == 3) & (exec_counts['gpt-oss-120b'] == 3)].index.tolist()
    excluded_controllers = [c for c in controllers if c not in both_exec_all3]

    print("\n--- (c) PRIMARY CONTROLLER-LEVEL COMPARISON ---")
    print(f"Total controllers in benchmark:           {len(controllers)}")
    print(f"Controllers with 3/3 executed for both:   {len(both_exec_all3)}")
    print(f"Excluded controllers (had syntax errors): {len(excluded_controllers)}")
    for exc in excluded_controllers:
        gem_c = exec_counts.loc[exc, 'gemini-3.6-flash'] if 'gemini-3.6-flash' in exec_counts.columns else 0
        groq_c = exec_counts.loc[exc, 'gpt-oss-120b'] if 'gpt-oss-120b' in exec_counts.columns else 0
        print(f"  * {exc}: Gemini executed {gem_c}/3, Groq executed {groq_c}/3")

    included_df = df[df['controller'].isin(both_exec_all3)].copy()

    # Mutation counts disclosure
    gem_mut_pass_trials = df[(df['model'] == 'gemini-3.6-flash') & (df['suiteOk'] == True)]['mutation_score_strict'].dropna()
    groq_mut_pass_trials = df[(df['model'] == 'gpt-oss-120b') & (df['suiteOk'] == True)]['mutation_score_strict'].dropna()
    print(f"\nMutation controller-trials retained (suiteOk=True across all trials):")
    print(f"  Gemini controller-trials: {len(gem_mut_pass_trials)}/75")
    print(f"  Groq controller-trials:   {len(groq_mut_pass_trials)}/75")

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
                sub = m_df[m_df['suiteOk'] == True]
            else:
                sub = m_df[m_df['errorCategory'] != 'SyntaxError']
            ctrl_means[m][name] = sub.groupby('controller')[col].mean()

    comparison_results = []
    raw_pvalues = []

    for name, col, is_mutation in metrics:
        s_gem = ctrl_means['gemini-3.6-flash'][name]
        s_groq = ctrl_means['gpt-oss-120b'][name]

        common_ctrls = sorted(s_gem.dropna().index.intersection(s_groq.dropna().index))
        if len(common_ctrls) == 0:
            comparison_results.append({
                'outcome': name,
                'controllers_n': 0,
                'gemini_mean': np.nan,
                'groq_mean': np.nan,
                'mean_difference': np.nan,
                'ci_95_low': np.nan,
                'ci_95_high': np.nan,
                'wilcoxon_W': np.nan,
                'wilcoxon_n_nonzero': 0,
                'wilcoxon_ties': 0,
                'raw_pvalue': 1.0
            })
            raw_pvalues.append(1.0)
            continue

        gem_vals = s_gem.loc[common_ctrls].to_numpy()
        groq_vals = s_groq.loc[common_ctrls].to_numpy()

        diffs = gem_vals - groq_vals
        mean_diff = float(np.mean(diffs))
        gem_mean = float(np.mean(gem_vals))
        groq_mean = float(np.mean(groq_vals))

        # Exact Wilcoxon signed-rank test
        w_res = compute_wilcoxon_exact(diffs)

        # 95% Cluster-Bootstrap CI (resample repository clusters, 10,000 resamples)
        diff_series = pd.Series(diffs, index=common_ctrls)
        clusters = group_by_repo_cluster(diff_series)
        ci_low, ci_high = cluster_bootstrap_ci(clusters, np.mean, B=10000, seed=RANDOM_SEED)

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

    print("\nPrimary Outcomes Comparison Table (Gemini - Groq, Resampling Repository Clusters):")
    print(primary_df.to_string(index=False))

    return primary_df


def analyze_per_controller_means(df, output_dir):
    """
    Computes per-controller summary across the 3 trials for each model:
      - line, branch, function coverage mean (over executable suites)
      - suiteOk count (out of 3)
      - mean mutation scores (over passing trials)
    Saves to results/analysis_external/per_controller_means.csv and prints table.
    """
    controllers = sorted(df['controller'].unique())
    rows = []

    for c in controllers:
        row = {'controller': c, 'repository': get_repo_cluster(c)}
        for m, prefix in [('gemini-3.6-flash', 'gemini'), ('gpt-oss-120b', 'groq')]:
            c_df = df[(df['controller'] == c) & (df['model'] == m)]
            row[f'{prefix}_suiteOk_count'] = int(c_df['suiteOk'].sum())

            # Executable trials for coverage
            exec_sub = c_df[c_df['errorCategory'] != 'SyntaxError']
            row[f'{prefix}_exec_trials_count'] = len(exec_sub)
            row[f'{prefix}_line_cov_mean3'] = float(exec_sub['lineCoverage'].mean()) if len(exec_sub) > 0 else np.nan
            row[f'{prefix}_branch_cov_mean3'] = float(exec_sub['branchCoverage'].mean()) if len(exec_sub) > 0 else np.nan
            row[f'{prefix}_func_cov_mean3'] = float(exec_sub['functionCoverage'].mean()) if len(exec_sub) > 0 else np.nan

            # Mutation scores (passing trials only)
            pass_sub = c_df[c_df['suiteOk'] == True]
            row[f'{prefix}_pass_trials_count'] = len(pass_sub)
            row[f'{prefix}_mutation_strict_mean'] = float(pass_sub['mutation_score_strict'].mean()) if len(pass_sub) > 0 else np.nan
            row[f'{prefix}_mutation_stryker_mean'] = float(pass_sub['mutation_score_stryker'].mean()) if len(pass_sub) > 0 else np.nan

        rows.append(row)

    ctrl_df = pd.DataFrame(rows)
    ctrl_df.to_csv(os.path.join(output_dir, 'per_controller_means.csv'), index=False)
    print("\n--- PER-CONTROLLER SUMMARY (Trials 1..3) ---")
    cols_to_print = [
        'controller',
        'gemini_suiteOk_count', 'gemini_line_cov_mean3',
        'groq_suiteOk_count', 'groq_line_cov_mean3'
    ]
    print(ctrl_df[cols_to_print].to_string(index=False))
    return ctrl_df


def analyze_sensitivity_a(df, output_dir):
    """
    Sensitivity A (Trial-level matching):
    For each controller, average only over trials where BOTH models' suites executed.
    Include every controller with at least 1 such trial.
    Resamples repository clusters in the bootstrap.
    """
    print("\n--- SENSITIVITY A: TRIAL-LEVEL MATCHING ---")
    controllers = sorted(df['controller'].unique())

    # Find matched trials per controller where BOTH models executed (errorCategory != 'SyntaxError')
    matched_trials = {}
    for c in controllers:
        gem_t = set(df[(df['controller'] == c) & (df['model'] == 'gemini-3.6-flash') & (df['errorCategory'] != 'SyntaxError')]['trial'])
        groq_t = set(df[(df['controller'] == c) & (df['model'] == 'gpt-oss-120b') & (df['errorCategory'] != 'SyntaxError')]['trial'])
        matched_trials[c] = gem_t.intersection(groq_t)

    eligible_controllers = [c for c in controllers if len(matched_trials[c]) >= 1]
    print(f"Controllers included with >= 1 matched trial: {len(eligible_controllers)}/{len(controllers)}")

    metrics = [
        ('line_coverage', 'lineCoverage', False),
        ('branch_coverage', 'branchCoverage', False),
        ('function_coverage', 'functionCoverage', False),
        ('mutation_score_strict', 'mutation_score_strict', True),
        ('mutation_score_stryker', 'mutation_score_stryker', True)
    ]

    results = []
    raw_pvals = []
    for name, col, is_mut in metrics:
        gem_means = {}
        groq_means = {}
        for c in eligible_controllers:
            t_set = matched_trials[c]
            c_gem = df[(df['controller'] == c) & (df['model'] == 'gemini-3.6-flash') & (df['trial'].isin(t_set))]
            c_groq = df[(df['controller'] == c) & (df['model'] == 'gpt-oss-120b') & (df['trial'].isin(t_set))]
            if is_mut:
                v_gem = c_gem[c_gem['suiteOk'] == True][col].mean()
                v_groq = c_groq[c_groq['suiteOk'] == True][col].mean()
            else:
                v_gem = c_gem[col].mean()
                v_groq = c_groq[col].mean()
            if pd.notna(v_gem) and pd.notna(v_groq):
                gem_means[c] = v_gem
                groq_means[c] = v_groq

        common = sorted(set(gem_means.keys()).intersection(groq_means.keys()))
        if len(common) == 0:
            results.append({
                'outcome': name,
                'controllers_n': 0,
                'gemini_mean': np.nan,
                'groq_mean': np.nan,
                'mean_difference': np.nan,
                'ci_95_low': np.nan,
                'ci_95_high': np.nan,
                'wilcoxon_W': np.nan,
                'wilcoxon_n_nonzero': 0,
                'wilcoxon_ties': 0,
                'raw_pvalue': 1.0
            })
            raw_pvals.append(1.0)
            continue

        g_arr = np.array([gem_means[c] for c in common])
        q_arr = np.array([groq_means[c] for c in common])
        diffs = g_arr - q_arr

        mean_diff = float(np.mean(diffs))
        gem_mean = float(np.mean(g_arr))
        groq_mean = float(np.mean(q_arr))

        w_res = compute_wilcoxon_exact(diffs)

        diff_series = pd.Series(diffs, index=common)
        clusters = group_by_repo_cluster(diff_series)
        ci_low, ci_high = cluster_bootstrap_ci(clusters, np.mean, B=10000, seed=RANDOM_SEED)

        raw_pvals.append(w_res['pvalue'])
        results.append({
            'outcome': name,
            'controllers_n': len(common),
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

    adj_pvals = holm_adjust(raw_pvals)
    for i, adj_p in enumerate(adj_pvals):
        results[i]['holm_adj_pvalue'] = float(adj_p)

    sens_a_df = pd.DataFrame(results)
    sens_a_df.to_csv(os.path.join(output_dir, 'sensitivity_a_trial_matched.csv'), index=False)
    print("\nSensitivity A Comparison Table (Gemini - Groq, Trial-Matched, Repository Clusters):")
    print(sens_a_df.to_string(index=False))
    return sens_a_df


def analyze_sensitivity_b(df, output_dir):
    """
    Sensitivity B (All 25 controllers with zeros for non-executable suites, SECONDARY):
    For all 25 controllers, per-controller mean over all 3 trials with zeros for non-executable suites.
    Resamples repository clusters in the bootstrap.
    """
    print("\n--- SENSITIVITY B: ALL 25 CONTROLLERS WITH ZEROS FOR NON-EXECUTABLE SUITES (SECONDARY) ---")
    controllers = sorted(df['controller'].unique())

    df_b = df.copy()
    # Non-executable suites (SyntaxError) get 0.0 for mutation scores
    df_b.loc[df_b['errorCategory'] == 'SyntaxError', 'mutation_score_strict'] = 0.0
    df_b.loc[df_b['errorCategory'] == 'SyntaxError', 'mutation_score_stryker'] = 0.0

    metrics = [
        ('line_coverage', 'lineCoverage'),
        ('branch_coverage', 'branchCoverage'),
        ('function_coverage', 'functionCoverage'),
        ('mutation_score_strict', 'mutation_score_strict'),
        ('mutation_score_stryker', 'mutation_score_stryker')
    ]

    results = []
    raw_pvals = []
    for name, col in metrics:
        gem_m = df_b[df_b['model'] == 'gemini-3.6-flash'].groupby('controller')[col].mean()
        groq_m = df_b[df_b['model'] == 'gpt-oss-120b'].groupby('controller')[col].mean()

        common = sorted(gem_m.dropna().index.intersection(groq_m.dropna().index))
        g_arr = gem_m.loc[common].to_numpy()
        q_arr = groq_m.loc[common].to_numpy()
        diffs = g_arr - q_arr

        mean_diff = float(np.mean(diffs))
        gem_mean = float(np.mean(g_arr))
        groq_mean = float(np.mean(q_arr))

        w_res = compute_wilcoxon_exact(diffs)

        diff_series = pd.Series(diffs, index=common)
        clusters = group_by_repo_cluster(diff_series)
        ci_low, ci_high = cluster_bootstrap_ci(clusters, np.mean, B=10000, seed=RANDOM_SEED)

        raw_pvals.append(w_res['pvalue'])
        results.append({
            'outcome': name,
            'controllers_n': len(common),
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

    adj_pvals = holm_adjust(raw_pvals)
    for i, adj_p in enumerate(adj_pvals):
        results[i]['holm_adj_pvalue'] = float(adj_p)

    sens_b_df = pd.DataFrame(results)
    sens_b_df.to_csv(os.path.join(output_dir, 'sensitivity_b_all25_zeros_SECONDARY.csv'), index=False)
    print("\nSensitivity B Comparison Table (All 25 with Zeros, Repository Clusters):")
    print(sens_b_df.to_string(index=False))
    return sens_b_df


def analyze_suite_success(df, output_dir):
    """
    (d) Suite success rate per model with repository-cluster bootstrap CI, and controller-level flip share across 3 trials.
    """
    models = ['gemini-3.6-flash', 'gpt-oss-120b']
    all_controllers = sorted(df['controller'].unique())
    n_controllers = len(all_controllers)

    success_rows = []
    flip_rows = []

    print("\n--- (d) SUITE SUCCESS RATE & CONTROLLER FLIP SHARE (k=3) ---")

    for m in models:
        m_df = df[df['model'] == m]
        total_trials = len(m_df)
        passed_trials = m_df['suiteOk'].sum()
        overall_rate = (passed_trials / total_trials) * 100.0

        # Controller-level success rates
        ctrl_rates_series = m_df.groupby('controller')['suiteOk'].mean() * 100.0

        # Repository-cluster bootstrap 95% CI on suite success rate
        clusters = group_by_repo_cluster(ctrl_rates_series)
        ci_low, ci_high = cluster_bootstrap_ci(clusters, np.mean, B=10000, seed=RANDOM_SEED)

        # Flips analysis: controllers whose suiteOk is neither all True nor all False across the 3 trials
        ctrl_pass_counts = m_df.groupby('controller')['suiteOk'].sum()
        flipping_ctrls = ctrl_pass_counts[(ctrl_pass_counts > 0) & (ctrl_pass_counts < 3)].index.tolist()
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
            is_flip = bool(0 < p_cnt < 3)
            flip_rows.append({
                'model': m,
                'controller': c,
                'passed_trials_out_of_3': p_cnt,
                'flipped': is_flip
            })

        print(f"Model: {m}")
        print(f"  Suite Success Rate: {overall_rate:.2f}% ({passed_trials}/{total_trials})")
        print(f"  95% Repository-Cluster Bootstrap CI: [{ci_low:.2f}%, {ci_high:.2f}%]")
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

    failures_df = df[df['suiteOk'] == False].copy()

    cat_summary = pd.crosstab(failures_df['errorCategory'], failures_df['model'], margins=True, margins_name='Total')
    reason_summary = pd.crosstab(df['finishReason'], df['model'], margins=True, margins_name='Total')

    print("\nError Category Breakdown (Failures Only):")
    print(cat_summary)

    print("\nFinish Reason Breakdown (All 150 Trials):")
    print(reason_summary)

    cat_summary.to_csv(os.path.join(output_dir, 'error_category_breakdown.csv'))
    reason_summary.to_csv(os.path.join(output_dir, 'finish_reason_breakdown.csv'))

    return cat_summary, reason_summary


def analyze_token_usage(df, output_dir):
    """
    (f) Measured token usage statistics across models (Mean, Median, IQR).
    """
    print("\n--- (f) TOKEN USAGE STATISTICS (All 150 Trials) ---")
    models = ['gemini-3.6-flash', 'gpt-oss-120b']
    token_fields = [
        ('promptTokens', 'Prompt Tokens'),
        ('completionTokens', 'Completion Tokens'),
        ('thinkingOrReasoningTokens', 'Thinking/Reasoning Tokens'),
        ('totalTokens', 'Total Tokens')
    ]

    usage_rows = []
    for m in models:
        m_df = df[df['model'] == m]
        for field, label in token_fields:
            vals = m_df[field].dropna().to_numpy()
            if len(vals) == 0:
                continue
            mean_val = float(np.mean(vals))
            median_val = float(np.median(vals))
            p25 = float(np.percentile(vals, 25))
            p75 = float(np.percentile(vals, 75))
            iqr = p75 - p25

            usage_rows.append({
                'model': m,
                'metric': label,
                'n_trials': len(vals),
                'mean': mean_val,
                'median': median_val,
                'p25': p25,
                'p75': p75,
                'iqr': iqr
            })

    usage_df = pd.DataFrame(usage_rows)
    usage_df.to_csv(os.path.join(output_dir, 'token_usage_summary.csv'), index=False)

    print(usage_df[['model', 'metric', 'n_trials', 'mean', 'median', 'p25', 'p75', 'iqr']].to_string(index=False))
    return usage_df


# ==============================================================================
# Main Orchestrator
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="Statistical Analysis Harness for Set B External Repeated Trials (k=3)")
    parser.add_argument('--self-test', action='store_true', help="Run verification suite with synthetic data and known analytical answers")
    parser.add_argument('--output-dir', type=str, default=None, help="Directory to save analytical tables and CSVs")
    args = parser.parse_args()

    if args.self_test:
        sys.exit(run_self_tests())

    project_root = Path(__file__).resolve().parent
    output_dir = args.output_dir or os.path.join(project_root, 'results', 'analysis_external')
    os.makedirs(output_dir, exist_ok=True)

    print("======================================================================")
    print(" Express.js LLM Benchmark Analysis Harness (Set B External - k=3 Trials)")
    print(f" Working Directory:  {project_root}")
    print(f" Analysis Outputs:   {output_dir}")
    print("======================================================================")

    # 1. Ingest Data
    df, df_mutation = load_data(project_root)
    print(f"\nIngested {len(df)} total trial records across {df['controller'].nunique()} controllers.")

    # 2. Completeness
    analyze_completeness(df, output_dir)

    # 3. Per-trial summaries
    analyze_per_trial_summary(df, output_dir)

    # 4. Primary comparison
    analyze_primary_comparison(df, output_dir)

    # 5. Per-controller means
    analyze_per_controller_means(df, output_dir)

    # 6. Sensitivity analyses A & B
    analyze_sensitivity_a(df, output_dir)
    analyze_sensitivity_b(df, output_dir)

    # 7. Suite success & flips
    analyze_suite_success(df, output_dir)

    # 8. Failure taxonomy
    analyze_failures(df, output_dir)

    # 9. Token usage
    analyze_token_usage(df, output_dir)

    print("\n======================================================================")
    print(f" Set B Analysis complete. All tables and CSVs saved to: {output_dir}")
    print("======================================================================\n")


if __name__ == '__main__':
    main()
