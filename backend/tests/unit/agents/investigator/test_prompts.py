"""Tests for ``agents.investigator.prompts`` (#25 / M4.3, #105 / M5.7).

The Investigator's system prompt is pinned at agent-creation time on the
Managed Agents path; a regression here would silently ship a demo with
no diagnostics guidance. These tests assert the contract the issue
acceptance criteria depend on:

- Base ``INVESTIGATOR_SYSTEM`` carries the ``{diagnostics_section}`` and
  ``{past_failures}`` placeholders so both paths can format it.
- ``SANDBOX_DIAGNOSTICS_SECTION`` mentions the ``bash`` tool, ships with
  at least two worked examples, and exposes a ``{sandbox_base_url}``
  placeholder that bootstrap must resolve before agent creation.
- The Messages API consumer is able to format the base with an empty
  diagnostics section (no ``KeyError`` on unfilled placeholders).
- The Managed Agents consumer is able to format the full combined
  prompt without leftover placeholders.
"""

from __future__ import annotations

from agents.investigator.prompts import INVESTIGATOR_SYSTEM, SANDBOX_DIAGNOSTICS_SECTION


# ---------------------------------------------------------------------------
# Placeholder contract
# ---------------------------------------------------------------------------


def test_base_prompt_has_required_placeholders() -> None:
    assert "{diagnostics_section}" in INVESTIGATOR_SYSTEM
    assert "{past_failures}" in INVESTIGATOR_SYSTEM


def test_sandbox_section_has_sandbox_base_url_placeholder() -> None:
    # The bootstrap must inject the tunneled URL at agent-creation time.
    # Without this the worked examples ship with the literal string
    # "{sandbox_base_url}" which the container cannot curl.
    assert "{sandbox_base_url}" in SANDBOX_DIAGNOSTICS_SECTION


# ---------------------------------------------------------------------------
# Content contract — issue #105 acceptance criterion
# ---------------------------------------------------------------------------


def test_sandbox_section_mentions_bash_tool() -> None:
    """The guidance must tell the LLM to use ``bash``, not describe analysis in prose."""
    assert "bash" in SANDBOX_DIAGNOSTICS_SECTION.lower()


def test_sandbox_section_mentions_preinstalled_packages() -> None:
    """Worked examples import from these; the agent needs to know they are preinstalled."""
    for pkg in ("numpy", "pandas", "scipy"):
        assert pkg in SANDBOX_DIAGNOSTICS_SECTION.lower(), f"missing {pkg!r} in sandbox guidance"


def test_sandbox_section_contains_at_least_two_worked_examples() -> None:
    """Issue #105 acceptance: 'at least two worked examples'.

    Each worked example is a ``python3 - <<PY`` heredoc. Counting the
    PY fences is a reliable proxy: one open + one close per example, so
    >= 4 occurrences means >= 2 examples.
    """
    fence_count = SANDBOX_DIAGNOSTICS_SECTION.count("PY")
    assert fence_count >= 4, (
        f"expected at least 2 Python heredoc examples (>=4 'PY' fences), " f"found {fence_count}"
    )


def test_sandbox_section_references_fft_and_trend_techniques() -> None:
    """The two examples in the prompt cover distinct techniques — FFT and
    linear regression. Shipping with only one technique would mean the
    agent sees one tool in the toolbox; the variety matters for the
    "agent picks diagnostic based on signal" story."""
    lower = SANDBOX_DIAGNOSTICS_SECTION.lower()
    assert "fft" in lower, "FFT example is missing"
    # polyfit / linear regression wording — either form is acceptable.
    assert any(
        term in lower for term in ("polyfit", "regression", "slope")
    ), "linear-trend / regression example is missing"


# ---------------------------------------------------------------------------
# Lever 1 + 2 contract — visible-output guarantees (#105 follow-up)
# ---------------------------------------------------------------------------


def test_sandbox_section_mandates_sandbox_colon_prefix() -> None:
    """Every bash-driven RCA must begin with ``Sandbox: key=value, ...``
    so the numerical evidence lands in the work-order text itself.
    Dropping this rule makes the capability indistinguishable from
    Messages API token arithmetic in the RCA surface."""
    assert (
        "Sandbox:" in SANDBOX_DIAGNOSTICS_SECTION
    ), "the Sandbox: prefix rule for submit_rca.root_cause is missing"


def test_sandbox_section_has_failure_mode_keyed_rules() -> None:
    """The prompt must differentiate by failure_mode so the agent knows
    WHEN to run which technique — not merely that bash is available."""
    lower = SANDBOX_DIAGNOSTICS_SECTION.lower()
    for keyword in ("drift", "coupling", "spike"):
        assert keyword in lower, f"failure-mode rules missing {keyword!r} class"
    # At least one MUST / mandatory verb — the rules are requirements.
    assert "must" in lower, "failure-mode rules do not use MUST / mandatory phrasing"


def test_sandbox_section_mandates_render_sandbox_execution_call() -> None:
    """The visible-proof card must be called after bash + before submit_rca.
    Without this line the artifact is orphaned."""
    assert (
        "render_sandbox_execution" in SANDBOX_DIAGNOSTICS_SECTION
    ), "render_sandbox_execution mandate is missing from the prompt"


def test_sandbox_section_references_required_regression_metrics() -> None:
    """Drift-class rule requires slope / r_squared / eta — all three must
    appear so the agent knows the expected Sandbox: line shape."""
    for metric in ("slope_per_hour", "r_squared", "eta_"):
        assert (
            metric in SANDBOX_DIAGNOSTICS_SECTION
        ), f"drift-class metric {metric!r} is missing from the prompt"


def test_sandbox_section_references_correlation_metrics() -> None:
    """Coupling-class rule requires rho / n so the agent's output is
    parseable in the Sandbox: prefix."""
    lower = SANDBOX_DIAGNOSTICS_SECTION.lower()
    assert "rho" in lower, "coupling-class rho metric is missing"
    assert any(
        token in lower for token in ("n_samples", "n=")
    ), "coupling-class sample-count metric is missing"


# ---------------------------------------------------------------------------
# Format-time contracts — both agent paths must be able to produce a
# fully-resolved prompt.
# ---------------------------------------------------------------------------


def test_messages_api_path_formats_with_empty_diagnostics_section() -> None:
    """Messages API has no ``bash`` tool, so it passes an empty section.

    The format call must succeed and the final string must not contain
    any unresolved ``{placeholder}`` markers.
    """
    prompt = INVESTIGATOR_SYSTEM.format(
        diagnostics_section="",
        past_failures="(no prior failures)",
    )
    assert "{diagnostics_section}" not in prompt
    assert "{past_failures}" not in prompt
    # Messages API prompt must NOT advertise bash — would confuse the LLM
    # since the tool is not in its schema.
    assert "bash" not in prompt.lower()


def test_managed_path_formats_full_prompt_with_resolved_url() -> None:
    """The Managed Agents path combines the base + diagnostics + URL."""
    diagnostics = SANDBOX_DIAGNOSTICS_SECTION.format(
        sandbox_base_url="https://aria-backend.example/sandbox/secret",
    )
    prompt = INVESTIGATOR_SYSTEM.format(
        diagnostics_section=diagnostics,
        past_failures="(past failures)",
    )
    assert "{sandbox_base_url}" not in prompt
    assert "{diagnostics_section}" not in prompt
    assert "https://aria-backend.example/sandbox/secret" in prompt
    assert "bash" in prompt.lower()
