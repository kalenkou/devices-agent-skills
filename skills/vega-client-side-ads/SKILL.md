---
name: vega-client-side-ads
description: Add, review or debug client-side ad insertion (CSAI) of VAST 4 / VMAP 1 video ads in a React Native for Vega app on Fire TV (Vega OS) that plays with the w3cmedia VideoPlayer. Covers the two-player pattern (content player plus ad player on separate video surfaces), ad requests and macros, VAST/VMAP parsing without DOMParser, wrappers and ad pods, IAB tracking pixels and VAST error codes, skippable ads, remote and Alexa play/pause during ads (media controls manifest entries, setMediaControlFocus), Back and Home during a break, resuming the content at its position, and checking it all on a Fire TV Stick without speaking. Use for pre-rolls, mid-rolls, post-rolls or pause ads on Vega, and for symptoms such as "the remote does nothing during the ad", "the movie flashes between two ads", "tracking pixels never arrive" or "the ad is a black screen". Not for server-side insertion (SSAI), Fire OS (Android) apps or web players.
---

# Vega Client-Side Ads (VAST / VMAP)

Amazon's CSAI guide for Vega shows how to switch between a content `VideoPlayer` and an ad `VideoPlayer`. Everything else is left to the app: ad requests, VAST/VMAP, pods, tracking, errors, skip, remote and voice, Back and Home. This skill gives the agent a checklist for that work and the Vega behaviour that breaks it.

Most of these failures are **silent**. The remote key reaches the app and is dropped. A media URL is refused with a generic error. Tracking pixels throw inside a library. The system log drops the line that would explain it. So the rule across every reference: **prove ad behaviour on a real Fire TV Stick**, from the ad server's pixel log and screenshots, not from return values or one look at the screen.

*Measured* in the references means: Fire TV Stick 4K Select, Vega OS 2.0, Vega SDK 0.24, `@amazon-devices/react-native-w3cmedia` ~2.1, October 2026, one device. Re-check numbers on the devices you ship to.

## Check before applying

1. **Is it a Vega app?** `package.json` lists `@amazon-devices/react-native-kepler`, and a `manifest.toml` is at the app root. In a multi-platform monorepo, work only in the Vega files (for example `*.vega.tsx` or `*.kepler.ts`) and the Vega app's `manifest.toml`. A Fire OS app (`AndroidManifest.xml`) or a web player: this skill does not apply.
2. **Client-side or server-side?** If the ads are stitched into the stream by a server (SSAI, for example Google IMA DAI or Yospace), this skill does not apply.
3. **Which content player?** Find where the app creates its `VideoPlayer` (directly, or the one Shaka plays through) and where it draws the `KeplerVideoSurfaceView`. The ad players are added next to it.
4. **Where do the ads come from?** A VMAP tag, or a list of VAST tags with times. Is the content DRM-protected? Then use clear (non-DRM) ad creatives (see [architecture.md](references/architecture.md#drm-and-memory)).
5. **Run the static check:** `node references/scripts/audit.mjs <app-dir>`. No dependencies; exits 1 on findings. It only finds what is visible in files (manifest entries, `http://` media, deprecated APIs, a `playpause` handler). Read each finding in context.

## The pattern in short

1. One content player and one or two ad players. Each player has its own `KeplerVideoSurfaceView`; the ad surfaces sit above the content surface (`zIndex`). Separate surfaces avoid a black frame at the switch.
2. Before the break: request and parse the ads, create the ad player with `autoplay` off, set its `src`, wait for `canplay`.
3. At the break: pause the content and remember its position. Play the ad. Show the ad surface and send the impression on the ad's first frame (`playing`), not earlier.
4. Between ads of a pod: start the next ad about 500 ms before the current one ends (a surface goes empty after `ended`).
5. After the break: hide and release the ad player, give media controls back to the content, resume the content. Seek only if it moved.

Details, timings and the single-player fallback: [architecture.md](references/architecture.md).

## What the app must handle

Ad requests with timeouts and macros · VAST/VMAP parsing (no `DOMParser` on Vega) · wrappers · pods in `sequence` order · media file choice (HTTPS) · IAB tracking (no `Image` on Vega) · VAST error codes · skip with D-pad focus · media controls during ads · Back and Home · content position · ad overlay · errors never block the content. One section per item, with pass criteria: [implementation-checklist.md](references/implementation-checklist.md).

## What an agent gets wrong without this skill

1. **Media controls with one step.** Remote play/pause and "Alexa, pause" reach the players only with **both** the manifest entries and `setMediaControlFocus` on each switch. With one missing, nothing works and nothing is logged → [media-controls.md](references/media-controls.md).
2. **Handling `playpause` in JS as well.** The key reaches both media controls and `useTVEventHandler`, so the ad toggles twice → [media-controls.md](references/media-controls.md#key-routing).
3. **Waiting for `ended` before starting the next ad.** The surface goes empty after `ended`; the paused movie shows for ~0.4–0.6 s between ads → [pitfalls.md](references/pitfalls.md#movie-flashes-between-two-ads).
4. **Plain `http://` media files.** w3cmedia refuses them unless the host is in the manifest's cleartext list; the app sees only a generic error → [pitfalls.md](references/pitfalls.md#ad-or-content-is-a-black-screen).
5. **Trusting a VAST library's tracking on React Native.** Vega has `window` but no `Image`; browser-style pixel code throws or does nothing → [pitfalls.md](references/pitfalls.md#tracking-pixels-never-arrive).
6. **Calling `setMediaControlFocus` right after `play()` on a cold launch.** It held the JS thread for 1–2 s; the impression was 2.4 s late → [pitfalls.md](references/pitfalls.md#impression-late-on-the-first-launch).
7. **A short stall timeout.** During an Alexa request the video stops for 6–13 s with no media event; a 10 s watchdog killed a healthy ad → [pitfalls.md](references/pitfalls.md#ad-ends-early-after-a-voice-request).
8. **Offering voice skip.** "Alexa, next" and "Alexa, skip" did not reach the app during an ad. Offer a Skip button → [media-controls.md](references/media-controls.md#alexa).
9. **Debugging from the system log.** It drops app lines above ~300 lines/s, so "event never fired" can be wrong → [testing-on-device.md](references/testing-on-device.md#logs).

## Options

Pick one with the user. Do not push a library.

1. **Write it yourself** with [implementation-checklist.md](references/implementation-checklist.md). The MIT parsers `@dailymotion/vast-client` and `@dailymotion/vmap` run on Vega with a pure-JS XML parser (for example `@xmldom/xmldom`) and a tracking transport (see the checklist).
2. **Use `react-native-vega-ads`**, an open-source library (Apache-2.0) built on this pattern and measured on the device above. It is early, tested on one device, and **not on npm at the time of writing**. <!-- npm link after publish --> Source: <https://github.com/kalenkou/vega-ads>.
3. **A partner or commercial option** when the user needs Google Ad Manager features or a vendor ad server. See Amazon's [supported libraries](https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html) and ask the vendor what it supports on Vega (skippable ads, remote and Alexa during ads).

Whatever the choice, the manifest entries, the pitfalls and the device checks below still apply.

## References

| Topic | File |
| --- | --- |
| Two-player pattern, surfaces, timings, DRM, memory, lifecycle | [architecture.md](references/architecture.md) |
| Everything the app must handle, with pass criteria | [implementation-checklist.md](references/implementation-checklist.md) |
| Manifest entries, `setMediaControlFocus`, key routing, Alexa | [media-controls.md](references/media-controls.md) |
| Symptom → cause → fix, from device measurements | [pitfalls.md](references/pitfalls.md) |
| Checking ads on a Fire TV Stick without speaking; Virtual Device limits | [testing-on-device.md](references/testing-on-device.md) |
| Static check of an app | `node references/scripts/audit.mjs <app-dir>` |

## Decision tree

```
Adding ads
├─ Where do players and surfaces go?          → architecture.md
├─ What must the code handle?                 → implementation-checklist.md
└─ manifest.toml entries                      → media-controls.md (Manifest)

Symptom
├─ Remote or "Alexa, pause" does nothing      → media-controls.md, then pitfalls.md
├─ Ad pauses and resumes at once              → media-controls.md (Key routing)
├─ Movie flashes between two ads              → pitfalls.md
├─ Ad or content is a black screen            → pitfalls.md
├─ Tracking pixels never arrive               → pitfalls.md
├─ Impression late on the first launch        → pitfalls.md
├─ Ad ends early after talking to Alexa       → pitfalls.md
├─ Content does not resume after the break    → pitfalls.md + architecture.md (Resume)
└─ Event "never fired" in the log             → testing-on-device.md (Logs)

Proving it works                              → testing-on-device.md
```

## Output style

- Name the files you change and keep Vega-only code in Vega files.
- Show the `manifest.toml` diff whenever media controls or `http://` media are involved.
- Mark device numbers as measured on one device, with the device name.
- Do not claim a device check was done unless you ran it. List it for the user instead.

## Hand off to a human

Some checks need a person at the TV: saying the Alexa phrases, seeing that no movie frame flashes between ads (film the screen with a phone and step through it frame by frame), hearing that the ad is not louder than the movie, and VoiceView announcements. Give the user these as open items, with the steps from [testing-on-device.md](references/testing-on-device.md).
