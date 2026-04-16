"""Local dev server for backtest + agent endpoints.

Runs backtests as local subprocesses (no Docker, no Batch).
Presets stored in DynamoDB. Jobs tracked in memory.

Setup:
    cd gnome-controller/dev
    poetry install
    poetry run python server.py

Frontend: set VITE_CONTROLLER_API_URL=http://localhost:5050/api
"""
from __future__ import annotations

import json
import logging
import logging.config
import sys
import os
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Add parent dir to path so we can import the agent package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env file if present.
_env_path = Path(__file__).resolve().parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split("#")[0].strip()  # strip inline comments
        if value and key.strip() not in os.environ:
            os.environ[key.strip()] = value

import boto3
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
# Unified config for the dev server + uvicorn so everything shares one format.
# Colored when stderr/stdout is a TTY; plain otherwise (pipes, redirected files,
# CI). Disable explicitly with NO_COLOR=1 or force with FORCE_COLOR=1.
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()


def _use_color(stream) -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("FORCE_COLOR"):
        return True
    return hasattr(stream, "isatty") and stream.isatty()


class _ColorFormatter(logging.Formatter):
    """Formatter that paints level + logger name with ANSI colors."""

    # SGR codes. Reset is 0; we scope color per field so nothing bleeds.
    _RESET = "\033[0m"
    _DIM = "\033[2m"
    _BOLD = "\033[1m"
    _GRAY = "\033[90m"
    _CYAN = "\033[36m"
    _GREEN = "\033[32m"
    _YELLOW = "\033[33m"
    _RED = "\033[31m"
    _MAGENTA = "\033[35m"

    _LEVEL_COLORS = {
        "DEBUG":    _GRAY,
        "INFO":     _GREEN,
        "WARNING":  _YELLOW,
        "ERROR":    _RED,
        "CRITICAL": _BOLD + _RED,
    }

    def __init__(self, *, use_color: bool, **kwargs):
        super().__init__(**kwargs)
        self._color = use_color

    def format(self, record: logging.LogRecord) -> str:
        # Save originals so we don't mutate the record for other handlers.
        orig_level = record.levelname
        orig_name = record.name
        if self._color:
            level_color = self._LEVEL_COLORS.get(record.levelname, "")
            record.levelname = f"{level_color}{record.levelname:<5}{self._RESET}"
            # Dim uvicorn.access, accent dev-server.
            name_color = self._MAGENTA if record.name == "dev-server" else (
                self._GRAY if record.name.startswith("uvicorn.access") else self._CYAN
            )
            record.name = f"{name_color}{orig_name}{self._RESET}"
            record.asctime = f"{self._GRAY}{self.formatTime(record, self.datefmt)}{self._RESET}"
        try:
            return super().format(record)
        finally:
            record.levelname = orig_level
            record.name = orig_name


LOG_CONFIG: dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "color_err": {
            "()": _ColorFormatter,
            "use_color": _use_color(sys.stderr),
            "format": "%(asctime)s  %(levelname)s  %(name)s  %(message)s",
            "datefmt": "%H:%M:%S",
        },
        "color_out": {
            "()": _ColorFormatter,
            "use_color": _use_color(sys.stdout),
            "format": "%(asctime)s  %(levelname)s  %(name)s  %(message)s",
            "datefmt": "%H:%M:%S",
        },
    },
    "handlers": {
        "default": {"class": "logging.StreamHandler", "stream": "ext://sys.stderr", "formatter": "color_err"},
        "access":  {"class": "logging.StreamHandler", "stream": "ext://sys.stdout", "formatter": "color_out"},
    },
    "loggers": {
        "":                 {"level": LOG_LEVEL, "handlers": ["default"]},
        "dev-server":       {"level": LOG_LEVEL, "handlers": ["default"], "propagate": False},
        "uvicorn":          {"level": LOG_LEVEL, "handlers": ["default"], "propagate": False},
        "uvicorn.error":    {"level": LOG_LEVEL, "handlers": ["default"], "propagate": False},
        "uvicorn.access":   {"level": LOG_LEVEL, "handlers": ["access"],  "propagate": False},
        # Chatty libraries — keep them out of the main stream unless debugging.
        "botocore":         {"level": "WARNING"},
        "urllib3":          {"level": "WARNING"},
    },
}
logging.config.dictConfig(LOG_CONFIG)
log = logging.getLogger("dev-server")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PRESETS_TABLE = os.environ.get("PRESETS_TABLE", "gnome-backtest-presets-dev")
OUTPUT_ROOT = Path(os.environ.get("BACKTEST_OUTPUT_ROOT", "./backtest-runs"))
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

dynamodb = boto3.resource("dynamodb")
presets_table = dynamodb.Table(PRESETS_TABLE)

jobs: dict[str, dict] = {}


def _load_existing_runs() -> None:
    for run_dir in OUTPUT_ROOT.iterdir():
        if not run_dir.is_dir():
            continue
        job_id = run_dir.name
        if job_id in jobs:
            continue
        has_results = any(run_dir.glob("*.parquet"))
        status = "SUCCEEDED" if has_results else "FAILED"
        job: dict = {
            "jobId": job_id,
            "batchJobId": f"local-{job_id[:8]}",
            "status": status,
            "presetId": "", "presetName": "", "researchCommit": "",
            "submittedBy": "local", "submittedAt": "",
        }
        manifest_path = run_dir / "manifest.json"
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text())
                job["submittedAt"] = manifest.get("created_at", "")
                job["completedAt"] = manifest.get("created_at", "")
                job["researchCommit"] = manifest.get("gnomepy_research_commit") or ""
            except Exception:
                pass
        if not job["submittedAt"]:
            mtime = run_dir.stat().st_mtime
            job["submittedAt"] = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
            job["completedAt"] = job["submittedAt"]
        jobs[job_id] = job
    if jobs:
        log.info("loaded %d existing run(s) from %s", len(jobs), OUTPUT_ROOT)


_load_existing_runs()


def _uuid7() -> str:
    ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
    ra = secrets.randbits(12)
    rb = secrets.randbits(62)
    n = (ms << 80) | (0x7 << 76) | (ra << 64) | (0b10 << 62) | rb
    h = f"{n:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


# ---------------------------------------------------------------------------
# Presets (DynamoDB)
# ---------------------------------------------------------------------------

@app.get("/api/backtests/presets")
def list_presets():
    result = presets_table.scan()
    items = sorted(result.get("Items", []), key=lambda p: p.get("createdAt", ""))
    return {"presets": items}


@app.post("/api/backtests/presets", status_code=201)
def create_preset(body: dict = {}):
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
    return item


@app.put("/api/backtests/presets/{preset_id}")
def update_preset(preset_id: str, body: dict = {}):
    existing = presets_table.get_item(Key={"presetId": preset_id}).get("Item")
    if not existing:
        raise HTTPException(404, "not found")
    now = datetime.now(timezone.utc).isoformat()
    existing["name"] = body.get("name", existing["name"])
    existing["description"] = body.get("description", existing.get("description", ""))
    existing["config"] = body.get("config", existing["config"])
    existing["updatedAt"] = now
    presets_table.put_item(Item=existing)
    return existing


@app.delete("/api/backtests/presets/{preset_id}")
def delete_preset(preset_id: str):
    presets_table.delete_item(Key={"presetId": preset_id})
    return {"deleted": preset_id}


# ---------------------------------------------------------------------------
# Backtest jobs
# ---------------------------------------------------------------------------

@app.get("/api/backtests")
def list_backtests():
    job_list = sorted(jobs.values(), key=lambda j: j.get("submittedAt", ""), reverse=True)
    return {"jobs": job_list}


@app.post("/api/backtests")
def submit_backtest(body: dict = {}):
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
            raise HTTPException(404, f"Preset {preset_id} not found")
        config_yaml = preset["config"]
        preset_name = preset.get("name", "")
    elif not config_yaml:
        raise HTTPException(400, "Either presetId or config is required")

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

    out_dir = (OUTPUT_ROOT / job_id).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    config_dir = Path(tempfile.mkdtemp())
    config_path = config_dir / "config.yaml"
    config_path.write_text(config_yaml)

    thread = threading.Thread(
        target=_run_backtest,
        args=(job_id, str(config_path), str(out_dir), research_commit),
        daemon=True,
    )
    thread.start()
    return {"jobId": job_id}


def _generate_report(output_dir: str, config_path: str) -> None:
    try:
        import pandas as pd
        import yaml
        from gnomepy_research.reporting.backtest.report import BacktestReport

        out = Path(output_dir)
        with open(config_path) as f:
            config = yaml.safe_load(f)

        # File names must match what gnomepy's BacktestResults.save() writes:
        # market.parquet / orders.parquet / fills.parquet / intents.parquet.
        market_df = pd.read_parquet(out / "market.parquet") if (out / "market.parquet").exists() else pd.DataFrame()
        exec_df = pd.read_parquet(out / "fills.parquet") if (out / "fills.parquet").exists() else pd.DataFrame()
        intent_df = pd.read_parquet(out / "intents.parquet") if (out / "intents.parquet").exists() else pd.DataFrame()

        report = BacktestReport.from_dataframes(market_df=market_df, exec_df=exec_df, intent_df=intent_df, config=config)
        report.save_html(out / "report.html", max_points=5000)
        log.info("report.html written: market=%d fills=%d intents=%d",
                 len(market_df), len(exec_df), len(intent_df))
    except Exception as e:
        log.warning("report generation failed: %s", e, exc_info=log.isEnabledFor(logging.DEBUG))


def _run_backtest(job_id: str, config_path: str, output_dir: str, research_commit: str | None = None) -> None:
    tag = job_id[:8]
    research_root = Path(__file__).resolve().parent.parent.parent / "gnomepy-research"
    worktree_root = research_root.parent / "gnomepy-research-worktrees"
    extra_env = {}

    if research_commit and research_commit != "main":
        session_id = research_commit.replace("gnomie/", "")
        wt_path = worktree_root / session_id
        if wt_path.exists():
            current_pp = os.environ.get("PYTHONPATH", "")
            extra_env["PYTHONPATH"] = f"{wt_path}:{current_pp}" if current_pp else str(wt_path)
            log.info("[%s] using worktree: %s", tag, wt_path)

    cmd = ["gnomepy", "backtest", "--config", config_path, "--output", output_dir, "--job-id", job_id]
    log.info("[%s] starting backtest", tag)
    log.debug("[%s] cmd: %s", tag, " ".join(cmd))

    run_env = {**os.environ, **extra_env} if extra_env else None
    t_start = time.time()
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, env=run_env)
        # Always dump full stdout+stderr so we can debug without guessing.
        log_path = Path(output_dir) / "subprocess.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(
            f"$ {' '.join(cmd)}\n\n=== STDOUT ===\n{result.stdout}\n\n=== STDERR ===\n{result.stderr}\n"
        )
        elapsed = time.time() - t_start
        if result.returncode == 0:
            _generate_report(output_dir, config_path)
            jobs[job_id]["status"] = "SUCCEEDED"
            jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
            log.info("[%s] succeeded in %.1fs", tag, elapsed)
        else:
            tail = (result.stderr or "").strip().splitlines()[-1:] or ["(no stderr)"]
            jobs[job_id]["status"] = "FAILED"
            jobs[job_id]["error"] = result.stderr[-500:] if result.stderr else "Unknown error"
            jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
            log.error("[%s] failed (%.1fs): %s", tag, elapsed, tail[0])
            log.error("[%s] full log: %s", tag, log_path)
    except subprocess.TimeoutExpired:
        jobs[job_id]["status"] = "FAILED"
        jobs[job_id]["error"] = "Backtest timed out (30 min)"
        jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
        log.error("[%s] timed out after 30 min", tag)
    except Exception as e:
        jobs[job_id]["status"] = "FAILED"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["completedAt"] = datetime.now(timezone.utc).isoformat()
        log.exception("[%s] crashed: %s", tag, e)


@app.get("/api/backtests/{job_id}")
def get_backtest(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not found")
    result = dict(job)
    if job["status"] == "SUCCEEDED":
        report_path = OUTPUT_ROOT / job_id / "report.html"
        if report_path.exists():
            result["reportUrl"] = f"http://localhost:5050/api/backtests/{job_id}/report"
    config_path = OUTPUT_ROOT / job_id / "config.yaml"
    if config_path.exists():
        result["config"] = config_path.read_text()
    return result


@app.delete("/api/backtests/{job_id}")
def delete_backtest(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "not found")
    del jobs[job_id]
    out_dir = OUTPUT_ROOT / job_id
    if out_dir.exists():
        shutil.rmtree(out_dir)
    return {"deleted": job_id}


@app.post("/api/backtests/{job_id}/regenerate")
def regenerate_report(job_id: str):
    job = jobs.get(job_id)
    if not job or job["status"] != "SUCCEEDED":
        raise HTTPException(404, "Job not found or not succeeded")
    out_dir = (OUTPUT_ROOT / job_id).resolve()
    config_path = out_dir / "config.yaml"
    if not config_path.exists():
        raise HTTPException(404, "config.yaml not found")
    _generate_report(str(out_dir), str(config_path))
    if (out_dir / "report.html").exists():
        return {"status": "regenerated"}
    raise HTTPException(500, "Report generation failed")


@app.get("/api/backtests/{job_id}/report")
def get_report(job_id: str):
    report_path = OUTPUT_ROOT / job_id / "report.html"
    if not report_path.exists():
        raise HTTPException(404)
    return FileResponse(report_path, media_type="text/html")


# ---------------------------------------------------------------------------
# Agent (Gnomie) — streaming SSE
# ---------------------------------------------------------------------------

class AgentChatRequest(BaseModel):
    conversation: list[dict] = []
    config: str | None = None
    model: str | None = None
    system_prompt: str | None = None
    session_id: str = "default"


class AgentApplyRequest(BaseModel):
    file_path: str
    original: str
    replacement: str
    session_id: str = "default"


def _api_keys() -> dict[str, str]:
    return {
        "anthropic": os.environ.get("ANTHROPIC_API_KEY", ""),
        "openai": os.environ.get("OPENAI_API_KEY", ""),
    }


@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatRequest):
    import asyncio
    import queue
    from agent.core import handle_chat_stream
    from agent.adapters.dev import DevAdapter

    adapter = DevAdapter()
    q: queue.Queue = queue.Queue()
    _DONE = object()

    def _produce():
        try:
            for event in handle_chat_stream(
                adapter, req.conversation,
                config=req.config, model=req.model,
                system_prompt=req.system_prompt,
                api_keys=_api_keys(),
                session_id=req.session_id,
            ):
                q.put(event)
        except Exception as e:
            log.exception("agent chat failed: %s", e)
            q.put({"error": str(e)})
        finally:
            q.put(_DONE)

    # Run the blocking generator in a background thread.
    thread = threading.Thread(target=_produce, daemon=True)
    thread.start()

    async def event_generator():
        loop = asyncio.get_event_loop()
        while True:
            event = await loop.run_in_executor(None, q.get)
            if event is _DONE:
                yield 'data: {"done": true}\n\n'
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/agent/apply")
def agent_apply(req: AgentApplyRequest):
    from agent.adapters.dev import DevAdapter
    adapter = DevAdapter()
    try:
        result = adapter.apply_code_change(
            file_path=req.file_path,
            original=req.original,
            replacement=req.replacement,
            session_id=req.session_id,
        )
        return result
    except Exception as e:
        log.exception("agent apply failed: %s", e)
        raise HTTPException(500, str(e))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _env_summary() -> dict[str, str]:
    """Return a redacted snapshot of the resolved backend env so the startup
    banner shows what's actually configured rather than what the user set."""
    def _mask(val: str, keep: int = 4) -> str:
        return f"set ({val[:keep]}…, len={len(val)})" if val else "MISSING"

    return {
        "AWS_PROFILE":            os.environ.get("AWS_PROFILE", "(default)"),
        "STAGE":                  os.environ.get("STAGE", "(unset → prod)"),
        "GNOME_REGISTRY_API_KEY": _mask(os.environ.get("GNOME_REGISTRY_API_KEY", "")),
        "GNOME_REGISTRY_API_URL": os.environ.get("GNOME_REGISTRY_API_URL", "(unset)"),
        "GH_TOKEN":               _mask(os.environ.get("GH_TOKEN", "")),
        "ANTHROPIC_API_KEY":      _mask(os.environ.get("ANTHROPIC_API_KEY", "")),
        "OPENAI_API_KEY":         _mask(os.environ.get("OPENAI_API_KEY", "")),
        "PRESETS_TABLE":          PRESETS_TABLE,
        "OUTPUT_ROOT":            str(OUTPUT_ROOT.resolve()),
    }


def main():
    log.info("dev server starting")
    for k, v in _env_summary().items():
        log.info("  %-24s %s", k, v)

    # Warn loudly if required-for-backtest vars are missing.
    if not os.environ.get("GNOME_REGISTRY_API_KEY"):
        log.warning("GNOME_REGISTRY_API_KEY is unset — backtests will 403 at SecurityMaster")
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY")):
        log.warning("no LLM key set — /api/agent/chat will fail")

    uvicorn.run(app, host="0.0.0.0", port=5050, log_config=LOG_CONFIG)


if __name__ == "__main__":
    main()
