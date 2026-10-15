# Implementation checklist

Everything a Vega app has to handle for VAST/VMAP ads, whether it writes the code itself or uses a library. Each section ends with a **pass** line: what to check before calling the item done. *Measured* = Fire TV Stick 4K Select, Vega OS 2.0, Vega SDK 0.24.

## 1. Runtime gaps on Vega

*Measured* on the device: `window` is an object, `Image` is `undefined`, `DOMParser` is `undefined`; `fetch`, `XMLHttpRequest` and `AbortController` exist.

- **XML:** use a pure-JS parser. `@xmldom/xmldom` gives a `DOMParser` that `@dailymotion/vast-client` and `@dailymotion/vmap` accept; `fast-xml-parser` also runs. Native XML modules are not available. *Measured,* Release build, 34.4 KB VAST: ~49 ms text → DOM with xmldom, ~11 ms DOM → model with vast-client (median of 30). Parse before the break, not at it.
- **Tracking transport:** browser-style VAST code sends pixels with `new Image().src = url` when `window` exists. On Vega that throws or sends nothing. Give the library a small `Image` shim that does a `GET` with `fetch`, or send the pixels yourself:

```ts
// Install once at start-up, before any VAST/VMAP code runs.
const g = globalThis as { Image?: unknown };
if (typeof g.Image === 'undefined') {
  g.Image = class PixelImage {
    private url = '';
    get src() { return this.url; }
    set src(url: string) {
      this.url = url;
      if (url) fetch(url).catch(() => fetch(url).catch(() => undefined)); // one retry
    }
  };
}
```

**Pass:** a test pixel URL on your own server is hit once per event, with HTTP 200.

## 2. Ad requests

- Time out every request. *Values we used:* 4 s per VAST/VMAP request. Amazon test criterion 2.3: loading over 15 s must be shown to the viewer.
- Follow wrappers up to a limit (5 levels is common). Count each hop against the time budget.
- Fill macros before the request: `[CACHEBUSTING]`, `[TIMESTAMP]`, and where your ad server wants them `[IFA]`, `[IFATYPE]`, `[LIMITADTRACKING]`, `[BREAKMAXADS]`, `[BREAKMAXDURATION]`.
- **Advertising ID:** read it with `@amazon-devices/kepler-adid-retriever`. Check the user's opt-out first (Amazon's Advertising ID policy); on opt-out or any error send no ID and `LIMITADTRACKING=1`. Without `[[wants.service]] id = "com.amazon.admanager.service.main"` in `manifest.toml` the ID service reports "do not track" for every user.
- Do not pass the Advertising ID in child profiles or child-directed parts of the app.
- Request the pre-roll on the title's page, before Play. *Measured,* ad server answering in 600 ms per request, 10 cold launches each: Play → pre-roll's first frame median 2.4 s without this, 1.7 s with it.
- Request each mid-roll ahead of time (15 s before the break worked).

**Pass:** a slow or dead ad server never delays the content by more than the time budget.

## 3. VMAP and the break schedule

- VMAP `timeOffset`: `start`, `end`, `HH:MM:SS(.mmm)`, percentage, or `#n` position. Support at least the first three.
- Without VMAP, a list of `{ offset, vastUrl }` works the same way.
- A break that is not ready in time is skipped; the content goes on.
- Mark mid-rolls on the app's timeline and show a short countdown ("Ad in 5") only when the break's ads are loaded.
- VMAP has its own error codes (1000 range) and tracking (`breakStart`, `breakEnd`, `error`).

**Pass:** pre-roll, one mid-roll and post-roll play in order; a seek over a break plays that break.

## 4. VAST: ads, pods and media files

- Ads with a `sequence` attribute form a **pod**; play them in `sequence` order, not document order. *Measured:* Google's sample returns pod creatives in a different order on each request.
- Ads without `sequence` are a buffet: use them to fill a pod slot whose ad failed.
- Choose a `MediaFile` the player can play: progressive MP4 (H.264/AAC) is the safe choice; cap the height to the screen. Prefer `https://`. A plain `http://` file fails on Vega unless its host is in the manifest's cleartext list ([pitfalls.md](pitfalls.md#ad-or-content-is-a-black-screen)).
- Put the URL of the file that actually plays into `[ASSETURI]`. In our use, vast-client alone filled it with the first file of the list.

**Pass:** a 3-ad pod plays 1, 2, 3 by `sequence`, with one impression per ad.

## 5. IAB tracking

- **Impression and `start`:** on the ad's first frame (`playing`), when its surface is on screen. Never for a prebuffered, hidden player.
- **Quartiles:** `firstQuartile`, `midpoint`, `thirdQuartile` from `timeupdate`; `complete` on the real end.
- **Pause/resume:** only for viewer actions, not for the break's own pause of the content.
- **Skip:** `skip`, then no `thirdQuartile` or `complete`.
- **Error:** fire the ad's `<Error>` URLs with `[ERRORCODE]` filled.
- **notUsed** (VAST 4.1): for an ad you received and chose not to play.
- An ad cut short by Home or Back gets no further quartiles and no `complete`.

**Pass:** for one 10 s ad the pixel server logs impression, start, firstQuartile, midpoint, thirdQuartile, complete, each once, in order, about 2.5 s apart.

## 6. VAST error codes the app sends

| Code | When |
| --- | --- |
| 100 | XML parse error |
| 101, 102 | Schema error; VAST version not supported |
| 205 | Ad category blocked (VAST 4.1) |
| 300–303 | Wrapper error: general, timeout, limit reached, no ad after wrappers |
| 400 | General linear error (for example the player refused the file) |
| 401, 402 | Media file not found; media file timeout |
| 403 | No supported media file |
| 405 | Problem displaying the media file (no first frame, stall) |
| 900 | Undefined error |

*Watchdogs we used:* no first frame in 5 s → 405; a player not ready in 8 s → skip the ad; buffering for 10 s after a `waiting` event → 405; time not moving for 30 s **with no event** → 405. The long silent timeout is for Alexa requests ([pitfalls.md](pitfalls.md#ad-ends-early-after-a-voice-request)).

**Pass:** every failed ad sends one error pixel and the content goes on. No error stops playback.

## 7. Skip

- Read `skipoffset` (time or percentage). Show a Skip button with D-pad focus after it.
- OK on Skip before the offset is ignored.
- Do not offer voice skip: "Alexa, next" / "Alexa, skip" were not delivered during an ad ([media-controls.md](media-controls.md#alexa)).
- Appstore advertising policy: ads that cannot be closed after 15 s are not allowed, except ads "within video-streaming content" and "during natural pauses". Linear breaks in a video fall under the exception; check yours.

**Pass:** OK on Skip after the offset sends `skip` and the content starts within about 0.3 s.

## 8. Remote and voice during ads

- Play/pause (remote and "Alexa, pause/play") act on the ad. Needs the manifest entries and `setMediaControlFocus` ([media-controls.md](media-controls.md)).
- Block seek, fast-forward, rewind and speed changes during an ad.
- If the app has its own key handler, ignore `playpause` there while an ad plays.

**Pass:** `inputd-cli button_press KEY_PLAYPAUSE` pauses the ad, not the content; a second press resumes it.

## 9. Back and Home

- Home: release the ad players at once; no ad audio on the launcher; content continues on return; the interrupted break is not shown again.
- Back: goes to the app or ends the break, as agreed with the user; never a loop or a force close.
- Never start an ad when the user tries to leave the app.

**Pass:** see [testing-on-device.md](testing-on-device.md#scenarios-to-script) (Back and Home rows).

## 10. Overlay and accessibility

- Show "Ad", the position in the pod and time left ("Ad 1 of 3 · 0:12"). Keep it inside the TV safe area.
- Keep D-pad focus on the Skip button during an ad; return focus to the player UI after.
- For VoiceView, announce each ad with its length and when Skip comes.

## 11. Loudness (optional)

VAST 4 has no loudness field. If the ad server sends each ad's integrated loudness (for example in a creative extension), turn ads that are louder than the content down to it with the player volume, never up.
