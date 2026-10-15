# Testing ads on a Fire TV Stick without speaking

Ad behaviour on Vega has to be checked on a real stick. Return values do not show it, the system log drops lines, and the Virtual Device lacks parts of the platform. This file shows how to run a scripted check with key presses, screenshots and the ad server's pixel log, and what still needs a person. *Measured* = Fire TV Stick 4K Select, Vega OS 2.0, Vega SDK 0.24, October 2026.

## Before you start

- Developer mode on the stick, and the stick reachable from the computer (`vega exec vda -s <ip>:5555 ...`). Below, `vsh` means `vega exec vda -s <ip>:5555 shell`.
- **Ask first if the stick is someone's TV.** Check what is on screen before you send keys.
- **Keep the TV on and awake.** With the HDMI sink off, the app sent no network request after launch, one `gwsi-tool-screenshooter` call hung for more than 4 minutes and a later one wrote a 0-byte file, with no message. Put a timeout on every device call and treat a 0-byte screenshot as "no display".
- Amazon's hosted device testing (Appstore Quality Central, Live Device Interaction) takes Fire OS APKs only, not Vega packages, so you need your own stick.

## Drive the app

| Action | Command |
| --- | --- |
| Install and launch | `vega run-app <app>.vpkg -d <ip>:5555` (a reinstall clears app storage) |
| Cold launch without reinstall | `vsh "vlcm launch-app orpheus://<component-id>"` |
| Stop the app | `vsh "vlcm terminate-app --pkg-id <package-id> --force"` |
| Press a key | `vsh "inputd-cli button_press KEY_PLAYPAUSE"`; also `KEY_ENTER`, `KEY_BACK`, `KEY_LEFT`, `KEY_RIGHT` |
| Home | `vsh "inputd-cli button_press KEY_HOMEPAGE"`. `KEY_HOME` reaches the app as a key but does not open the launcher. Or `vsh "vlcm launch-app orpheus://com.amazon.smplighthouse.launcher.main"` |
| Background / foreground | `vsh "vlcm trigger-app background"`, then `foreground` |
| Screenshot | `vsh "gwsi-tool-screenshooter /tmp/a.png"`, then `vega exec vda -s <ip>:5555 pull /tmp/a.png .` |
| Crashes and hangs | `vsh "vlcm crash-history"` (look for your package; *measured:* one `AppNotResponding`, reason "Lifecycle Callback", in two days of runs) |
| Memory | `vega exec perf memory-monitor` (Amazon KPI: PSS < 400 MiB) |
| Cold launch KPI | `vega exec perf kpi-visualizer --certification` |

Key presses go through the same path as the remote, including Vega media controls. Use them for every play/pause test.

## Logs

`vsh "loggingctl log -f -o cat"`, filtered by your package id, is the live system log. Know its limits:

- It drops app lines when the process logs more than **300 lines per second**: `Process exceeds log limit of [300] lps, [info] logs will be temporarily suppressed for [1] sec`. During playback the media pipeline (GStreamer, W3CMEDIA) uses most of that budget. Filtering on the computer does not bring dropped lines back. *Measured:* the impression line was missing in 7 of 20 runs.
- A missing line is **not** proof that an event did not happen. Use the log for platform messages (`Invalid or insecure URI scheme`, `Forbidden (403)`, `checkClientManifestForKMC`, `isSessionInForeground`), and judge the ads by the pixel log.
- For the app's own events, send them to a server on the computer or show them on screen in a debug build.

## Pixel log: the verdict

Point the test VAST/VMAP at a server you control. Its tracking URLs carry the ad and the event, so every pixel lands in one log on the computer, with nothing lost:

```js
// pixel-log.mjs — node pixel-log.mjs > pixels.log
import { createServer } from 'node:http';
createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/pixel') {
    console.log(new Date().toISOString(), u.searchParams.get('ad'), u.searchParams.get('e'), u.searchParams.get('code') ?? '');
  }
  res.writeHead(200).end();
}).listen(8080, '0.0.0.0');
```

Tracking URLs in the test VAST look like `http://<computer-ip>:8080/pixel?ad=ad1&e=firstQuartile`. Plain HTTP needs the computer's IP in the debug manifest's `[network-traffic-policy.cleartext]`; keep that out of release builds.

A run passes when, for each ad that played:

1. `impression` and `start` come once, then `firstQuartile`, `midpoint`, `thirdQuartile`, `complete`, in order, about a quarter of the ad length apart.
2. A pod's ads appear in `sequence` order, one impression each.
3. A skipped ad has `skip` and no `thirdQuartile`/`complete` after it.
4. An ad cut by Home or Back has nothing after the cut.
5. A failed ad has one `error` pixel with a code, and the content still plays.
6. No pixel arrives for a prebuffered ad that was never shown.

Then check the content: two screenshots 2 s apart, after the break, with no key pressed between them, must differ (the movie plays). Crop away the app's controls before comparing.

## Scenarios to script

| Scenario | Steps | Pass |
| --- | --- | --- |
| Pre-roll → content | cold launch, `KEY_ENTER` on Play, wait for `complete` | pixel order above; screenshots differ after the break |
| Mid-roll pod | seek near the break (`KEY_RIGHT` × n), wait for the last `complete` | `sequence` order; screenshots differ after |
| Play/pause during an ad | `KEY_PLAYPAUSE`, wait 3 s, `KEY_PLAYPAUSE` | `pause` then `resume` pixels; the ad (not the content) paused; ad still reaches `complete` |
| Long pause | pause the ad for 16 s, then resume | the ad is not taken for a stalled one; it resumes from the same frame |
| Skip | `KEY_ENTER` on Skip after the offset; another run before it | `skip` pixel and content within ~0.3 s; before the offset nothing happens |
| Back during an ad | `KEY_BACK` 2–3 s into the ad | agreed behaviour; no pixel after the cut; second Back does not loop |
| Home during an ad | `KEY_HOMEPAGE` 2–3 s into the ad | no pixel after `firstQuartile`; no ad audio on the launcher; relaunch works |
| Repeat runs | the same script 3+ times, cold launches | all pass; check `vlcm crash-history` after |

## What needs a person

- **Alexa phrases.** They cannot be injected. Ask a person to say "Alexa, pause" and "Alexa, play" during an ad and during content, and one unrelated request during an ad (the ad must still reach `complete`).
- **No flash between ads.** Film the TV with a phone at 30 fps or more and step through the video frame by frame around each switch: no black frame, no movie frame between pod ads.
- **Loudness** by ear, VoiceView announcements, HDMI input change, screensaver.

## What the Vega Virtual Device cannot show

From Amazon's [Run your app overview](https://developer.amazon.com/docs/vega/0.24/run-apps-overview.html) and [Media Player playing DRM content](https://developer.amazon.com/docs/vega/0.24/media-player-device.html):

- DRM playback only on Mac M-series hosts, and only DRM L3. On other hosts Shaka reports `DRM.FAILED_TO_CREATE_CDM`.
- WebView only on Mac M-series hosts.
- Login with Amazon, the launcher and other Fire TV middleware are not supported.
- Not for performance testing; it runs on the host CPU, not the stick's ARM.
- `inputd-cli` commands are limited by default.

Also *measured:* the SDK 0.24 Virtual Device runs Vega OS 1.2, while the stick ran Vega OS 2.0, and its keyboard mapping for media keys differs from the docs (F7 is play/pause in the SDK script). Use the Virtual Device for layout and logic; check ads, media controls, surfaces and timing on a stick.
