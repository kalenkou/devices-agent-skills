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
| S1 Add a pre-roll to the multi-TV sample | 3/7 (16.10.2026, see below) | 7/7 (16.10.2026, see below) |
| S2 The remote does nothing during the ad | _/5 | _/5 |
| S3 The movie flashes between two ads | _/5 | _/5 |
| S4 Tracking pixels never arrive | _/5 | _/5 |
| S5 Black screen with an http ad | _/5 | _/5 |
| S6 The ad is cut off after Alexa | _/5 | _/5 |
| S7 Prove Home and Back on a real stick | _/5 | _/5 |
| **Assertions passed** | **_/36** | **_/36** |
| **Scenarios fully passed** | **_/7** | **_/7** |

## What the baseline got wrong

From S1 (one run, so far the only scenario run both ways):

- **One player for ad and content.** The baseline switches `src` on the content `VideoPlayer` (ad, ad, then the movie). It flags this itself as its biggest device risk: it could not confirm that the Vega player supports a second `src` on the same surface. Amazon's CSAI guide uses separate players and surfaces for this reason, and a shared player cannot prebuffer the content during the ad.
- **Shared files changed.** To get a title id into the ad tag, it added a route param in three files that every platform uses (`navigation/types.ts`, `HomeScreen.tsx`, `DetailsScreen.tsx`), although the task said not to change the other platforms.
- **Media controls.** It blocks seek and skip from media controls during the ad, but does not check the manifest entries.
- **Guessed facts.** VMAP error codes 1006–1008 "from memory"; up to about 6.5 s of black screen before the movie when the ad server hangs.

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

### S1 without the skill, 16.10.2026

- **Setup:** a fresh coding agent got the same S1 prompt and a clean copy of the sample at `d435082`. No skill, no Skill tool, no MCP tools, no web access, no device. Same host and model as the run with the skill.
- **What it built:** its own client: `fast-xml-parser`, `fetch` for VMAP/VAST and pixels, four new `*.vega.ts(x)` files, ad playback on the content player by switching `src`, changes to `VideoHandler.kepler.ts`, the media control handler and `PlayerScreen.vega.tsx`, and an optional route param in three shared files. The Vega debug build passed; its own Node tests with a stub player passed (14 scenarios). Nothing ran on a device.
- **Grading:** by the skill's author, not blind; read against the diff and the answer.

| Assertion | Result | Why |
| --- | --- | --- |
| A1 Vega files only | fail | `navigation/types.ts`, `HomeScreen.tsx` and `DetailsScreen.tsx` are shared by all platforms. |
| A2 Separate ad player and surface, content after the pre-roll | fail | One player and one surface; the ad is a `src` switch before the movie. |
| A3 Manifest checked, media controls focus moved and given back | fail | Manifest not checked; focus stays on the one player (the sample's own call). Seek and skip from media controls are blocked during the ad. |
| A4 No `DOMParser`, no `Image` | pass | `fast-xml-parser`; pixels with `fetch`. |
| A5 Impression on first frame, content on any error | pass | Impression on the first `timeupdate` with `currentTime > 0`; 4 s request and 6 s total budgets, 10 s start timeout, then the movie. |
| A6 No device claims, device checks listed | pass | 10 device checks listed; it names the `src` switch as unverified. |
| A7 Ad surfaces after the content surface | fail | No ad surface. With one surface the stacking problem does not arise, but neither does the prebuffered switch the assertion is about. |

**Not done yet:** the trigger test, scenarios S2–S7, and a blind grader.
