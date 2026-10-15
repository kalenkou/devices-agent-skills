# Media controls: remote and Alexa during ads

On Vega, remote play/pause and "Alexa, pause/play" reach a player through **Vega media controls**. With two players (content and ad), the app must tell the system which one the viewer sees. Every failure here is silent. *Measured* = Fire TV Stick 4K Select, Vega OS 2.0, Vega SDK 0.24, `@amazon-devices/react-native-w3cmedia` ~2.1, keys sent with `inputd-cli button_press KEY_PLAYPAUSE`.

## Both steps, or nothing works

A/B test on the device, one change at a time, counting the media controls commands in the system log:

| Manifest entries | `setMediaControlFocus` on each switch | Result |
| --- | --- | --- |
| no | no | 0 commands delivered |
| no | yes | 0 |
| yes | no | 0 |
| yes | yes | delivered: content pauses/resumes during content, only the ad during the ad; "Alexa, pause" works |

With one step missing there is no error and no warning. The only hint was `isSessionInForeground :0` in the system log. Amazon's CSAI guide does not mention media controls; the W3C media "media control" page does, with the manifest snippet on another page.

## Manifest

Add to the app's `manifest.toml` (replace the component id with yours):

```toml
[[components.interactive]]
id = "com.example.app.main"
# ...
# Lets Vega media controls (remote, Alexa) reach your players.
categories = ["com.amazon.category.main", "com.amazon.category.kepler.media"]

# Without this, media controls commands are not delivered.
[[extras]]
key = "interface.provider"
component-id = "com.example.app.main"

[extras.value.application]
[[extras.value.application.interface]]
interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"
command_options = []
attribute_options = []
features = []
```

Keep the usual w3cmedia services (`com.amazon.media.server`, `com.amazon.media.playersession.service` and the others your video app already lists).

## `setMediaControlFocus` at each switch

- Give focus to the **ad player** when the ad starts, and back to the **content player** when the content resumes. *Measured:* the focus switch took 197–256 ms.
- It needs the component instance. Get it with `useKeplerAppStateManager().getComponentInstance()` from `@amazon-devices/react-native-kepler`. The `useComponentInstance()` hook in the docs sample warns at run time that it is deprecated.
- In the w3cmedia type definitions `setMediaControlFocus` is marked `@hidden`, so generated API docs do not list it. It works.
- If the app has its own media controls handler for the content, pass it again when focus returns to the content player (the second argument), or the app's handler is lost after the first break.
- **Do not call it on the time-critical path of a cold launch.** Called right after `play()`, it held the JS thread for ~1.2–2.4 s; the ad's `playing` event and the impression waited. Call it after the first frame is handled:

```ts
adPlayer.addEventListener('playing', function onFirstFrame() {
  adPlayer.removeEventListener('playing', onFirstFrame);
  showAdSurface();
  sendImpression();
  // Deferred: the first call can block the JS thread on a cold launch.
  setTimeout(() => {
    adPlayer.setMediaControlFocus(componentInstance).catch(logError);
  }, 0);
});
```

*Measured* after this change: 143 ms from native `playing` to the impression on the first launch after install.

## Key routing

*Measured:* the play/pause key **always** reaches JS (`useTVEventHandler`, `eventType: 'playpause'`, down and up), with or without the manifest entries.

| Setup | What happens on play/pause |
| --- | --- |
| Manifest entries + focus on the ad player | Media controls pause the ad (224 ms after key down) **and** the JS handler gets the key. An app that also toggles in JS toggles twice. |
| No manifest entries, app toggles in JS | The legacy player session still pauses a **playing** player, but does not resume a paused one. The app's resume is undone ~450 ms later: play starts and stops. "Alexa, pause/play" does nothing. |

Rule: keep the manifest entries and media controls as the only owner of play/pause. In the app's own key handler (common with spatial navigation libraries), ignore `playpause` while an ad plays:

```ts
useTVEventHandler((event) => {
  if (event.eventType === 'playpause' && adPlaying) {
    return; // media controls already pause and resume the ad
  }
  // normal handling
});
```

During an ad, also ignore seek, fast-forward, rewind and speed commands, from the key handler and from the media controls handler.

## Alexa

- "Alexa, pause" and "Alexa, play" work during ads and content with both steps above.
- **"Alexa, next" and "Alexa, skip" did not reach the app during an ad.** With the default published actions Alexa answered "Next is not supported". With `command_options = ["Next"]` in the manifest, NEXT added to the ad player's published actions and `handleNext` overridden in a `KeplerMediaControlHandler` subclass, Alexa said nothing and `handleNext` was never called (4 runs). There is no public Vega table of Alexa phrases → media controls commands. Offer a Skip button with D-pad focus instead.
- During any Alexa request the video stops advancing with no media event. See [pitfalls.md](pitfalls.md#ad-ends-early-after-a-voice-request).
- *Measured once:* "Alexa, pause/play" did nothing in **any** app on the stick, YouTube included, until the stick was restarted. Check another app before debugging yours.

## The manifest check is not stable

*Measured:* the same build with the same `manifest.toml`, launched 13 times, logged `checkClientManifestForKMC: … has KMC: true` 9 times and `false` 4 times, with no reason. When a media controls test fails, look for this line before changing code, and run the test again.

## Virtual Device keys

The SDK 0.24 Virtual Device keyboard mapping differs from the key list in the docs: the SDK script maps F7 to play/pause (F6 rewind, F8 fast forward, F4 menu); the docs say F4 is play/pause. Use `inputd-cli button_press KEY_PLAYPAUSE` instead of guessing.
