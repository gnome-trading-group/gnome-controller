"""Local dev server for backtest endpoints.

Runs backtests as local subprocesses (no Docker, no Batch).
Presets stored in DynamoDB. Jobs tracked in memory.

Setup:
    cd gnome-controller/dev
    poetry install
    poetry run python server.py

Frontend: set VITE_CONTROLLER_API_URL=http://localhost:5050/api
"""
from __future__ import annotations

import os
import secrets
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import boto3
from flask import Flask, request, jsonify, send_file, abort

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PRESETS_TABLE = os.environ.get("PRESETS_TABLE", "gnome-backtest-presets-dev")
OUTPUT_ROOT = Path(os.environ.get("BACKTEST_OUTPUT_ROOT", "./backtest-runs"))
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
GNOMEPY_DIR = Path(os.environ.get("GNOMEPY_DIR", str(Path(__file__).resolve().parent.parent.parent / "gnomepy")))

dynamodb = boto3.resource("dynamodb")
presets_table = dynamodb.Table(PRESETS_TABLE)

# In-memory job tracker, seeded from existing runs on disk.
jobs: dict[str, dict] = {}


def _load_existing_runs() -> None:
    """Scan OUTPUT_ROOT for previous backtest runs and populate jobs dict."""
    import json as _json
    for run_dir in OUTPUT_ROOT.iterdir():
        if not run_dir.is_dir():
            continue
        job_id = run_dir.name
        if job_id in jobs:
            continue

        manifest_path = run_dir / "manifest.json"
        config_path = run_dir / "config.yaml"
        report_path = run_dir / "report.html"

        # Determine status from what's on disk.
        has_results = any(run_dir.glob("*.parquet"))
        status = "SUCCEEDED" if has_results else "FAILED"

        job: dict = {
            "jobId": job_id,
            "batchJobId": f"local-{job_id[:8]}",
            "status": status,
            "presetId": "",
            "presetName": "",
            "researchCommit": "",
            "submittedBy": "local",
            "submittedAt": "",
        }

        # Enrich from manifest if available.
        if manifest_path.exists():
            try:
                manifest = _json.loads(manifest_path.read_text())
                job["submittedAt"] = manifest.get("created_at", "")
                job["completedAt"] = manifest.get("created_at", "")
                job["researchCommit"] = manifest.get("gnomepy_research_commit") or ""
            except Exception:
                pass

        if not job["submittedAt"]:
            # Fall back to directory mtime.
            from datetime import datetime, timezone
            mtime = run_dir.stat().st_mtime
            job["submittedAt"] = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
            job["completedAt"] = job["submittedAt"]

        jobs[job_id] = job

    if jobs:
        print(f"Loaded {len(jobs)} existing run(s) from {OUTPUT_ROOT}")


_load_existing_runs()


def _uuid7() -> str:
    ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    ra = secrets.randbits(12)
    rb = secrets.randbits(62)
    n = (ms << 80) | (0x7 << 76) | (ra << 64) | (0b10 << 62) | rb
    h = f"{n:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


# ---------------------------------------------------------------------------
# Presets (DynamoDB)
# ---------------------------------------------------------------------------
@app.route("/api/backtests/presets", methods=["GET", "POST", "OPTIONS"])
def presets_collection():
    if request.method == "OPTIONS":
        return "", 204

    if request.method == "GET":
        result = presets_table.scan()
        items = sorted(result.get("Items", []), key=lambda p: p.get("createdAt", ""))
        return jsonify({"presets": items})

    # POST — create preset.
    body = request.get_json(force=True)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "presetId": _uuid7(),
        "name": body["name"],
        "description": body.get("description", ""),
        "config": body["config"],
        "createdBy": "local",
        "createdAt": now,
        "updatedAt": now,
    }
    presets_table.put_item(Item=item)
    return jsonify(item), 201


@app.route("/api/backtests/presets/<preset_id>", methods=["PUT", "DELETE", "OPTIONS"])
def preset_item(preset_id: str):
    if request.method == "OPTIONS":
        return "", 204

    if request.method == "DELETE":
        presets_table.delete_item(Key={"presetId": preset_id})
        return jsonify({"deleted": preset_id})

    # PUT — update.
    body = request.get_json(force=True)
    existing = presets_table.get_item(Key={"presetId": preset_id}).get("Item")
    if not existing:
        return jsonify({"error": "not found"}), 404
    now = datetime.now(timezone.utc).isoformat()
    existing["name"] = body.get("name", existing["name"])
    existing["description"] = body.get("description", existing.get("description", ""))
    existing["config"] = body.get("config", existing["config"])
    existing["updatedAt"] = now
    presets_table.put_item(Item=existing)
    return jsonify(existing)


# ---------------------------------------------------------------------------
# Backtest jobs
# ---------------------------------------------------------------------------
@app.route("/api/backtests", methods=["GET", "POST", "OPTIONS"])
def backtests_collection():
    if request.method == "OPTIONS":
        return "", 204

    if request.method == "GET":
        job_list = sorted(jobs.values(), key=lambda j: j.get("submittedAt", ""), reverse=True)
        return jsonify({"jobs": job_list})

    # POST — submit backtest.
    body = request.get_json(force=True)
    preset_id = body.get("presetId")
    config_yaml = body.get("config")
    backtest_name = body.get("name", "")
    research_commit = body.get("researchCommit", "main")

    preset_name = ""
    if config_yaml and preset_id:
        preset = presets_table.get_item(Key={"presetId": preset_id}).get("Item")
        preset_name = preset.get("name", "") if preset else ""
    elif preset_id:
        preset = presets_table.get_item(Key={"presetId": preset_id}).get("Item")
        if not preset:
            return jsonify({"error": f"Preset {preset_id} not found"}), 404
        config_yaml = preset["config"]
        preset_name = preset.get("name", "")
    elif not config_yaml:
        return jsonify({"error": "Either presetId or config is required"}), 400

    job_id = _uuid7()
    now = datetime.now(timezone.utc).isoformat()

    job = {
        "jobId": job_id,
        "batchJobId": f"local-{job_id[:8]}",
        "status": "RUNNING",
        "name": backtest_name or preset_name,
        "presetId": preset_id or "",
        "presetName": preset_name,
        "researchCommit": research_commit,
        "submittedBy": "local",
        "submittedAt": now,
    }
    jobs[job_id] = job

    # Write config to a temp file (not inside output dir, to avoid
    # SameFileError when the CLI copies config into the output dir).
    out_dir = (OUTPUT_ROOT / job_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    config_dir = Path(tempfile.mkdtemp())
    config_path = config_dir / "config.yaml"
    config_path.write_text(config_yaml)

    thread = threading.Thread(
        target=_run_backtest,
        args=(job_id, str(config_path), str(out_dir)),
        daemon=True,
    )
    thread.start()

    return jsonify({"jobId": job_id})


def _generate_report(output_dir: str, config_path: str) -> None:
    """Generate report.html from saved parquet files."""
    try:
        import pandas as pd
        import yaml
        from gnomepy_research.reporting.backtest.report import BacktestReport

        out = Path(output_dir)
        with open(config_path) as f:
            config = yaml.safe_load(f)

        # Load parquet files saved by BacktestResults.save().
        market_path = out / "market_records.parquet"
        exec_path = out / "execution_records.parquet"
        intent_path = out / "intent_records.parquet"

        market_df = pd.read_parquet(market_path) if market_path.exists() else pd.DataFrame()
        exec_df = pd.read_parquet(exec_path) if exec_path.exists() else pd.DataFrame()
        intent_df = pd.read_parquet(intent_path) if intent_path.exists() else pd.DataFrame()

        report = BacktestReport.from_dataframes(
            market_df=market_df,
            exec_df=exec_df,
            intent_df=intent_df,
            config=config,
        )
        report.save_html(out / "report.html", max_points=5000)
        print(f"  report.html written to {output_dir}")
    except Exception as e:
        import traceback
        print(f"  warning: failed to generate report: {e}")
        traceback.print_exc()


def _run_backtest(job_id: str, config_path: str, output_dir: str) -> None:
    """Run gnomepy backtest as a subprocess."""
    cmd = [
        "gnomepy", "backtest",
        "--config", config_path,
        "--output", output_dir,
        "--job-id", job_id,
    ]
    print(f"[{job_id[:8]}] running: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=1800,  # 30 min
        )
        if result.returncode == 0:
            # Generate HTML report from the results.
            _generate_report(output_dir, config_path)
            jobs[job_id]["status"] = "SUCCEEDED"
            jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
            print(f"[{job_id[:8]}] succeeded")
        else:
            jobs[job_id]["status"] = "FAILED"
            jobs[job_id]["error"] = result.stderr[-500:] if result.stderr else "Unknown error"
            jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
            print(f"[{job_id[:8]}] failed: {result.stderr[-200:]}")
    except subprocess.TimeoutExpired:
        jobs[job_id]["status"] = "FAILED"
        jobs[job_id]["error"] = "Backtest timed out (30 min)"
        jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        jobs[job_id]["status"] = "FAILED"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()


@app.route("/api/backtests/<job_id>", methods=["GET", "DELETE", "OPTIONS"])
def backtest_detail(job_id: str):
    if request.method == "OPTIONS":
        return "", 204

    if request.method == "DELETE":
        if job_id not in jobs:
            return jsonify({"error": "not found"}), 404
        del jobs[job_id]
        # Remove output directory.
        import shutil
        out_dir = OUTPUT_ROOT / job_id
        if out_dir.exists():
            shutil.rmtree(out_dir)
        return jsonify({"deleted": job_id})

    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "not found"}), 404

    result = dict(job)
    if job["status"] == "SUCCEEDED":
        report_path = OUTPUT_ROOT / job_id / "report.html"
        if report_path.exists():
            result["reportUrl"] = f"http://localhost:5050/api/backtests/{job_id}/report"

    # Include config YAML if available.
    config_path = OUTPUT_ROOT / job_id / "config.yaml"
    if config_path.exists():
        result["config"] = config_path.read_text()

    return jsonify(result)


@app.route("/api/backtests/<job_id>/regenerate", methods=["POST", "OPTIONS"])
def backtest_regenerate(job_id: str):
    if request.method == "OPTIONS":
        return "", 204

    job = jobs.get(job_id)
    if not job or job["status"] != "SUCCEEDED":
        return jsonify({"error": "Job not found or not succeeded"}), 404

    out_dir = (OUTPUT_ROOT / job_id).resolve()
    config_path = out_dir / "config.yaml"
    if not config_path.exists():
        # Check temp dirs for config
        return jsonify({"error": "config.yaml not found in results"}), 404

    _generate_report(str(out_dir), str(config_path))

    report_path = out_dir / "report.html"
    if report_path.exists():
        return jsonify({"status": "regenerated"})
    return jsonify({"error": "Report generation failed"}), 500


@app.route("/api/backtests/<job_id>/report", methods=["GET"])
def backtest_report(job_id: str):
    report_path = OUTPUT_ROOT / job_id / "report.html"
    if not report_path.exists():
        abort(404)
    return send_file(report_path, mimetype="text/html")


# ---------------------------------------------------------------------------
# Proxy latency-probe to real API (so other pages still work)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Playground (AI Agent)
# ---------------------------------------------------------------------------
@app.route("/api/playground/apply", methods=["POST", "OPTIONS"])
def playground_apply():
    if request.method == "OPTIONS":
        return "", 204

    from playground import tool_apply_code_change

    body = request.get_json(force=True)
    try:
        result = tool_apply_code_change(
            file_path=body["file_path"],
            original=body["original"],
            replacement=body["replacement"],
            session_id=body.get("session_id", "default"),
        )
        status = 200 if "error" not in result else 400
        return jsonify(result), status
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/playground/chat", methods=["POST", "OPTIONS"])
def playground_chat():
    if request.method == "OPTIONS":
        return "", 204

    from playground import handle_chat

    body = request.get_json(force=True)
    conversation = body.get("conversation", [])
    config = body.get("config")
    model = body.get("model")
    system_prompt = body.get("system_prompt")

    try:
        result = handle_chat(conversation, config=config, model=model, system_prompt=system_prompt)
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


def main():
    print(f"Backtest output dir: {OUTPUT_ROOT.resolve()}")
    print(f"Presets table: {PRESETS_TABLE}")
    print()
    print("Set in your .env:")
    print("  VITE_CONTROLLER_API_URL=http://localhost:5050/api")
    print("  ANTHROPIC_API_KEY=sk-ant-...")
    print()
    app.run(host="0.0.0.0", port=5050, debug=True)


if __name__ == "__main__":
    main()
