# Trigger prompts

Given only the skills' `name` and `description`, an agent should load `vega-client-side-ads` for every prompt in the first list and not for any in the second. The second list includes near misses: Vega work that is not about ads, ads on other platforms, and server-side insertion.

## Should trigger

1. Add a pre-roll VAST ad before the movie in my React Native for Vega app.
2. How do I play VMAP mid-rolls on Fire TV with Vega OS and the w3cmedia VideoPlayer?
3. The remote's play/pause button does nothing while the ad plays on my Vega app.
4. Between two ads in a pod I briefly see the movie frame on Fire TV Vega. How do I fix it?
5. vast-client tracking pixels never reach my server from the Fire TV Vega app.
6. My ad shows a black screen on Vega but the VAST loads fine. The MediaFile URL is http://.
7. Implement a skippable ad with a Skip button in a Kepler (Vega) video player.
8. Where do I put a second KeplerVideoSurfaceView for ads, and how do I switch back to the content position?
9. Our ad gets cut off with error 405 when the viewer talks to Alexa on Fire TV Vega.
10. Should I write my own CSAI code for Vega or use a library? We serve our own VAST.
11. What should happen when the user presses Home or Back during a pre-roll on a Vega app?
12. Test that ad quartile pixels fire on a Fire TV Stick without anyone speaking to it.

## Should not trigger

1. Set up D-pad focus with TVFocusGuideView in my React Native tvOS app.
2. Migrate my Vega OS app to a multi-platform React Native monorepo.
3. Add Google IMA client-side ads to my Android TV app with ExoPlayer.
4. Integrate Google IMA DAI server-side ad insertion in my streaming backend.
5. Make "Alexa, pause" work in my native Fire OS (Kotlin) timer app.
6. Play Widevine DRM content with Shaka in my Vega app.
7. Build a banner ad component for my React Native phone app with AdMob.
8. Write a VAST 4 XML file by hand for our ad server's test campaign.
9. Fix the color contrast and font sizes of my Vega app's home screen.
10. Add captions that follow the system caption style in my Vega video player.
