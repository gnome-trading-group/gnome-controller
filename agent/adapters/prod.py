"""Prod adapter for Gnomie agent — uses GitHub API for code, controller API for backtests."""
from __future__ import annotations

import base64
import os
import time
from typing import Any

import requests

from agent.core import fuzzy_replace

GITHUB_REPO = os.environ.get("GITHUB_REPO", "gnome-trading-group/gnomepy-research")
GITHUB_API = "https://api.github.com"
CONTROLLER_API_URL = os.environ.get("CONTROLLER_API_URL", "")


# Stateless — branch name derived from session_id: gnomie/{session_id}


def _gh_token() -> str:
    """Get GitHub token — from env or Secrets Manager."""
    token = os.environ.get("GH_TOKEN")
    if token:
        return token.strip()
    # Fall back to Secrets Manager.
    import boto3
    arn = os.environ.get("GH_TOKEN_SECRET_ARN", "")
    if arn:
        client = boto3.client("secretsmanager")
        return client.get_secret_value(SecretId=arn)["SecretString"]
    raise RuntimeError("No GH_TOKEN or GH_TOKEN_SECRET_ARN configured")


def _gh_headers() -> dict[str, str]:
    return {
        "Authorization": f"token {_gh_token()}",
        "Accept": "application/vnd.github.v3+json",
    }


def _read_file_github(branch: str, file_path: str) -> str | None:
    url = f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}"
    resp = requests.get(
        url,
        headers=_gh_headers(),
        params={"ref": branch},
    )
    if resp.status_code != 200:
        token = _gh_token()
        print(f"[gnomie] GitHub API {resp.status_code}: GET {url}?ref={branch}")
        print(f"[gnomie] Token: {token[:10]}... len={len(token)} repr={repr(token[:15])}")
        print(f"[gnomie] Response: {resp.text[:200]}")
        return None
    return base64.b64decode(resp.json()["content"]).decode()


def _get_file_sha(branch: str, file_path: str) -> str | None:
    resp = requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        params={"ref": branch},
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["sha"]


def _get_default_branch_sha() -> str:
    resp = requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/git/ref/heads/main",
        headers=_gh_headers(),
    )
    resp.raise_for_status()
    return resp.json()["object"]["sha"]


def _create_branch(branch_name: str, from_sha: str) -> None:
    resp = requests.post(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/git/refs",
        headers=_gh_headers(),
        json={"ref": f"refs/heads/{branch_name}", "sha": from_sha},
    )
    if resp.status_code == 422:
        return  # Already exists.
    resp.raise_for_status()


def _commit_file(branch: str, file_path: str, content: str, message: str) -> str:
    payload: dict[str, Any] = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": branch,
    }
    file_sha = _get_file_sha(branch, file_path)
    if file_sha:
        payload["sha"] = file_sha
    resp = requests.put(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()["commit"]["sha"]


class ProdAdapter:
    """Implements AgentAdapter protocol using GitHub API + controller API."""

    def list_presets(self) -> dict:
        try:
            resp = requests.get(f"{CONTROLLER_API_URL}/backtests/presets", timeout=10)
            data = resp.json()
            presets = data.get("presets", [])
            names = [p.get("name", "") for p in presets if p.get("name")]
            return {"presets": names, "hint": "Use get_preset to read a specific preset's config."}
        except Exception as e:
            return {"presets": [], "error": str(e)}

    def get_preset(self, name: str, **kw) -> dict:
        try:
            resp = requests.get(f"{CONTROLLER_API_URL}/backtests/presets", timeout=10)
            data = resp.json()
            for p in data.get("presets", []):
                if p.get("name") == name:
                    return {"name": name, "config": p.get("config", "")}
            return {"error": f"Preset '{name}' not found"}
        except Exception as e:
            return {"error": str(e)}

    def list_strategies(self, **kw) -> dict:
        resp = requests.get(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/gnomepy_research/strategies",
            headers=_gh_headers(),
        )
        if resp.status_code != 200:
            return {"strategies": []}
        files = resp.json()
        strategies = []
        for f in files:
            if f["name"].endswith(".py") and not f["name"].startswith("_"):
                strategies.append({
                    "name": f["name"].replace(".py", ""),
                    "file_path": f"gnomepy_research/strategies/{f['name']}",
                })
        return {
            "strategies": strategies,
            "hint": "Use read_strategy_code with the file_path to read the source code of any strategy.",
        }

    def _branch_for_session(self, session_id: str) -> str:
        return f"gnomie/{session_id}"

    def _session_branch_exists(self, session_id: str) -> bool:
        branch = self._branch_for_session(session_id)
        resp = requests.get(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/git/ref/heads/{branch}",
            headers=_gh_headers(),
        )
        return resp.status_code == 200

    def read_file(self, file_path: str, session_id: str = "default") -> dict:
        branch = self._branch_for_session(session_id)
        has_session = self._session_branch_exists(session_id)
        print(f"[gnomie] read_file: {file_path} session={session_id} has_session_branch={has_session}")
        content = _read_file_github(branch, file_path) if has_session else None
        if content is None:
            print(f"[gnomie] read_file: falling back to main")
            content = _read_file_github("main", file_path)
        if content is None:
            print(f"[gnomie] read_file: NOT FOUND on main either. GH_TOKEN set: {bool(os.environ.get('GH_TOKEN'))}")
            return {"error": f"File not found: {file_path}"}
        print(f"[gnomie] read_file: OK {len(content)} chars")
        return {"file_path": file_path, "content": content}

    def suggest_code_change(self, file_path: str, original: str, replacement: str, explanation: str, session_id: str = "default", **kw) -> dict:
        # Read from session branch if it exists (may have prior changes).
        branch = self._branch_for_session(session_id)
        content = _read_file_github(branch, file_path) if self._session_branch_exists(session_id) else None
        if content is None:
            content = _read_file_github("main", file_path)
        if content is None:
            return {"error": f"File not found: {file_path}"}
        if original not in content:
            return {"error": "Original snippet not found in file"}
        return {
            "file_path": file_path,
            "original": original,
            "replacement": replacement,
            "explanation": explanation,
            "status": "pending_approval",
        }

    def apply_code_change(self, file_path: str, original: str, replacement: str, session_id: str = "default") -> dict:
        branch_name = self._branch_for_session(session_id)
        try:
            if not self._session_branch_exists(session_id):
                base_sha = _get_default_branch_sha()
                _create_branch(branch_name, base_sha)

            content = _read_file_github(branch_name, file_path)
            if content is None:
                return {"error": f"File not found: {file_path}"}

            new_content = fuzzy_replace(content, original, replacement)
            if new_content is None:
                return {"error": "Original snippet not found in file"}

            commit_sha = _commit_file(branch_name, file_path, new_content, f"gnomie: update {file_path}")
            return {"status": "applied", "branch": branch_name, "commit": commit_sha, "file_path": file_path}
        except Exception as e:
            return {"error": str(e)}

    def submit_backtest(self, config: str, name: str = "Gnomie backtest", research_commit: str | None = None) -> dict:
        import yaml as _yaml
        try:
            parsed = _yaml.safe_load(config)
        except Exception as e:
            return {"error": f"Invalid YAML: {e}"}

        if "start_date" not in parsed:
            return {"error": "Config must include start_date"}
        if "end_date" not in parsed:
            return {"error": "Config must include end_date"}

        payload: dict = {"config": config, "name": name}
        if research_commit:
            payload["researchCommit"] = research_commit

        try:
            resp = requests.post(f"{CONTROLLER_API_URL}/backtests", json=payload, timeout=10)
            submit_result = resp.json()
        except Exception as e:
            return {"error": f"Failed to submit: {e}"}

        job_id = submit_result.get("jobId")
        if not job_id:
            return submit_result

        # Poll until done.
        for _ in range(120):
            time.sleep(1)
            try:
                status_resp = requests.get(f"{CONTROLLER_API_URL}/backtests/{job_id}", timeout=5)
                job = status_resp.json()
                status = job.get("status", "")
                if status == "SUCCEEDED":
                    return {"jobId": job_id, "status": "SUCCEEDED", "summary": job.get("summary", {})}
                if status == "FAILED":
                    return {"jobId": job_id, "status": "FAILED", "error": job.get("error", "Unknown")}
            except Exception:
                continue

        return {"jobId": job_id, "status": "TIMEOUT", "error": "Backtest did not complete within 2 minutes"}

    def get_report_summary(self, job_id: str, **kw) -> dict:
        try:
            resp = requests.get(f"{CONTROLLER_API_URL}/backtests/{job_id}", timeout=30)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}
