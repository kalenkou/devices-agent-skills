# Results

> **To be filled after the evaluation run.** No model results are reported yet. The tables below are empty on purpose; do not read them as scores.

## Repository check

Reproducible, no device and no model needed. Run from the repository root:

```bash
node skills/vega-client-side-ads/evals/check.mjs
```

It checks the frontmatter (name, description length, "Not for" boundary), that `SKILL.md` stays under 150 lines, that every local link and `#anchor` resolves, the size of the eval sets, the README row, and runs `references/scripts/audit.mjs` on three fixture apps: a broken one (must exit 1 with M1, M2, M4, S1, S3, S4), a good one (must be clean) and a non-Vega one (must be skipped).

| Date | Command output |
| --- | --- |
| _to be filled_ | _to be filled_ |

## Protocol for the model evaluation

1. **Trigger test.** Give a fresh agent only the `name` and `description` of every skill in this repository. For each prompt in [TRIGGER_PROMPTS.md](TRIGGER_PROMPTS.md), ask which skill it would load, if any. This simulates the choice from descriptions; it is not a run through a particular host's skill router.
2. **Task scenarios.** For each scenario in [TASK_SCENARIOS.md](TASK_SCENARIOS.md), run the prompt twice in a fresh context: once without the skill, once with `SKILL.md` and its `references/` available. No web access in either run. S1 also needs a checkout of `AmazonAppDev/react-native-multi-tv-app-sample`.
3. **Grading.** Score each assertion pass/fail against the written answer (and, for S1, the diff). If possible, have someone who did not write the skill grade, blind to which run had the skill.
4. **Record** the host, model, date, prompt set version (commit), grader, and every failed assertion with one line on why.

## Trigger prompts

| Host / model | Date | Should trigger: loaded | Should not trigger: not loaded |
| --- | --- | --- | --- |
| _to be filled_ | | _/12 | _/10 |

## Task scenarios

| Scenario | Without skill | With skill |
| --- | --- | --- |
| S1 Add a pre-roll to the multi-TV sample | not run | 7/7 (16.10.2026, see below) |
| S2 The remote does nothing during the ad | _/5 | _/5 |
| S3 The movie flashes between two ads | _/5 | _/5 |
| S4 Tracking pixels never arrive | _/5 | _/5 |
| S5 Black screen with an http ad | _/5 | _/5 |
| S6 The ad is cut off after Alexa | _/5 | _/5 |
| S7 Prove Home and Back on a real stick | _/5 | _/5 |
| **Assertions passed** | **_/36** | **_/36** |
| **Scenarios fully passed** | **_/7** | **_/7** |

## What the baseline got wrong

_To be filled: advice from the run without the skill that would fail on a Fire TV Stick._

## What this package can and cannot claim

- The device numbers in `references/` come from one Fire TV Stick 4K Select (Vega OS 2.0, Vega SDK 0.24) in October 2026. They are marked as measured, with the device.
- The audit script only sees files. A clean audit does not prove that ads, media controls or tracking work on a device.
- Alexa phrases, visual flashes between ads and loudness need a person; the skill tells the agent to hand these over instead of claiming them.

## Run log

### S1 with the skill, 16.10.2026

- **Setup:** a fresh coding agent got the S1 prompt, a clean copy of `AmazonAppDev/react-native-multi-tv-app-sample` at `d435082` and this skill without the `evals/` folder. No web access. No Fire TV device.
- **What it built:** its own implementation (no library): `@dailymotion/vast-client`, `@dailymotion/vmap` and `@xmldom/xmldom` in the Vega app, seven new `*.vega.ts(x)` files and changes to `PlayerScreen.vega.tsx`. The Vega debug build passed; a Node test with a fake player and a local VMAP/VAST/pixel server passed. Nothing ran on a device.
- **Grading:** by the skill's author, not blind; read against the diff and the answer.

| Assertion | Result | Why |
| --- | --- | --- |
| A1 Vega files only | pass | New code in `*.vega.ts(x)`; dependencies only in `apps/vega`; other platforms untouched. |
| A2 Separate ad player and surface, content after the pre-roll | pass | Two ad players on their own surfaces; content starts at the break's end. |
| A3 Manifest checked, media controls focus moved and given back | pass | Entries already present, not duplicated; focus to the ad after its first frame, back to the content handler after the break. |
| A4 No `DOMParser`, no `Image` | pass | xmldom and an `Image` shim with `fetch`. |
| A5 Impression on first frame, content on any error | pass | Impression on `playing`; 4 s request and 8 s plan budgets; watchdogs 5/8/10/30 s. |
| A6 No device claims, device checks listed | pass | 15 device checks listed. |
| A7 Ad surfaces after the content surface | pass | Ad surfaces mounted after the content surface's `onSurfaceViewCreated`. |

**Gaps the run found in the skill, now fixed:** vast-client's default URL handler and `window.location`; how to show one ad surface over the other; the audit in a monorepo; requesting before Play when only Vega files may change; unknown app macros; play/pause while the pre-roll loads; the `[ASSETURI]` fix; `scalingmode` (default `'strech'`).

**Not done yet:** the same prompt without the skill, and the trigger test.
