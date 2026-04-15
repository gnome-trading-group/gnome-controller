"""Dev server adapter — extends ProdAdapter, only overrides report loading (local parquet)."""
from __future__ import annotations

import os
from pathlib import Path

from agent.adapters.prod import ProdAdapter


class DevAdapter(ProdAdapter):
    """Uses ProdAdapter for everything (GitHub API for code, controller API
    for presets/backtests). Only overrides get_report_summary to read
    results from local parquet files instead of the controller API.
    """

    def get_report_summary(self, job_id: str, **kw) -> dict:
        import pandas as pd

        out_dir = Path(os.environ.get("BACKTEST_OUTPUT_ROOT", "./backtest-runs")) / job_id
        market_path = out_dir / "market_records.parquet"

        if not market_path.exists():
            return {"error": f"No results found for job {job_id}"}

        try:
            from gnomepy_research.reporting.backtest.report import BacktestReport

            market_df = pd.read_parquet(market_path)
            exec_path = out_dir / "execution_records.parquet"
            exec_df = pd.read_parquet(exec_path) if exec_path.exists() else pd.DataFrame()
            intent_path = out_dir / "intent_records.parquet"
            intent_df = pd.read_parquet(intent_path) if intent_path.exists() else pd.DataFrame()

            report = BacktestReport.from_dataframes(market_df=market_df, exec_df=exec_df, intent_df=intent_df)
            summary = report.summary()
            clean = {}
            for k, v in summary.items():
                if isinstance(v, dict):
                    clean[k] = {str(kk): float(vv) for kk, vv in v.items()}
                elif isinstance(v, float):
                    clean[k] = round(v, 6)
                else:
                    clean[k] = v
            return {"summary": clean}
        except Exception as e:
            return {"error": str(e)}
