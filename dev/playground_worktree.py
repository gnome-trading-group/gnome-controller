"""Local git worktree adapter for Gnomie code changes.

Creates an isolated worktree per session — your working directory is never touched.
"""
from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path

RESEARCH_ROOT = Path(__file__).resolve().parent.parent.parent / "gnomepy-research"
WORKTREE_ROOT = RESEARCH_ROOT.parent / "gnomepy-research-worktrees"

_session_worktrees: dict[str, Path] = {}


def _get_or_create_worktree(session_id: str) -> tuple[Path, str]:
    """Get or create an isolated git worktree for this session."""
    branch_name = f"gnomie/{session_id}"
    git_env = {**os.environ}

    if session_id in _session_worktrees:
        return _session_worktrees[session_id], branch_name

    wt_path = WORKTREE_ROOT / session_id
    WORKTREE_ROOT.mkdir(parents=True, exist_ok=True)

    if wt_path.exists():
        _session_worktrees[session_id] = wt_path
        return wt_path, branch_name

    # Prune stale worktree references.
    subprocess.run(
        ["git", "worktree", "prune"],
        cwd=str(RESEARCH_ROOT), capture_output=True, text=True, env=git_env,
    )

    # Delete the branch if it exists (may be left over from a previous session).
    subprocess.run(
        ["git", "branch", "-D", branch_name],
        cwd=str(RESEARCH_ROOT), capture_output=True, text=True, env=git_env,
    )

    # Create worktree with a new branch from current HEAD.
    result = subprocess.run(
        ["git", "worktree", "add", "-b", branch_name, str(wt_path)],
        cwd=str(RESEARCH_ROOT), capture_output=True, text=True, env=git_env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to create worktree: {result.stderr}")

    print(f"[gnomie] created worktree at {wt_path} on branch {branch_name}")
    _session_worktrees[session_id] = wt_path
    return wt_path, branch_name


def apply_via_worktree(
    file_path: str,
    new_content: str,
    session_id: str = "default",
) -> dict:
    """Write a file change into the session worktree, commit, and push."""
    try:
        wt_path, branch_name = _get_or_create_worktree(session_id)
    except RuntimeError as e:
        return {"error": str(e)}

    git_env = {**os.environ}
    full_path = wt_path / file_path

    if not full_path.exists():
        return {"error": f"File not found in worktree: {file_path}"}

    # Write the change.
    full_path.write_text(new_content)

    # Commit.
    try:
        subprocess.run(
            ["git", "add", file_path],
            cwd=str(wt_path), capture_output=True, text=True, check=True, env=git_env,
        )
        subprocess.run(
            ["git", "commit", "-m", f"gnomie: update {file_path}"],
            cwd=str(wt_path), capture_output=True, text=True, check=True, env=git_env,
        )
    except subprocess.CalledProcessError as e:
        return {"error": f"Failed to commit: {e.stderr}"}

    # Get commit SHA.
    commit_result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(wt_path), capture_output=True, text=True, env=git_env,
    )
    commit_sha = commit_result.stdout.strip() if commit_result.returncode == 0 else branch_name

    # Push in background — don't block the response.
    def _push():
        try:
            result = subprocess.run(
                ["git", "push", "-u", "origin", branch_name],
                cwd=str(wt_path), capture_output=True, text=True,
                env=git_env, timeout=30,
            )
            if result.returncode == 0:
                print(f"[gnomie] pushed {branch_name}")
            else:
                print(f"[gnomie] push failed: {result.stderr}")
        except Exception as e:
            print(f"[gnomie] push error: {e}")

    threading.Thread(target=_push, daemon=True).start()

    print(f"[gnomie] committed {commit_sha[:8]} to {branch_name}")

    return {
        "status": "applied",
        "branch": branch_name,
        "commit": commit_sha,
        "file_path": file_path,
        "worktree": str(wt_path),
    }


def read_file_from_worktree(file_path: str, session_id: str) -> str | None:
    """Read a file from the session worktree (returns None if no worktree)."""
    wt_path = _session_worktrees.get(session_id)
    if wt_path is None:
        return None
    full = wt_path / file_path
    return full.read_text() if full.exists() else None
