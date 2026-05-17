# TranslateTube Voice Translation Lite

This is a stripped-down unpacked Chrome extension build that keeps the existing
voice-translation runtime bundles intact.

Kept:

- YouTube content script
- Voice/caption bridge scripts
- Background service worker for auth/service messages
- Fonts and runtime image assets used by the content script
- Extension icons

Removed:

- Popup app
- Delta flyer tab
- Chrome Web Store metadata
- Locale packs
- Original update URL

Load this folder with Chrome's "Load unpacked":

`stripped-voice-translation`
