# Screenshots

All screenshots are captured from the running app — iOS simulator
(iPhone 17 Pro) or Android emulator (Medium_Phone, API 36). None is a mockup.

| File | Shows | Platform |
|---|---|---|
| `01-breed-list-light.png` | Breed list, light mode — 283 breeds, sticky section header, size/hypoallergenic badges, freshness indicator | iOS |
| `02-breed-list-dark.png` | Breed list, dark mode | iOS |
| `03-filters-applied.png` | Filter sheet with Sporting + Large active; live count "Show 16 breeds" | Android |
| `04-filtered-results.png` | The filtered list — every row is Sporting AND Large | Android |
| `05-details-traits.png` | Traits tab: ten 1-5 segmented scales + `exercise_minutes` as its own duration bar + temperament tags | Android |
| `06-details-overview.png` | Overview tab: description, group, lifespan, origin, male/female weight and height, coat | Android |
| `07-breed-list-android.png` | Breed list on Android — same source, no platform branching | Android |
| `08-gallery-attribution.png` | Gallery with author / licence / source attribution as tappable links | iOS |

## Reproducing these

### iOS

`simctl` has no tap command, so iOS screenshots are taken by navigating the
simulator by hand and capturing:

```bash
xcrun simctl io "iPhone 17 Pro" screenshot out.png
xcrun simctl ui "iPhone 17 Pro" appearance dark   # or light
```

### Android

`adb` can drive the UI directly, which is how the filter and detail shots were
captured:

```bash
adb shell input tap <x> <y>          # coordinates are in device pixels
adb shell input swipe <x1> <y1> <x2> <y2> <ms>
adb exec-out screencap -p > out.png
```

## Offline banner

The offline state needs a **release** build. A debug build loads its JS bundle
from Metro over the network, so disabling the network stops the app booting at
all and you get React Native's "Unable to load script" screen rather than the
app's own offline UI.

```bash
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk

# Launch once with network to populate the cache, then:
adb shell svc wifi disable
adb shell svc data disable
adb shell am force-stop ai.tripare.dogbreeds
adb shell am start -n ai.tripare.dogbreeds/.MainActivity
adb exec-out screencap -p > offline.png

# Restore:
adb shell svc wifi enable && adb shell svc data enable
```

Expected: the full cached list renders, with the banner reading
**"Offline — showing cached breeds · Last synced N minutes ago"**. Re-enabling
the network should clear the banner and trigger a background sync.
