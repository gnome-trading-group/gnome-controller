"""Expand sweep syntax in a backtest YAML config into individual configs."""
from __future__ import annotations

import copy
import itertools
from typing import Any


def _linspace(min_val: float, max_val: float, step: float) -> list[float]:
    values = []
    v = min_val
    while v <= max_val + step * 1e-9:
        values.append(round(v, 10))
        v += step
    return values


def _is_sweep_range(value: Any) -> bool:
    return isinstance(value, dict) and {"min", "max", "step"} <= value.keys()


def _collect_sweeps(args: dict) -> dict[str, list]:
    """Find all sweep parameters in strategy.args, return {key: [values]}."""
    sweeps: dict[str, list] = {}
    for key, value in args.items():
        if isinstance(value, list):
            sweeps[key] = value
        elif _is_sweep_range(value):
            sweeps[key] = _linspace(value["min"], value["max"], value["step"])
    return sweeps


def expand_sweep(config: dict) -> list[dict]:
    """Expand a config with sweep syntax into a list of individual configs.

    Sweep syntax in ``strategy.args``:
    - List value:  ``threshold_bps: [1.0, 2.0, 3.0]``
    - Range value: ``ewma_alpha: {min: 0.8, max: 0.99, step: 0.05}``

    Returns the cartesian product of all sweep dimensions. If no sweeps are
    present, returns ``[config]`` (a single-element list).
    """
    strategy_args = config.get("strategy", {}).get("args", {})
    sweeps = _collect_sweeps(strategy_args)

    if not sweeps:
        return [copy.deepcopy(config)]

    keys = list(sweeps.keys())
    value_lists = [sweeps[k] for k in keys]

    expanded = []
    for combo in itertools.product(*value_lists):
        c = copy.deepcopy(config)
        for key, val in zip(keys, combo):
            c["strategy"]["args"][key] = val
        expanded.append(c)

    return expanded


def sweep_params(config: dict) -> dict[str, list]:
    """Return the swept parameter names and their candidate values."""
    return _collect_sweeps(config.get("strategy", {}).get("args", {}))
