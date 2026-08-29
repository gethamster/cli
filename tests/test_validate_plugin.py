from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_plugin.py"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def create_valid_package(root: Path) -> None:
    write_json(
        root / ".mcp.json",
        {
            "mcpServers": {
                "hamster": {"type": "http", "url": "https://tryhamster.com/mcp"}
            }
        },
    )

    components = {
        "skills/ask/SKILL.md": "Use ask_hamster and get_hamster_reply.\n",
        "skills/ship/SKILL.md": (
            "Use get_brief, get_plan, get_task, get_document, and update_task_status.\n"
        ),
        "agents/task-executor.md": "Execute Hamster tasks.\n",
        "agents/wave-reviewer.md": "Review a Hamster execution wave.\n",
    }
    for relative_path, content in components.items():
        path = root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


class ValidatePluginTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name) / "package"
        create_valid_package(self.root)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def run_validator(self, root: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root or self.root)],
            capture_output=True,
            text=True,
            check=False,
        )

    def assert_rejected(self, expected: str, root: Path | None = None) -> None:
        result = self.run_validator(root)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(expected, result.stderr)

    def test_valid_package_passes(self) -> None:
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("MCP server 1, skills ask/ship, agents 2", result.stdout)

    def test_mcp_drift_fails(self) -> None:
        write_json(
            self.root / ".mcp.json",
            {
                "mcpServers": {
                    "hamster": {
                        "type": "http",
                        "url": "https://tryhamster.com/mcp",
                        "headers": {"Authorization": "Bearer token"},
                    }
                }
            },
        )
        self.assert_rejected("credential-free hosted Hamster server")

    def test_unexpected_component_fails(self) -> None:
        cases = {
            "skills/plan/SKILL.md": "skills: expected",
            "agents/reviewer.md": "agents: expected",
            "commands/plan.md": "commands must be absent",
            "hooks/hooks.json": "hooks must be absent",
            "rules/team.mdc": "rules must be absent",
            ".cursor-plugin/marketplace.json": "must be absent",
        }
        for relative_path, expected in cases.items():
            with self.subTest(relative_path=relative_path):
                with tempfile.TemporaryDirectory() as temporary_directory:
                    root = Path(temporary_directory) / "package"
                    create_valid_package(root)
                    path = root / relative_path
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("{}\n" if path.suffix == ".json" else "unexpected\n")
                    self.assert_rejected(expected, root)

    def test_hosted_delivery_term_fails(self) -> None:
        path = self.root / "skills" / "ship" / "SKILL.md"
        for term in ("deliver_brief", "coding_agent"):
            with self.subTest(term=term):
                original = path.read_text()
                path.write_text(f"{original}Call {term}.\n")
                self.assert_rejected(term)
                path.write_text(original)


if __name__ == "__main__":
    unittest.main()
