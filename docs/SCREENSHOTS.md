# Screenshots

Three screenshots are captured and committed. Three require UI interaction that
the simulator CLI cannot drive, so the exact steps are recorded here rather than
faked.

## Captured

| File | Shows |
|---|---|
| `assets/screenshots/01-breed-list-light.png` | Breed list, light mode — 283 breeds, sticky section header, size/hypoallergenic badges, freshness indicator |
| `assets/screenshots/02-breed-list-dark.png` | Breed list, dark mode |
| `assets/screenshots/05-gallery-attribution.png` | Gallery tab with author / licence / source attribution |

## To capture

Run the app (`npm run ios`), then for each:

### `03-filters-applied.png`

1. Tap **Filters**.
2. Select **Sporting**, size **Large**, and trait **Good with children** with a
   minimum of **4**.
3. Screenshot the open sheet (shows the composed multi-select state and the
   live result count on the Apply button).
4. Tap Apply and screenshot the filtered list if a second image is wanted.

### `04-details-traits.png`

1. Open any breed with full data (e.g. **Labrador Retriever**).
2. Switch to the **Traits** tab.
3. Screenshot — shows the 10 segmented 1-5 scales, the separate
   `exercise_minutes` duration bar, and temperament tags.

### `06-offline-banner.png`

On the iOS simulator, disable the host machine's wifi, or use the Network Link
Conditioner (Xcode → Open Developer Tool → More Developer Tools → Additional
Tools → Network Link Conditioner) set to **100% Loss**.

On Android:

```bash
adb shell svc wifi disable && adb shell svc data disable
```

Then relaunch the app and screenshot the list. Expected banner:
**"Offline — showing cached breeds · Last synced N minutes ago"**, with the
full list still scrollable underneath.

Re-enable connectivity and the banner should clear and a background sync should
fire automatically.

## Capturing from the CLI

```bash
# iOS
xcrun simctl io "iPhone 17 Pro" screenshot assets/screenshots/03-filters-applied.png

# Appearance toggle
xcrun simctl ui "iPhone 17 Pro" appearance dark

# Android
adb exec-out screencap -p > assets/screenshots/03-filters-applied.png
```
