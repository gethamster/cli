#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_MCP = {
    "mcpServers": {
        "hamster": {
            "type": "http",
            "url": "https://tryhamster.com/mcp",
        }
    }
}
EXPECTED_COMPONENTS = {
    "skills": {"ask/SKILL.md", "ship/SKILL.md"},
    "agents": {"task-executor.md", "wave-reviewer.md"},
}
FORBIDDEN_COMPONENTS = ("commands", "hooks", "rules")
HOSTED_DELIVERY_TERMS = ("deliver_brief", "coding_agent")


def fail(message: str) -> None:
    raise ValueError(message)


def validate_mcp(root: Path) -> None:
    path = root / ".mcp.json"
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        fail(f".mcp.json: invalid JSON: {error}")
    if value != EXPECTED_MCP:
        fail(".mcp.json must contain only the credential-free hosted Hamster server")


def discover_files(root: Path, pattern: str) -> set[str]:
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob(pattern)
        if path.is_file()
    }


def validate_components(root: Path) -> list[Path]:
    catalog = root / ".cursor-plugin" / "marketplace.json"
    if catalog.exists() or catalog.is_symlink():
        fail(".cursor-plugin/marketplace.json must be absent for a root plugin")

    discovered = {
        "skills": discover_files(root / "skills", "SKILL.md"),
        "agents": discover_files(root / "agents", "*.md"),
    }
    for component, expected in EXPECTED_COMPONENTS.items():
        actual = discovered[component]
        if actual != expected:
            fail(f"{component}: expected {sorted(expected)}, found {sorted(actual)}")

    for component in FORBIDDEN_COMPONENTS:
        path = root / component
        if path.exists() or path.is_symlink():
            fail(f"{component} must be absent")

    return [
        root / component / relative_path
        for component, relative_paths in EXPECTED_COMPONENTS.items()
        for relative_path in relative_paths
    ]


def validate_shipped_text(paths: list[Path]) -> None:
    for path in paths:
        text = path.read_text().lower()
        for term in HOSTED_DELIVERY_TERMS:
            if term in text:
                fail(f"{path}: hosted-delivery term {term!r} must be absent")


def validate(root: Path) -> None:
    root = root.resolve()
    if not root.is_dir():
        fail(f"package root does not exist: {root}")
    validate_mcp(root)
    component_files = validate_components(root)
    validate_shipped_text(component_files)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Hamster package invariants")
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_ROOT,
        help="plugin package root (defaults to the repository root)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        validate(args.root)
    except (OSError, ValueError) as error:
        print(f"plugin validation failed: {error}", file=sys.stderr)
        return 1
    print("plugin validation passed: MCP server 1, skills ask/ship, agents 2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
