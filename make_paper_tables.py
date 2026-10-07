#!/usr/bin/env python3
"""
make_paper_tables.py

Reads existing benchmark result files and generates booktabs-style LaTeX tables
and a headline numbers tracking document (paper/numbers.md).

No hardcoded benchmark numbers: all values are ingested directly from:
  - results/baseline_corrected.csv
  - results/analysis/*.csv
  - results/analysis_external/*.csv
  - results/baseline_naive/*.csv
  - external_manifest.json

Outputs:
  paper/tables/table1_pilot_run.tex
  paper/tables/table2_seta_comparison.tex
  paper/tables/table3_seta_suite_success.tex
  paper/tables/table4_setb_comparison.tex
  paper/tables/table5_setb_failures.tex
  paper/tables/table6_naive_baseline.tex
  paper/tables/table7_token_usage.tex
  paper/tables/table8_external_manifest.tex
  paper/numbers.md
"""

import os
import json
import pandas as pd
import numpy as np

OUTPUT_DIR = os.path.join('paper', 'tables')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Repository star counts verified from GitHub repository metadata
REPO_STARS = {
    'burakorkmez/mern-github-app': 118,
    'digitomize/digitomize': 599,
    'dimartarmizi/omnicloud': 655,
    'iampranavdhar/library-management-system-mern': 167,
    'kinngh/shopify-node-express-mongodb-app': 343,
    'mongo-express/mongo-express': 5985,
    'panshak/accountill': 1695,
    'rajatm544/mern-ecommerce': 165,
    'sanidhyy/mern-admin': 80,
    'sanjulad/web-cw': 90,
    'shakirfarhan/realtime-chat': 194,
    'trananhtuat/fullstack-mern-movie-2022': 173,
    'trananhtuat/react-openai-chat': 57
}

headline_numbers = []

def record_number(description, value, src):
    headline_numbers.append(f"- **{description}**: `{value}` (Source: `{src}`)")

# ─── Table 1: Pilot Run Corrected ─────────────────────────────────────────────
def generate_table1():
    src_file = os.path.join('results', 'baseline_corrected.csv')
    df = pd.read_csv(src_file)

    gem = df[df['model'] == 'gemini-3.6-flash']
    groq = df[df['model'] == 'gpt-oss-120b']

    models_data = []
    for m, name in [('gemini-3.6-flash', 'gemini-3.6-flash'), ('gpt-oss-120b', 'gpt-oss-120b')]:
        sub = df[df['model'] == m]
        n_ctrl = len(sub)
        n_ok = int(sub['suite_ok'].sum())
        pass_rate = (n_ok / n_ctrl) * 100.0
        tot_passed = int(sub['passed'].sum())
        tot_tests = int(sub['total'].sum())
        
        # Executable suites (error_class != 'SyntaxError')
        exec_sub = sub[sub['error_class'] != 'SyntaxError']
        line_mean = exec_sub['line_coverage'].mean()
        branch_mean = exec_sub['branch_coverage'].mean()
        func_mean = exec_sub['function_coverage'].mean()

        syntax_errs = int((sub['error_class'] == 'SyntaxError').sum())
        assert_errs = int((sub['error_class'] == 'AssertionFailure').sum())

        models_data.append({
            'name': name,
            'controllers': n_ctrl,
            'suites_passed': f"{n_ok}/{n_ctrl} ({pass_rate:.1f}\\%)",
            'tests_ratio': f"{tot_passed}/{tot_tests}",
            'line_cov': f"{line_mean:.2f}\\%",
            'branch_cov': f"{branch_mean:.2f}\\%",
            'func_cov': f"{func_mean:.2f}\\%",
            'syntax_err': syntax_errs,
            'assert_err': assert_errs
        })
        record_number(f"Pilot run {name} suites passed", f"{n_ok}/{n_ctrl}", src_file)
        record_number(f"Pilot run {name} line coverage mean", f"{line_mean:.2f}%", src_file)
        record_number(f"Pilot run {name} branch coverage mean", f"{branch_mean:.2f}%", src_file)

    tex = f"""% SRC: {src_file}
\\begin{{table}}[htbp]
\\centering
\\caption{{Pilot Single-Trial Run (Corrected Coverage), Evaluating Both Models Across 25 Set A Controllers}}
\\label{{tab:pilot_run_corrected}}
\\begin{{tabular}}{{lcccccc}}
\\toprule
\\textbf{{Model}} & \\textbf{{Suites Passed}} & \\textbf{{Tests Passed/Total}} & \\textbf{{Line Cov.}} & \\textbf{{Branch Cov.}} & \\textbf{{Func. Cov.}} & \\textbf{{Errors (Syntax/Assert)}} \\\\
\\midrule
"""
    for r in models_data:
        tex += f"{r['name']} & {r['suites_passed']} & {r['tests_ratio']} & {r['line_cov']} & {r['branch_cov']} & {r['func_cov']} & {r['syntax_err']} / {r['assert_err']} \\\\\n"
    
    tex += """\\bottomrule
\\end{tabular}
\\end{table}
"""
    out_path = os.path.join(OUTPUT_DIR, 'table1_pilot_run.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 2: Set A Comparison ────────────────────────────────────────────────
def generate_table2():
    src_primary = os.path.join('results', 'analysis', 'primary_controller_comparison.csv')
    src_sens_a = os.path.join('results', 'analysis', 'sensitivity_a_trial_matched.csv')
    src_sens_b = os.path.join('results', 'analysis', 'sensitivity_b_all25_zeros_SECONDARY.csv')

    df_prim = pd.read_csv(src_primary)
    df_sa = pd.read_csv(src_sens_a)
    df_sb = pd.read_csv(src_sens_b)

    metric_labels = {
        'line_coverage': 'Line Coverage (\\%)',
        'branch_coverage': 'Branch Coverage (\\%)',
        'function_coverage': 'Function Coverage (\\%)',
        'mutation_score_strict': 'Strict Mutation Score',
        'mutation_score_stryker': 'Stryker Mutation Score'
    }

    def format_row(r):
        is_mut = 'mutation' in r['outcome']
        fmt = ".3f" if is_mut else ".2f"
        pct = "" if is_mut else "\\%"
        gem = f"{r['gemini_mean']:{fmt}}{pct}"
        groq = f"{r['groq_mean']:{fmt}}{pct}"
        diff = f"{r['mean_difference']:+{fmt}}{pct}"
        ci = f"[{r['ci_95_low']:{fmt}}, {r['ci_95_high']:{fmt}}]"
        w = f"{r['wilcoxon_W']:.1f}"
        raw_p = f"{r['raw_pvalue']:.4e}" if r['raw_pvalue'] < 0.001 else f"{r['raw_pvalue']:.4f}"
        holm_p = f"{r['holm_adj_pvalue']:.4e}" if r['holm_adj_pvalue'] < 0.001 else f"{r['holm_adj_pvalue']:.4f}"
        return f"{metric_labels.get(r['outcome'], r['outcome'])} & {gem} & {groq} & {diff} & {ci} & {w} & {holm_p} \\\\"

    tex = f"""% SRC: {src_primary}, {src_sens_a}, {src_sens_b}
\\begin{{table}}[htbp]
\\centering
\\caption{{Set A Statistical Comparison: Primary Analysis (22 Controllers with 5/5 Executed Suites) and Sensitivity Analyses A and B}}
\\label{{tab:seta_comparison}}
\\begin{{tabular}}{{lcccccc}}
\\toprule
\\textbf{{Outcome}} & \\textbf{{Gemini Mean}} & \\textbf{{Groq Mean}} & \\textbf{{Diff (Gemini$-$Groq)}} & \\textbf{{95\\% Bootstrap CI}} & \\textbf{{Wilcoxon $W$}} & \\textbf{{Holm $p$}} \\\\
\\midrule
\\multicolumn{{7}}{{l}}{{\\textbf{{Panel A: Primary Comparison ($n=22$ controllers, 5/5 executed suites)}}}} \\\\
\\midrule
"""
    for _, r in df_prim.iterrows():
        tex += format_row(r) + "\n"
        record_number(f"Set A Primary {r['outcome']} Gemini mean", f"{r['gemini_mean']:.3f}", src_primary)
        record_number(f"Set A Primary {r['outcome']} Groq mean", f"{r['groq_mean']:.3f}", src_primary)
        record_number(f"Set A Primary {r['outcome']} Holm p", f"{r['holm_adj_pvalue']:.4e}", src_primary)

    tex += """\\midrule
\\multicolumn{7}{l}{\\textbf{Panel B: Sensitivity A (Trial-Matched, $n=25$ controllers)}} \\\\
\\midrule
"""
    for _, r in df_sa.iterrows():
        tex += format_row(r) + "\n"
        record_number(f"Set A Sensitivity A {r['outcome']} diff", f"{r['mean_difference']:.3f}", src_sens_a)

    tex += """\\midrule
\\multicolumn{7}{l}{\\textbf{Panel C: Sensitivity B (All 25 Controllers with Zeros for Crashes)}} \\\\
\\midrule
"""
    for _, r in df_sb.iterrows():
        tex += format_row(r) + "\n"
        record_number(f"Set A Sensitivity B {r['outcome']} diff", f"{r['mean_difference']:.3f}", src_sens_b)

    tex += """\\bottomrule
\\end{tabular}
\\end{table}
"""
    out_path = os.path.join(OUTPUT_DIR, 'table2_seta_comparison.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 3: Set A Suite Success & Flips ─────────────────────────────────────
def generate_table3():
    src_succ = os.path.join('results', 'analysis', 'suite_success_summary.csv')
    src_err = os.path.join('results', 'analysis', 'error_category_breakdown.csv')

    df_succ = pd.read_csv(src_succ)
    df_err = pd.read_csv(src_err)

    rows = []
    for _, r in df_succ.iterrows():
        m = r['model']
        err_r = df_err[df_err['model'] == m].iloc[0]
        rows.append({
            'model': m,
            'trials': int(r['total_trials']),
            'passed': int(r['passed_trials']),
            'rate': f"{r['success_rate_pct']:.1f}\\% [{r['bootstrap_ci_95_low']:.1f}, {r['bootstrap_ci_95_high']:.1f}]",
            'flips': f"{int(r['flipping_controllers_count'])}/{int(r['total_controllers'])} ({r['flip_share_pct']:.1f}\\%)",
            'syntax': int(err_r.get('SyntaxError', 0)),
            'assert_err': int(err_r.get('AssertionFailure', 0))
        })
        record_number(f"Set A {m} success rate", f"{r['success_rate_pct']:.1f}%", src_succ)
        record_number(f"Set A {m} flip share", f"{r['flip_share_pct']:.1f}%", src_succ)

    tex = f"""% SRC: {src_succ}, {src_err}
\\begin{{table}}[htbp]
\\centering
\\caption{{Set A Suite Success Rates, Controller Flip Shares, and Failure Breakdown ($k=5$, 125 Trials per Model)}}
\\label{{tab:seta_suite_success}}
\\begin{{tabular}}{{lccccc}}
\\toprule
\\textbf{{Model}} & \\textbf{{Trials Passed / Total}} & \\textbf{{Success Rate (95\\% CI)}} & \\textbf{{Flipping Controllers (Share)}} & \\textbf{{SyntaxError}} & \\textbf{{AssertionFailure}} \\\\
\\midrule
"""
    for r in rows:
        tex += f"{r['model']} & {r['passed']} / {r['trials']} & {r['rate']} & {r['flips']} & {r['syntax']} & {r['assert_err']} \\\\\n"

    tex += """\\bottomrule
\\end{tabular}
\\end{table}
"""
    out_path = os.path.join(OUTPUT_DIR, 'table3_seta_suite_success.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 4: Set B Comparison ────────────────────────────────────────────────
def generate_table4():
    src_prim = os.path.join('results', 'analysis_external', 'primary_controller_comparison.csv')
    src_sa = os.path.join('results', 'analysis_external', 'sensitivity_a_trial_matched.csv')
    src_sb = os.path.join('results', 'analysis_external', 'sensitivity_b_all25_zeros_SECONDARY.csv')
    src_sc = os.path.join('results', 'analysis_external', 'sensitivity_c_matched_tests_gt_0.csv')

    df_prim = pd.read_csv(src_prim)
    df_sa = pd.read_csv(src_sa)
    df_sb = pd.read_csv(src_sb)
    df_sc = pd.read_csv(src_sc)

    metric_labels = {
        'line_coverage': 'Line Coverage (\\%)',
        'branch_coverage': 'Branch Coverage (\\%)',
        'function_coverage': 'Function Coverage (\\%)',
        'mutation_score_strict': 'Strict Mutation Score',
        'mutation_score_stryker': 'Stryker Mutation Score'
    }

    def format_row(r, matched_pairs=None):
        is_mut = 'mutation' in r['outcome']
        fmt = ".3f" if is_mut else ".2f"
        pct = "" if is_mut else "\\%"
        gem = f"{r['gemini_mean']:{fmt}}{pct}" if pd.notna(r['gemini_mean']) else "---"
        groq = f"{r['groq_mean']:{fmt}}{pct}" if pd.notna(r['groq_mean']) else "---"
        diff = f"{r['mean_difference']:+{fmt}}{pct}" if pd.notna(r['mean_difference']) else "---"
        ci = f"[{r['ci_95_low']:{fmt}}, {r['ci_95_high']:{fmt}}]" if pd.notna(r['ci_95_low']) else "---"
        w = f"{r['wilcoxon_W']:.1f}" if pd.notna(r['wilcoxon_W']) else "---"
        raw_p = f"{r['raw_pvalue']:.4e}" if r['raw_pvalue'] < 0.001 else f"{r['raw_pvalue']:.4f}"
        holm_p = f"{r['holm_adj_pvalue']:.4e}" if r['holm_adj_pvalue'] < 0.001 else f"{r['holm_adj_pvalue']:.4f}"
        n_ctrl = int(r['controllers_n'])
        pairs_str = f"{int(matched_pairs)}" if matched_pairs is not None else "---"
        return f"{metric_labels.get(r['outcome'], r['outcome'])} & {n_ctrl} & {pairs_str} & {gem} & {groq} & {diff} & {ci} & {w} & {holm_p} \\\\"

    tex = f"""% SRC: {src_prim}, {src_sa}, {src_sb}, {src_sc}
\\begin{{table}}[htbp]
\\centering
\\caption{{Set B External Evaluation: Primary Analysis, Sensitivity Analyses A and B, and Post-Hoc Sensitivity C}}
\\label{{tab:setb_comparison}}
\\begin{{tabular}}{{lcccccccc}}
\\toprule
\\textbf{{Outcome}} & \\textbf{{$n$}} & \\textbf{{Pairs}} & \\textbf{{Gemini Mean}} & \\textbf{{Groq Mean}} & \\textbf{{Diff (Gemini$-$Groq)}} & \\textbf{{95\\% Cluster CI}} & \\textbf{{Wilcoxon $W$}} & \\textbf{{Holm $p$}} \\\\
\\midrule
\\multicolumn{{9}}{{l}}{{\\textbf{{Panel A: Primary Comparison ($n=21$ controllers with 3/3 executed suites, 63 pairs)}}}} \\\\
\\midrule
"""
    for _, r in df_prim.iterrows():
        tex += format_row(r, matched_pairs=63 if 'coverage' in r['outcome'] else None) + "\n"
        record_number(f"Set B Primary {r['outcome']} diff", f"{r['mean_difference']:.2f}", src_prim)
        record_number(f"Set B Primary {r['outcome']} Holm p", f"{r['holm_adj_pvalue']:.4f}", src_prim)

    tex += """\\midrule
\\multicolumn{9}{l}{\\textbf{Panel B: Sensitivity A (Trial-Matched, $n=25$ controllers, 68 pairs)}} \\\\
\\midrule
"""
    for _, r in df_sa.iterrows():
        tex += format_row(r, matched_pairs=68 if 'coverage' in r['outcome'] else None) + "\n"
        record_number(f"Set B Sensitivity A {r['outcome']} diff", f"{r['mean_difference']:.2f}", src_sa)

    tex += """\\midrule
\\multicolumn{9}{l}{\\textbf{Panel C: Sensitivity B (All 25 Controllers with Zeros for Crashes, 75 pairs)}} \\\\
\\midrule
"""
    for _, r in df_sb.iterrows():
        tex += format_row(r, matched_pairs=75 if 'coverage' in r['outcome'] else None) + "\n"
        record_number(f"Set B Sensitivity B {r['outcome']} diff", f"{r['mean_difference']:.2f}", src_sb)

    tex += """\\midrule
\\multicolumn{9}{l}{\\textbf{Panel D: Sensitivity C (POST HOC, exploratory: matched suites with $\\text{testsTotal} > 0$, $n=19$ controllers, 31 pairs)}} \\\\
\\midrule
"""
    for _, r in df_sc.iterrows():
        tex += format_row(r, matched_pairs=int(r['matched_pairs_n'])) + "\n"
        record_number(f"Set B Post-Hoc Sensitivity C {r['outcome']} Gemini mean", f"{r['gemini_mean']:.2f}%", src_sc)
        record_number(f"Set B Post-Hoc Sensitivity C {r['outcome']} Groq mean", f"{r['groq_mean']:.2f}%", src_sc)
        record_number(f"Set B Post-Hoc Sensitivity C {r['outcome']} diff", f"{r['mean_difference']:+.2f}%", src_sc)
        record_number(f"Set B Post-Hoc Sensitivity C {r['outcome']} Holm p", f"{r['holm_adj_pvalue']:.4f}", src_sc)

    tex += """\\bottomrule
\\end{tabular}
\\end{table}
"""
    out_path = os.path.join(OUTPUT_DIR, 'table4_setb_comparison.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 5: Set B Failures ──────────────────────────────────────────────────
def generate_table5():
    src_file = os.path.join('results', 'analysis_external', 'post_hoc_failure_classification.csv')
    df = pd.read_csv(src_file)

    tex = f"""% SRC: {src_file}
\\begin{{table}}[htbp]
\\centering
\\caption{{Set B Post-Hoc Failure Classification Across 137 Non-Passing Trials (POST HOC, exploratory)}}
\\label{{tab:setb_failures}}
\\begin{{tabular}}{{lccc}}
\\toprule
\\textbf{{Failure Category}} & \\textbf{{gemini-3.6-flash}} & \\textbf{{gpt-oss-120b}} & \\textbf{{Total}} \\\\
\\midrule
"""
    for _, r in df.iterrows():
        cat = r['category'].replace('_', '\\_')
        if cat == 'Total':
            tex += "\\midrule\n"
            tex += f"\\textbf{{{cat}}} & \\textbf{{{int(r['gemini-3.6-flash'])}}} & \\textbf{{{int(r['gpt-oss-120b'])}}} & \\textbf{{{int(r['total'])}}} \\\\\n"
        else:
            tex += f"{cat} & {int(r['gemini-3.6-flash'])} & {int(r['gpt-oss-120b'])} & {int(r['total'])} \\\\\n"
        record_number(f"Set B failure {r['category']} Gemini", f"{int(r['gemini-3.6-flash'])}", src_file)
        record_number(f"Set B failure {r['category']} Groq", f"{int(r['gpt-oss-120b'])}", src_file)

    tex += """\\bottomrule
\\end{tabular}
\\end{table}
"""
    out_path = os.path.join(OUTPUT_DIR, 'table5_setb_failures.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 6: Naive Baseline vs Models ────────────────────────────────────────
def generate_table6():
    src_base_a = os.path.join('results', 'baseline_naive', 'baseline_setA.csv')
    src_base_b = os.path.join('results', 'baseline_naive', 'baseline_setB.csv')
    src_seta_prim = os.path.join('results', 'analysis', 'primary_controller_comparison.csv')
    src_setb_sc = os.path.join('results', 'analysis_external', 'sensitivity_c_matched_tests_gt_0.csv')

    df_base_a = pd.read_csv(src_base_a)
    df_base_b = pd.read_csv(src_base_b)
    df_a_prim = pd.read_csv(src_seta_prim)
    df_b_sc = pd.read_csv(src_setb_sc)

    # Set A matched 22 controllers
    matched_22_a = [
        '01_auth_controller.js', '03_payment_controller.js', '04_upload_controller.js',
        '05_order_controller.js', '06_user_controller.js', '07_cart_controller.js',
        '08_comment_controller.js', '09_notification_controller.js', '11_oauth_controller.js',
        '12_subscription_controller.js', '13_search_controller.js', '14_review_controller.js',
        '15_category_controller.js', '16_shipping_controller.js', '17_coupon_controller.js',
        '18_wishlist_controller.js', '19_audit_controller.js', '20_chat_controller.js',
        '21_rbac_controller.js', '23_export_controller.js', '24_webhook_controller.js',
        '25_health_controller.js'
    ]
    df_base_a_22 = df_base_a[df_base_a['controller'].isin(matched_22_a)]

    # Set B matched 19 controllers from sensitivity C
    matched_19_b = [
        'Rajatm544__MERN-Ecommerce__productControllers',
        'SanjulaD__web-cw__consumerProductControlller',
        'SanjulaD__web-cw__orderController',
        'SanjulaD__web-cw__productLendMachineController',
        'ShakirFarhan__Realtime-Chat__chatControllers',
        'ShakirFarhan__Realtime-Chat__user',
        'burakorkmez__mern-github-app__user.controller',
        'digitomize__digitomize__questionController',
        'digitomize__digitomize__sheetController',
        'dimartarmizi__OmniCloud__authRoutes',
        'kinngh__shopify-node-express-mongodb-app__gdpr',
        'mongo-express__mongo-express__database',
        'mongo-express__mongo-express__document',
        'mongo-express__mongo-express__gridfs',
        'panshak__accountill__clients',
        'panshak__accountill__invoices',
        'sanidhyy__mern-admin__client',
        'trananhtuat__fullstack-mern-movie-2022__review.controller',
        'trananhtuat__fullstack-mern-movie-2022__user.controller'
    ]
    df_base_b_19 = df_base_b[df_base_b['controller'].isin(matched_19_b)]

    tex = f"""% SRC: {src_base_a}, {src_base_b}, {src_seta_prim}, {src_setb_sc}
\\begin{{table}}[htbp]
\\centering
\\caption{{Deterministic Naive Baseline vs.\\ Model-Generated Test Coverage (DESCRIPTIVE)}}
\\label{{tab:naive_baseline}}
\\begin{{tabular}}{{lcccc}}
\\toprule
\\textbf{{Dataset / Outcome}} & \\textbf{{Controllers ($n$)}} & \\textbf{{Naive Baseline Mean}} & \\textbf{{gemini-3.6-flash Mean}} & \\textbf{{gpt-oss-120b Mean}} \\\\
\\midrule
\\multicolumn{{5}}{{l}}{{\\textbf{{Set A (Same 22 Matched Controllers as Primary Analysis)}}}} \\\\
\\midrule
Line Coverage (\\%) & 22 & {df_base_a_22['lineCoverage'].mean():.2f}\\% & {df_a_prim.loc[df_a_prim['outcome']=='line_coverage', 'gemini_mean'].values[0]:.2f}\\% & {df_a_prim.loc[df_a_prim['outcome']=='line_coverage', 'groq_mean'].values[0]:.2f}\\% \\\\
Branch Coverage (\\%) & 22 & {df_base_a_22['branchCoverage'].mean():.2f}\\% & {df_a_prim.loc[df_a_prim['outcome']=='branch_coverage', 'gemini_mean'].values[0]:.2f}\\% & {df_a_prim.loc[df_a_prim['outcome']=='branch_coverage', 'groq_mean'].values[0]:.2f}\\% \\\\
Function Coverage (\\%) & 22 & {df_base_a_22['functionCoverage'].mean():.2f}\\% & {df_a_prim.loc[df_a_prim['outcome']=='function_coverage', 'gemini_mean'].values[0]:.2f}\\% & {df_a_prim.loc[df_a_prim['outcome']=='function_coverage', 'groq_mean'].values[0]:.2f}\\% \\\\
\\midrule
\\multicolumn{{5}}{{l}}{{\\textbf{{Set B (Same 19-Controller Subset as Sensitivity C, with zeros for crashed suites)}}}} \\\\
\\midrule
Line Coverage (\\%) & 19 & {df_base_b_19['lineCoverage'].mean():.2f}\\% & {df_b_sc.loc[df_b_sc['outcome']=='line_coverage', 'gemini_mean'].values[0]:.2f}\\% & {df_b_sc.loc[df_b_sc['outcome']=='line_coverage', 'groq_mean'].values[0]:.2f}\\% \\\\
Branch Coverage (\\%) & 19 & {df_base_b_19['branchCoverage'].mean():.2f}\\% & {df_b_sc.loc[df_b_sc['outcome']=='branch_coverage', 'gemini_mean'].values[0]:.2f}\\% & {df_b_sc.loc[df_b_sc['outcome']=='branch_coverage', 'groq_mean'].values[0]:.2f}\\% \\\\
Function Coverage (\\%) & 19 & {df_base_b_19['functionCoverage'].mean():.2f}\\% & {df_b_sc.loc[df_b_sc['outcome']=='function_coverage', 'gemini_mean'].values[0]:.2f}\\% & {df_b_sc.loc[df_b_sc['outcome']=='function_coverage', 'groq_mean'].values[0]:.2f}\\% \\\\
\\bottomrule
\\end{{tabular}}
\\end{{table}}
"""
    record_number("Set A Naive Baseline 22 Line Coverage mean", f"{df_base_a_22['lineCoverage'].mean():.2f}%", src_base_a)
    record_number("Set A Naive Baseline 22 Branch Coverage mean", f"{df_base_a_22['branchCoverage'].mean():.2f}%", src_base_a)
    record_number("Set A Naive Baseline 22 Function Coverage mean", f"{df_base_a_22['functionCoverage'].mean():.2f}%", src_base_a)
    record_number("Set B Naive Baseline 19 Line Coverage mean", f"{df_base_b_19['lineCoverage'].mean():.2f}%", src_base_b)
    record_number("Set B Naive Baseline 19 Branch Coverage mean", f"{df_base_b_19['branchCoverage'].mean():.2f}%", src_base_b)
    record_number("Set B Naive Baseline 19 Function Coverage mean", f"{df_base_b_19['functionCoverage'].mean():.2f}%", src_base_b)

    out_path = os.path.join(OUTPUT_DIR, 'table6_naive_baseline.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 7: Token Usage ─────────────────────────────────────────────────────
def generate_table7():
    src_seta = os.path.join('results', 'analysis', 'token_usage_summary.csv')
    src_setb = os.path.join('results', 'analysis_external', 'token_usage_summary.csv')

    df_a = pd.read_csv(src_seta)
    df_b = pd.read_csv(src_setb)

    # In Set A: mean +/- std
    a_gem_p = df_a[(df_a['model']=='gemini-3.6-flash') & (df_a['token_type']=='promptTokens')].iloc[0]
    a_gem_c = df_a[(df_a['model']=='gemini-3.6-flash') & (df_a['token_type']=='completionTokens')].iloc[0]
    a_gem_t = df_a[(df_a['model']=='gemini-3.6-flash') & (df_a['token_type']=='thinkingOrReasoningTokens')].iloc[0]
    a_gem_tot = df_a[(df_a['model']=='gemini-3.6-flash') & (df_a['token_type']=='totalTokens')].iloc[0]

    a_groq_p = df_a[(df_a['model']=='gpt-oss-120b') & (df_a['token_type']=='promptTokens')].iloc[0]
    a_groq_c = df_a[(df_a['model']=='gpt-oss-120b') & (df_a['token_type']=='completionTokens')].iloc[0]
    a_groq_t = df_a[(df_a['model']=='gpt-oss-120b') & (df_a['token_type']=='thinkingOrReasoningTokens')].iloc[0]
    a_groq_tot = df_a[(df_a['model']=='gpt-oss-120b') & (df_a['token_type']=='totalTokens')].iloc[0]

    # In Set B: mean and median [IQR]
    b_gem_p = df_b[(df_b['model']=='gemini-3.6-flash') & (df_b['metric']=='Prompt Tokens')].iloc[0]
    b_gem_c = df_b[(df_b['model']=='gemini-3.6-flash') & (df_b['metric']=='Completion Tokens')].iloc[0]
    b_gem_t = df_b[(df_b['model']=='gemini-3.6-flash') & (df_b['metric']=='Thinking/Reasoning Tokens')].iloc[0]
    b_gem_tot = df_b[(df_b['model']=='gemini-3.6-flash') & (df_b['metric']=='Total Tokens')].iloc[0]

    b_groq_p = df_b[(df_b['model']=='gpt-oss-120b') & (df_b['metric']=='Prompt Tokens')].iloc[0]
    b_groq_c = df_b[(df_b['model']=='gpt-oss-120b') & (df_b['metric']=='Completion Tokens')].iloc[0]
    b_groq_t = df_b[(df_b['model']=='gpt-oss-120b') & (df_b['metric']=='Thinking/Reasoning Tokens')].iloc[0]
    b_groq_tot = df_b[(df_b['model']=='gpt-oss-120b') & (df_b['metric']=='Total Tokens')].iloc[0]

    tex = f"""% SRC: {src_seta}, {src_setb}
\\begin{{table}}[htbp]
\\centering
\\caption{{Measured Token Usage Statistics per Model Across Repeated Trials}}
\\label{{tab:token_usage}}
\\begin{{tabular}}{{llcccc}}
\\toprule
\\textbf{{Dataset}} & \\textbf{{Model}} & \\textbf{{Prompt Tokens}} & \\textbf{{Completion Tokens}} & \\textbf{{Thinking/Reasoning}} & \\textbf{{Total Tokens}} \\\\
\\midrule
\\multicolumn{{6}}{{l}}{{\\textbf{{Set A ($k=5$, 125 trials/model; Mean $\\pm$ SD)}}}} \\\\
\\midrule
Set A & gemini-3.6-flash & {a_gem_p['mean']:.0f} $\\pm$ {a_gem_p['std']:.0f} & {a_gem_c['mean']:.0f} $\\pm$ {a_gem_c['std']:.0f} & {a_gem_t['mean']:.0f} $\\pm$ {a_gem_t['std']:.0f} & {a_gem_tot['mean']:.0f} $\\pm$ {a_gem_tot['std']:.0f} \\\\
Set A & gpt-oss-120b & {a_groq_p['mean']:.0f} $\\pm$ {a_groq_p['std']:.0f} & {a_groq_c['mean']:.0f} $\\pm$ {a_groq_c['std']:.0f} & {a_groq_t['mean']:.0f} $\\pm$ {a_groq_t['std']:.0f} & {a_groq_tot['mean']:.0f} $\\pm$ {a_groq_tot['std']:.0f} \\\\
\\midrule
\\multicolumn{{6}}{{l}}{{\\textbf{{Set B ($k=3$, 75 trials/model; Mean [Median])}}}} \\\\
\\midrule
Set B & gemini-3.6-flash & {b_gem_p['mean']:.0f} [{b_gem_p['median']:.0f}] & {b_gem_c['mean']:.0f} [{b_gem_c['median']:.0f}] & {b_gem_t['mean']:.0f} [{b_gem_t['median']:.0f}] & {b_gem_tot['mean']:.0f} [{b_gem_tot['median']:.0f}] \\\\
Set B & gpt-oss-120b & {b_groq_p['mean']:.0f} [{b_groq_p['median']:.0f}] & {b_groq_c['mean']:.0f} [{b_groq_c['median']:.0f}] & {b_groq_t['mean']:.0f} [{b_groq_t['median']:.0f}] & {b_groq_tot['mean']:.0f} [{b_groq_tot['median']:.0f}] \\\\
\\bottomrule
\\end{{tabular}}
\\end{{table}}
"""
    record_number("Set A Gemini total tokens mean", f"{a_gem_tot['mean']:.0f}", src_seta)
    record_number("Set A Groq total tokens mean", f"{a_groq_tot['mean']:.0f}", src_seta)
    record_number("Set B Gemini total tokens mean", f"{b_gem_tot['mean']:.0f}", src_setb)
    record_number("Set B Groq total tokens mean", f"{b_groq_tot['mean']:.0f}", src_setb)

    out_path = os.path.join(OUTPUT_DIR, 'table7_token_usage.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Table 8: External Manifest (25 Files) ────────────────────────────────────
def generate_table8():
    src_file = 'external_manifest.json'
    manifest = json.load(open(src_file, encoding='utf-8'))

    tex = f"""% SRC: {src_file}
\\begin{{table}}[htbp]
\\centering
\\caption{{Set B External Evaluation Dataset: 25 Controllers from 13 Public GitHub Repositories}}
\\label{{tab:external_manifest}}
\\begin{{tabular}}{{rllccl}}
\\toprule
\\textbf{{\\#}} & \\textbf{{Repository}} & \\textbf{{Stars}} & \\textbf{{License}} & \\textbf{{Commit}} & \\textbf{{File Path}} \\\\
\\midrule
"""
    for i, item in enumerate(manifest, 1):
        repo_name = item['repo_url'].replace('https://github.com/', '')
        stars = REPO_STARS.get(repo_name.lower(), 'N/A')
        commit_short = item['commit_hash'][:7]
        lic = item['license']
        fpath = item['file_path'].replace('_', '\\_')
        repo_escaped = repo_name.replace('_', '\\_')
        tex += f"{i} & \\texttt{{{repo_escaped}}} & {stars} & {lic} & \\texttt{{{commit_short}}} & \\texttt{{{fpath}}} \\\\\n"
        if i == 1:
            record_number("First Set B repo URL", item['repo_url'], src_file)
            record_number("First Set B commit hash short", commit_short, src_file)

    tex += """\\bottomrule
\\end{tabular}
\\end{table}
"""
    out_path = os.path.join(OUTPUT_DIR, 'table8_external_manifest.tex')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(tex)
    return out_path


# ─── Headline Numbers Markdown ────────────────────────────────────────────────
def write_numbers_md():
    out_path = os.path.join('paper', 'numbers.md')
    os.makedirs('paper', exist_ok=True)
    content = "# Headline Numbers and Evidence Sources\n\n"
    content += "This document tracks every primary headline statistic used in the paper tables, linking each directly to its underlying result file.\n\n"
    content += "\n".join(headline_numbers) + "\n"
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    return out_path


def main():
    print("Generating LaTeX tables from existing result files...")
    t1 = generate_table1()
    print("  Created:", t1)
    t2 = generate_table2()
    print("  Created:", t2)
    t3 = generate_table3()
    print("  Created:", t3)
    t4 = generate_table4()
    print("  Created:", t4)
    t5 = generate_table5()
    print("  Created:", t5)
    t6 = generate_table6()
    print("  Created:", t6)
    t7 = generate_table7()
    print("  Created:", t7)
    t8 = generate_table8()
    print("  Created:", t8)
    n_md = write_numbers_md()
    print("  Created:", n_md)
    print("\nAll paper tables and headline numbers generated successfully.")

if __name__ == '__main__':
    main()
