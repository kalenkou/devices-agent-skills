# Pitfalls: symptom → cause → fix

Each entry was found and measured while building client-side ads on a **Fire TV Stick 4K Select, Vega OS 2.0, Vega SDK 0.24**, `@amazon-devices/react-native-w3cmedia` ~2.1, October 2026. One device; re-check on yours. The `FL-nn` ids point to the friction log of `react-native-vega-ads` (`docs/friction-log.md`), which has the full steps.

## Remote or "Alexa, pause" does nothing during the ad

- **Cause:** media controls need two steps: the manifest entries (`com.amazon.category.kepler.media` category and the `IMediaPlaybackServer` interface provider) **and** `setMediaControlFocus` on the ad player at each switch. With one missing, 0 commands are delivered and nothing is logged except `isSessionInForeground :0`. (FL-03)
- **Fix:** both steps, see [media-controls.md](media-controls.md). Give focus back to the content player after the break.
- **If it still fails:** look for `checkClientManifestForKMC: … has KMC: false` in the log; the same manifest gave `false` in 4 of 13 launches (FL-18). Check that Alexa works in another app; once it worked nowhere until the stick was restarted.

## Ad pauses and resumes at once, or resume does not stick

- **Cause:** the play/pause key reaches both media controls and the JS key handler. With media controls on, an app that also toggles in JS toggles twice (FL-06). Without the manifest entries, the legacy player session pauses a playing player on the key and undoes the app's resume ~450 ms later (FL-07).
- **Fix:** media controls as the only owner of play/pause; ignore `playpause` in the app's handler while an ad plays.

## Movie flashes between two ads

- **Symptom:** in a pod, the paused movie frame shows for a moment between ad 1 and ad 2.
- **Cause:** a w3cmedia surface turns empty after `ended`; it does not keep the last frame. A prebuffered player took ~370–450 ms from `play()` to `playing`, so the movie under it showed for ~0.4–0.6 s. (FL-05)
- **Fix:** start the next ad on the second ad player ~500 ms before the current ad ends; let the current one finish hidden and muted; swap surfaces on the next ad's `playing`. *Measured:* next first frame 64–85 ms before the previous `ended`; `complete` still correct; phone video frame by frame: no movie frame between ads.
- **Do not** "fix" it by waiting longer or by showing a black view: that hides the symptom and keeps the gap.

## Ad or content is a black screen

Read the system log; the JS error alone will not tell you why.

| Log line | Cause | Fix |
| --- | --- | --- |
| `MediaUrlSourceImpl.cpp(58) createSourceElement Invalid or insecure URI scheme`, `Could not build sourceBin` | w3cmedia refuses `http://` media. `fetch` to the same host works, so VAST loads and the media fails. The ad ends with VAST 400. (FL-08) | HTTPS media. For a development server, add `[network-traffic-policy.cleartext]` with `allowed-domains = ["192.168.1.20"]` to `manifest.toml` (an IP address works, no port). The docs describe this section only for WebView. Many ad servers still return `http://` media files: check the VAST. |
| `souphttpsrc … Forbidden (403)` (warning level) | The server refused the file. JS got `error` with `code = 4` and an empty `message`. A Google sample bucket URL used in many player samples returns 403. (FL-01) | Check media URLs from a computer first (`curl -r 0-1000 <url>`). Report the cause from the log, not "decoder error". |
| No error, overlay shows "Ad · 0:00" over black, then the content | No first frame within the first-frame watchdog (5 s). Seen once on a cold launch; cause not confirmed. | Keep a first-frame watchdog that ends the ad with 405 and resumes the content. |

## Tracking pixels never arrive

- **Cause:** Vega has `window` but no `Image` constructor (*measured* at run time). VAST/VMAP code written for browsers sends pixels with `new Image().src = url`; on Vega that throws or does nothing.
- **Fix:** install a small `Image` shim that sends a `GET` with `fetch` before any VAST code runs, or send pixels yourself ([implementation-checklist.md](implementation-checklist.md#1-runtime-gaps-on-vega)).
- **Check:** count pixels on your own server, not in the device log (the log drops lines, see below). *Measured:* impression + 5 events per ad, all HTTP 200.
- Also check that the media URL is HTTPS: an ad that never plays never sends its pixels.

## Impression late on the first launch

- **Symptom:** on the first launch after install, the impression and `start` pixels come seconds after the ad is visible; quartiles bunch up.
- **Cause:** `setMediaControlFocus`, called right after `play()`, blocked the JS thread for ~1.2–2.4 s on a cold launch. The `playing` event waited. Impression 2.4 s late on the first launch after install, 0.5 s on the next. With a 5 s first-frame watchdog this can also drop the pre-roll. (FL-09)
- **Fix:** take media controls focus after the first frame is handled (`setTimeout(0)` from the `playing` handler). *Measured after:* 143 ms from native `playing` to the impression.

## Ad ends early after a voice request

- **Symptom:** the viewer talks to Alexa during an ad; the ad is cut off with VAST error 405.
- **Cause:** during an Alexa request the video stops advancing for 6–13 s with **no** `pause`, `waiting` or `playing` event. Quartile pixels came 6 s and 16 s apart instead of 2.5 s. A 10 s stall watchdog cannot tell this from a dead stream. (FL-11)
- **Fix:** two timeouts: 10 s after a `waiting` event (real buffering), 30 s when time stops with no event. *Measured after:* quartiles 7.3 s apart, no 405, the ad reached `complete`. Amazon's Vega Alexa test expects playback to resume after the Alexa card closes, also during ads.

## Voice pause sends no `pause` event

- **Symptom:** a pause ad, or analytics, misses "Alexa, pause".
- **Cause:** the picture is already frozen while Alexa listens, so the player state does not change and no `pause` event fires. The media controls handler does get the pause command. (FL-11)
- **Fix:** listen to the pause command in the content's media controls handler as well as to the `pause` event.

## Voice skip does not work

- **Cause:** "Alexa, next" / "Alexa, skip" did not reach `handleNext` during an ad, even with `Next` in `command_options` and NEXT in the published actions (4 runs). (FL-10, FL-14)
- **Fix:** a Skip button with D-pad focus. Tell the user voice skip is not offered.

## Content does not resume after the break

- Seeking a content player that has never played (right after a pre-roll) came before a rare stop at 0:00 (1 of 6 runs; likely cause, not proven). Seek back only if the content moved more than ~0.25 s after `pause()`.
- With Shaka, `timeupdate` arrives while the pre-roll loads. A scheduler that reads it as content progress drops the pre-roll: black screen. Count content time only after the content has started.
- If the app owns a media controls handler for the content, restore it when focus returns to the content player.

## "The event never fired" (but it did)

- **Cause:** the system log drops app lines when a process logs more than 300 lines per second: `Process exceeds log limit of [300] lps, [info] logs will be temporarily suppressed for [1] sec`. The media pipeline uses most of that budget during playback. *Measured:* the impression line was missing in 7 of 20 runs. (FL-02)
- **Fix:** judge ads by the ad server's pixel log; mirror important app events to a server or to the screen. See [testing-on-device.md](testing-on-device.md#logs).

## DRM content in a sample is not on the secure path

Amazon's video sample compares a title's `secure` flag with the string `'true'` while the data uses the boolean `true`, so its DRM title asks for the software robustness. Found by reading the code, not confirmed in a device log. (FL-12) If you copy the sample's player, check the robustness you really get. Remember that early Vega devices have one secure decoder: ads next to DRM content must be clear.

## Release package fails validation

`react-native build-vega --build-type Release` from the template produced packages that `vega exec vpt validate` rejected: "build_number must be greater than 0, found: 0". Add `--build-number 1` (and raise it for each upload). (FL-17)
