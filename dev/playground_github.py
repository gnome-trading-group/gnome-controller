"""GitHub API adapter for Gnomie code changes (prod/Lambda).

Creates branches and commits via the GitHub API — no local git needed.
"""
from __future__ import annotations

import base64
import os
from typing import Any

import requests

GITHUB_REPO = os.environ.get("GITHUB_REPO", "gnome-trading-group/gnomepy-research")
GITHUB_API = "https://api.github.com"

_session_branches: dict[str, str] = {}


def _gh_headers() -> dict[str, str]:
    token = os.environ.get("GH_TOKEN", "")
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }


def _get_default_branch_sha() -> str:
    """Get the SHA of the default branch HEAD."""
    resp = requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/git/ref/heads/main",
        headers=_gh_headers(),
    )
    resp.raise_for_status()
    return resp.json()["object"]["sha"]


def _create_branch(branch_name: str, from_sha: str) -> None:
    """Create a branch on GitHub."""
    resp = requests.post(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/git/refs",
        headers=_gh_headers(),
        json={"ref": f"refs/heads/{branch_name}", "sha": from_sha},
    )
    if resp.status_code == 422:
        # Branch already exists — fine.
        return
    resp.raise_for_status()


def _get_file_sha(branch: str, file_path: str) -> str | None:
    """Get the SHA of a file on a branch (needed for updates)."""
    resp = requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        params={"ref": branch},
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["sha"]


def _commit_file(branch: str, file_path: str, content: str, message: str) -> str:
    """Create or update a file on a branch. Returns the new commit SHA."""
    payload: dict[str, Any] = {
        "message": message,
        "content": base64.b64encode(content.encode()).decode(),
        "branch": branch,
    }
    # If file exists, include its SHA for an update.
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


def apply_via_github(
    file_path: str,
    new_content: str,
    session_id: str = "default",
) -> dict:
    """Create/update a file on a session branch via the GitHub API."""
    branch_name = _session_branches.get(session_id)

    try:
        if branch_name is None:
            branch_name = f"gnomie/{session_id}"
            _session_branches[session_id] = branch_name
            base_sha = _get_default_branch_sha()
            _create_branch(branch_name, base_sha)
            print(f"[gnomie] created branch {branch_name} on GitHub")

        commit_sha = _commit_file(
            branch_name, file_path, new_content,
            f"gnomie: update {file_path}",
        )
        print(f"[gnomie] committed {commit_sha[:8]} to {branch_name}")

        return {
            "status": "applied",
            "branch": branch_name,
            "commit": commit_sha,
            "file_path": file_path,
        }
    except Exception as e:
        return {"error": str(e)}


def read_file_from_github(file_path: str, session_id: str) -> str | None:
    """Read a file from the session branch on GitHub."""
    branch = _session_branches.get(session_id)
    if not branch:
        return None
    resp = requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{file_path}",
        headers=_gh_headers(),
        params={"ref": branch},
    )
    if resp.status_code != 200:
        return None
    return base64.b64decode(resp.json()["content"]).decode()
