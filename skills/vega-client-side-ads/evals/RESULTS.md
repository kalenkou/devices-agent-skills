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
| S1 Add a pre-roll to the multi-TV sample | _/6 | _/6 |
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
