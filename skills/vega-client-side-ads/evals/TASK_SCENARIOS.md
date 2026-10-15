# Task scenarios

Each scenario is a prompt an agent receives, plus the assertions a good answer must meet. Run each prompt twice, once with the skill loaded and once without, in a fresh context. Score each assertion pass/fail. A scenario passes when all its assertions pass. S1 needs a checkout of the named repository; the others can be answered from the prompt alone.

## S1. Add a pre-roll to the multi-TV sample

> In a checkout of `AmazonAppDev/react-native-multi-tv-app-sample`, add a VAST pre-roll before the video on Vega only. Our VMAP tag is `https://ads.example.com/vmap?title=[TITLEID]`. Do not change the other platforms.

- A1. Changes only Vega files (for example `packages/shared-ui/src/components/player/VideoPlayer.vega.tsx`, `packages/shared-ui/src/screens/PlayerScreen.vega.tsx`, `packages/shared-ui/src/utils/VideoHandler.kepler.ts`, or new `*.vega.ts(x)` files) and, if needed, `apps/vega/manifest.toml`; the files for other platforms are untouched.
- A2. Adds a separate ad `VideoPlayer` with its own `KeplerVideoSurfaceView` above the content surface; the content starts only after the pre-roll (content `autoplay` off).
- A3. Checks that both media controls manifest entries are present (the sample already has the `com.amazon.category.kepler.media` category and the `IMediaPlaybackServer` interface provider; do not duplicate them), and moves media controls focus to the ad player at ad start and back to the content player after the break (the sample already gives it to the content player).
- A4. Provides an XML parser that runs without `DOMParser` and a tracking transport that runs without `Image` (or uses a library that does).
- A5. Sends the impression on the ad's first frame, and on any ad error or timeout plays the content.
- A6. Does not claim device behaviour it did not check; lists the device checks for the user.

## S2. The remote does nothing during the ad

> In my Vega app the ad plays on a second w3cmedia VideoPlayer. I call `adPlayer.setMediaControlFocus(componentInstance)` when the ad starts, but the remote's play/pause and "Alexa, pause" do nothing during the ad. No error anywhere. What is missing?

- A1. Says media controls need the manifest entries as well: the `com.amazon.category.kepler.media` category and the `interface.provider` extra with `com.amazon.kepler.media.IMediaPlaybackServer`; shows the `manifest.toml` snippet.
- A2. Says that with one of the two steps missing there is no error (silent failure).
- A3. Says to give focus back to the content player after the break.
- A4. Warns that the play/pause key also reaches JS (`useTVEventHandler`), so an app handler must ignore `playpause` during the ad, or the ad toggles twice.
- A5. Suggests checking with `inputd-cli button_press KEY_PLAYPAUSE` on the device rather than by reading the code.

## S3. The movie flashes between two ads

> On Fire TV (Vega) I play a pod of two ads. Ad 2 is prebuffered on a second player with `autoplay` false. On ad 1's `ended` I call `play()` on ad 2 and bring its surface to the top. Viewers see a flash of the paused movie between the two ads. Why, and how do I fix it?

- A1. Explains that a w3cmedia surface does not keep the last frame after `ended`, so the content surface below shows through.
- A2. Gives the measured order of magnitude: `play()` → `playing` of a prebuffered player takes a few hundred ms (~370–450 ms measured; ~0.4–0.6 s of movie visible).
- A3. Fix: start ad 2 about 500 ms before ad 1 ends, let ad 1 finish hidden and muted, swap surfaces on ad 2's `playing`.
- A4. Keeps `complete` of ad 1 at its real end and allows one ad sound at a time.
- A5. Recommends checking with a phone video, frame by frame, since screenshots and logs do not show a sub-second flash.

## S4. Tracking pixels never arrive

> I use `@dailymotion/vast-client` in my React Native for Vega app. Ads play, but my ad server sees no impression or quartile requests. The same code works in a browser.

- A1. Says Vega has `window` but no `Image` constructor, and browser-style pixel code uses `new Image().src`.
- A2. Proposes an `Image` shim that sends a `GET` with `fetch` (installed before VAST code runs), or sending pixels directly.
- A3. Mentions that Vega has no `DOMParser` either, and a pure-JS XML parser is needed (if not already solved).
- A4. Says to verify with the server's pixel log, not the device log, because the system log drops app lines above ~300 lines/s.
- A5. Mentions checking that impression is sent on the ad's first frame, not for a hidden prebuffered player.

## S5. Black screen with an http ad

> On Fire TV Stick (Vega OS) my VAST loads, but the ad is a black screen and then the content is black too. The MediaFile is `http://cdn.adserver.example/ad.mp4`. The JS error has no message.

- A1. Says w3cmedia refuses `http://` media; the system log shows `Invalid or insecure URI scheme`.
- A2. Says `fetch` to the same host works, so the VAST loads while the media fails.
- A3. Fix: HTTPS media; for development, `[network-traffic-policy.cleartext]` `allowed-domains` in `manifest.toml`; keep it out of release.
- A4. Says the failed ad must send an error pixel (VAST 400-range code) and the content must resume.
- A5. Points to `loggingctl` on the device to read the real cause.

## S6. The ad is cut off after the viewer talks to Alexa

> Our Vega ad player has a 10 s stall watchdog. When the viewer asks Alexa something during an ad, the ad often ends with VAST error 405. There is no `pause` or `waiting` event. What is happening?

- A1. Explains that during an Alexa request the video stops advancing with no media event (measured 6–13 s).
- A2. Proposes two timeouts: a short one after `waiting` (real buffering) and a long one (~30 s) for a silent stop.
- A3. Notes that a voice pause also sends no `pause` event, so pause-based logic should listen to the media controls handler.
- A4. Says "Alexa, next/skip" was not delivered during ads, so voice skip should not be offered.
- A5. Lists the spoken Alexa test as a check for a person.

## S7. Prove Home and Back during an ad on a real stick

> Write a test plan to prove on a Fire TV Stick (Vega) that pressing Home or Back during a pre-roll behaves correctly and sends the right pixels. Nobody can talk to the TV during the run.

- A1. Uses `inputd-cli button_press` for keys, and `KEY_HOMEPAGE` (not `KEY_HOME`) or `vlcm launch-app` of the launcher for Home.
- A2. Judges ads by the ad server's pixel log: no `midpoint`/`complete` after the cut; no ad audio on the launcher.
- A3. Uses `gwsi-tool-screenshooter` screenshots, and warns that with the TV off it can hang or write a 0-byte file.
- A4. Checks `vlcm crash-history` after the runs and repeats the run on cold launches.
- A5. Says the Vega Virtual Device is not enough (no Fire TV launcher, limited `inputd-cli`, not for performance).
