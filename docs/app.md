# The app

`app/` is an Expo SDK 58 / React Native 0.88 app for Android and iOS (17 or later). It runs EmbeddingGemma 2 on the
phone through a small native module, so it needs its own build: **Expo Go can't run it**.

## Build and run

```sh
cd app
npm install
npx eas-cli build --profile development --platform android   # or --platform ios
npx expo start --dev-client                                    # serve the JavaScript to the development build
```

| EAS profile | What you get |
| --- | --- |
| `development` | A development build (Android: an APK) that loads the JavaScript from `expo start`. For working on the app. |
| `preview` | A standalone build with the JavaScript inside. Install it and it runs on its own, without a PC: use this for demos. |

The first `eas build` asks to create an EAS project and, on iOS, for an Apple developer account to sign with. The
bundle id and Android package are `me.favdevs.searchlens`.

To build locally instead, `npx expo run:android` or `npx expo run:ios` (needs Android Studio or Xcode).

## First launch

Until the model and an index are both in place, the app opens on **Setup**:

1. **Model.** Downloads `embeddinggemma-2-text-vision-440m.litertlm` (388 MB) from Hugging Face, keeping the screen
   awake. Then it loads, trying the GPU first; Setup shows where it ended up: *GPU*, *GPU + CPU vision* or *CPU*.
2. **Products from the PC.** Run `uv run lens` or `uv run lens serve` on the PC, tap **Scan the PC's code** and point
   the phone at the terminal, or type the address it prints. The phone fetches `manifest.json`, `vectors.bin` and
   the 64 detail files. The previous index stays in place until the new one has arrived whole.
3. **Check** (optional, needs internet). Embeds 6 random catalogue pictures on the phone, the same files the PC
   embedded, and compares them with the index. *Phone and PC agree* means an average similarity above 0.95; each
   picture should also come back as its own best match. Below 0.85 something differs between the two sides.

Setup stays available afterwards as the **You** tab, with a **Product links** switch: United States (the dataset's
links) or Canada (ikea.com/ca).

## Screens

```
Tabs (floating bar): Home · Search · Scan · You
  Home      "Hej!", the Snap & find card, Recently found, Saved, a few products to try
  Search    search by description, Products (biggest categories) / Recent searches
  You       Setup

Scan  →  Scan intro (first time only)  →  Camera  →  Best matches  →  Product page
Search text  →  results  →  Product page
Category tile or row  →  category list  →  Product page
Product page  →  Similar products  →  results  →  Product page
```

| Screen | File | Notes |
| --- | --- | --- |
| Home | `src/screens/HomeScreen.tsx` | Recently found and Saved last until the app closes. |
| Search | `src/screens/SearchScreen.tsx` | Typed searches embed the text with the manifest's `queryPrefix`. |
| Scan intro | `src/screens/ScanIntroScreen.tsx` | Shown until *Continue* is tapped once. |
| Camera | `src/screens/CameraScreen.tsx` | The photo is cropped to the square guide (`src/photo.ts`), resized to 448 px and embedded. Its results replace the camera, so Back goes to where the scan started. |
| Results, categories | `src/screens/ResultsScreen.tsx` | Two-column product grid with the match score. Products sharing a picture share its score. |
| Product page | `src/screens/ProductSheet.tsx` | Name, price, article number, Product details, Materials & care, Similar products, category path, Product ID, **Open in IKEA**. |
| Setup | `src/screens/SetupScreen.tsx` | Model, index import, Check, Product links. |

Navigation is a tab plus a stack of screens in `src/App.tsx`; the product page is a modal. Android's Back closes the
top screen, then returns to Home, then leaves the app.

**Open in IKEA** calls `Linking.openURL` with the product's ikea.com address. IKEA's app is registered for those links
on both platforms, so the phone opens it when it's installed and the browser when it isn't.

## On the phone

Everything lives in the app's documents folder:

```
model/embeddinggemma-2-text-vision-440m.litertlm   the model (a .part file while downloading)
index/manifest.json, index/vectors.bin, index/details/NN.json
index/incoming/                                     an import in progress
settings.json                                       { "country": "us" | "ca" }
scan-intro-seen                                     present once the scan intro has been dismissed
```

The index (14 MB of vectors plus the product list) is read into memory at launch. Detail files are read when a product
page needs them and kept for the session.

## The native module

`modules/gemma-embed/` is a local Expo module wrapping Google's LiteRT-LM 0.18.1:

| Function | Does |
| --- | --- |
| `load(modelPath, gpu, visionTokens)` | Loads the model unless it already is with the same settings. With `gpu`, tries the GPU for everything, then the GPU with the vision encoder on the CPU, then the CPU. Returns `{ backend, ms }`. |
| `embedImage(path, outputSize)` | A JPEG or PNG file → unit-length vector of `outputSize` numbers, at the loaded vision budget. |
| `embedText(text, outputSize)` | Text (prefix already added) → unit-length vector. |
| `close()` | Frees the model. |

Android: `android/src/main/java/lens/gemma/GemmaEmbedModule.kt`. iOS: `ios/GemmaEmbedModule.swift` (Expo binding)
and `ios/GemmaEngine.swift` (LiteRT-LM, kept separate so only its names are in scope). Keep the LiteRT-LM version the
same in `android/build.gradle` and `ios/GemmaEmbed.podspec`.

## Build plumbing

LiteRT-LM needs a few things an Expo module can't declare on its own:

- **Kotlin version (Android).** LiteRT-LM 0.18.1 is built with Kotlin 2.4 and brings `kotlin-reflect` 2.4, so the
  whole app compiles against a Kotlin 2.4 standard library. React Native 0.88's Kotlin 2.2 can't read that.
  `app.json` sets `android.kotlinVersion` to `2.3.21` through `expo-build-properties` (Kotlin reads one version ahead).
- **GPU libraries (Android).** `plugins/with-litert.js` adds `<uses-native-library>` for `libOpenCL.so` and
  `libvndksupport.so`. Without them, Android 12+ hides the GPU driver from the app and the model runs on the CPU.
- **Embedding the framework (iOS).** React Native attaches LiteRT-LM's Swift package to the pod but doesn't copy its
  dynamic `CLiteRTLM.framework` into the app. The same plugin adds an *Embed LiteRT-LM Framework* build phase that runs
  `scripts/embed-litert-framework.sh` and signs it.
- **Git LFS (iOS on EAS).** `scripts/prepare-ios-litert-lfs.mjs` runs after `npm install` on EAS and tells Git not to
  fetch LiteRT-LM's large prebuilt binaries, which the Swift package doesn't use.
- **Plain HTTP on the LAN.** The index comes from `http://<PC>:8765/`. Android allows it with
  `usesCleartextTraffic`; iOS with `NSAllowsLocalNetworking` and `NSAllowsArbitraryLoads`, and asks for local network
  access the first time.

The plugin and the iOS script come from the Sondr app (fav-devs/ai-cut), whose model lab runs the same LiteRT-LM.

## Troubleshooting

The app has not run on a device yet, so these are the likeliest first-build problems:

| Problem | Fix |
| --- | --- |
| Android build: "module was compiled with an incompatible version of Kotlin … metadata 2.4.0" | Set `android.kotlinVersion` in `app.json` to `2.4.21`. |
| Android build fails elsewhere after raising Kotlin | Another library may not build with the newer Kotlin; the error names it. Try `2.3.21` and `2.4.21`. |
| iOS: crash at launch, "Library not loaded: CLiteRTLM.framework" | The embed build phase didn't run. `npx expo prebuild --clean` and check the *Embed LiteRT-LM Framework* phase in the app target. |
| Setup says *CPU* on a phone with a GPU | The GPU refused the model. It still works, more slowly. On Android, check the manifest has the `uses-native-library` lines. |
| "Load the model first" | The model failed to load; Setup shows why. Delete the app's data to download it again. |
| Can't import the index | Same Wi-Fi as the PC, `lens serve` running, and iOS local network permission on (Settings → Search Lens). Open `http://<ip>:8765/manifest.json` in the phone's browser to test. |
| Check is below 0.95 | Was the index built by this version of the PC tool (140 vision tokens)? Re-run `uv run lens` and import again. If it's still low, the phone's runtime prepares pictures differently from the PC, so tell whoever maintains this. |
| Product page: "This index has no product details" | The index was built before details existed. Re-run `uv run lens` on the PC and import again. |
| Thumbnails don't load | They come from ikea.com, so the phone needs internet. Search itself works offline. |
| Open in IKEA opens the browser, not the app | The IKEA app isn't installed, or its link handling is off (Android: Settings → Apps → IKEA → Open by default). |
