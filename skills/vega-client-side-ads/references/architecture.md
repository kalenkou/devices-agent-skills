# Architecture: content player plus ad players

How to place players and surfaces for client-side ads on Vega, and what happens at each switch. *Measured* = Fire TV Stick 4K Select, Vega OS 2.0, Vega SDK 0.24, `@amazon-devices/react-native-w3cmedia` ~2.1, October 2026.

## What Amazon's guide gives you

Amazon's [Client-Side Ad Insertion overview](https://developer.amazon.com/docs/vega/0.24/client-side-ad-insertion-overview-vega.html) describes two approaches:

- **JS approach** (`implement-csai-js-vega`): a main `VideoPlayer` and an ad `VideoPlayer` in the React Native UI layer. This is what most apps use, and what this skill covers.
- **Headless approach** (`implement-csai-headless-vega`): player sessions in a service, UI clients over JSI. The same rules apply to ads; only the place of the code differs.

The guide offers a single shared `KeplerVideoSurfaceView` or **dual surfaces**, and recommends dual surfaces to avoid a black flash at the switch. It also describes prebuffering the ad player (`autoplay` off, wait until ready, play at the break). It leaves the ad logic to the app: when breaks happen, ad requests, VAST/VMAP, tracking, pods, skip and errors.

The guide does not mention media controls. Without them the remote and Alexa do not reach the ad player (see [media-controls.md](media-controls.md)).

## Layout

```
<View style={{ flex: 1 }}>
  <KeplerVideoSurfaceView/>   content surface      zIndex 0
  <KeplerVideoSurfaceView/>   ad surface A         zIndex 1  (hidden until its first frame)
  <KeplerVideoSurfaceView/>   ad surface B         zIndex 1  (for the next ad in a pod)
  <AdOverlay/>                "Ad 1 of 3 · 0:12", Skip button
</View>
```

- Each surface hands its handle to one player through `onSurfaceViewCreated`; the player draws on it with `setSurfaceHandle(handle)` and lets go with `clearSurfaceHandle(handle)`.
- **Create the ad surfaces after the content surface.** Video surfaces stack in the order they are created; `zIndex` does not reorder them. If the screen mounts its content surface late (for example after `loadedmetadata`), mount the ad surfaces only after the content surface's `onSurfaceViewCreated`. *Measured:* ad surfaces created first → the ad played with all quartile pixels but the screen was black (2 of 2 runs); created after → visible (5 of 5). (FL-19)
- Keep the content surface mounted during the break. The paused content frame stays under the ad.
- Bring the active ad surface on top only when that ad fires `playing`. Until then the viewer sees the content's last frame, not black.
- Hide the app's own player controls and buffering spinner while an ad is on screen.
- **Show and hide ad surfaces by position, not by mounting.** Since `zIndex` does not reorder video surfaces, keep both ad surfaces mounted and move the hidden one off screen (for example `left: -1.2 × screen width`). Unmounting destroys the native surface and costs a black frame at the next ad. *Measured* with this method: pods of 2–3 ads with no movie frame between them.
- Set `scalingmode="fit"` on ad surfaces. The `KeplerVideoSurfaceView` default is `'strech'` (spelled so in the typings), which can distort an ad with another aspect ratio.

## Sequence of one break

1. **Before the break** (*measured* default: 15 s before a mid-roll): request the VMAP/VAST, parse, pick a media file, create the ad player, `autoplay = false`, set `src`, wait for `canplay`. *Measured:* a pod of 3 ads was ready 1.6 s after the request started.
2. **Content reaches the break time:** `pause()` the content, remember `currentTime`.
3. **Play the ad:** `play()` on the ad player. On its `playing` event: bring its surface on top, send the impression, then move media controls focus to it (deferred, see [pitfalls.md](pitfalls.md#impression-late-on-the-first-launch)). *Measured:* switch content → ad in 56–151 ms, no dark frame on a phone video at ~30 fps.
4. **Next ad in a pod:** prebuffer it on the second ad player while the current ad plays. Start it ~500 ms before the current ad ends; let the current ad finish behind it, muted. *Measured:* the next ad's first frame came 64–85 ms before the previous ad's `ended`, and `complete` was still sent at the real end.
5. **End of the break:** hide the ad surfaces, release the ad players (`deinitialize`), give media controls focus back to the content player, `play()` the content. *Measured:* ad player released in 220–378 ms.

Why step 4 matters: a w3cmedia surface does **not** keep the last frame after `ended`. Waiting for `ended` and then calling `play()` on a prebuffered player left the surface empty for ~0.4–0.6 s (`play()` → `playing` took ~370–450 ms), and the paused movie showed through.

## Resume at the content position

- *Measured:* the content plays on for 0.1–0.2 s after `pause()`. After the break, seek back only if the content moved more than ~0.25 s from the remembered position. A seek re-buffers, so an unneeded one costs time.
- Never seek a content player that has never played (for example after a pre-roll). In our runs, a seek to 0 right after every pre-roll came before one rare stop at 0:00; the link is likely, not proven.
- Start the content only after the pre-roll ends, or at once if there is no pre-roll. Keep content `autoplay` off.
- Mid-roll after a seek: if the viewer seeks over a break, play that break (the last one passed) before the seek target. Do not give a free pass.
- *Measured* with Shaka: Shaka sends `timeupdate` while the pre-roll loads. A scheduler that reads it as "content passed the pre-roll time" drops the pre-roll. Track content progress only after the content has started.

## Single ad player fallback

Amazon's guide recommends one ad player on devices with limited memory or decoders, and warns that the switch may then not be seamless. Plan for it:

- If creating or preparing the second ad player fails, continue with one. The gap between pod ads is then longer. *Measured* with one ad player and a new `src` per ad: ~1 s from `complete` to the next impression.
- Amazon also describes saving the content position and recreating the content player during the last ad, to make room for two ad players.

## DRM and memory

- **One secure decoder.** Amazon's [media player requirements](https://developer.amazon.com/docs/vega/0.24/media-player-requirements.html) say the first Vega devices support only one secure video decoder. If the content is DRM-protected, use clear (non-DRM) ad creatives.
- **1 GB devices.** Current Vega sticks have 1 GB RAM. *Measured:* 9 breaks × 3 ads in 11 min, PSS peak 91 MB, then flat at 65–68 MB (Amazon's KPI: < 400 MiB). Release ad players after every break; memory should be flat from break to break.
- *Measured* in Amazon's video sample (not related to ads): after 4.6 s in the background the system's Low Resource Killer ended the app. Do not count on the app still running after Home.

## Lifecycle: Back and Home

- **Home** (app goes to the background): stop ad audio at once and release the ad players. *Measured:* audio stopped and the media element destroyed in the first 0.1 s after `BACKGROUND`. On return, continue the content; do not show the interrupted break again. Send no more pixels for an ad nobody watched.
- **Back** during an ad: decide with the user. Either Back goes to the app as during the movie (an ad without Skip cannot be skipped with Back), or Back ends the break and the movie plays on. Amazon test criterion 4.5: no force close, no loop. Never start an ad because the user tries to leave the app (Appstore advertising policy).
- Never send the impression for an ad that is buffered on a hidden player. The Appstore policy lists "rendering ads that are not visible to the user" as ad fraud.
- One ad sound at a time (test criterion 2.18, no audio overlap): mute the finishing ad when the next one starts early.

## Pause ads (optional)

An IAB pause ad is a still image (VAST `<NonLinear>`) shown when the viewer pauses the content. On Vega, "Alexa, pause" freezes the picture without a `pause` event (see [pitfalls.md](pitfalls.md#voice-pause-sends-no-pause-event)), so take the pause from the content's media controls handler, not only from the player event. Never show a pause ad when a break pauses the content. Back should close it.
