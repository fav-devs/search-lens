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

**A build that works on its own.** Run `uv run lens bundle` on the PC before `eas build` and the catalogue goes inside
the app (`app/assets/searchlens.pack`, about 55 MB). It is unpacked the first time the app opens: no PC, no QR code.
Without it the app builds as before and gets its index over Wi-Fi. Either way the model (388 MB) and, for room scan,
its two models (193 MB) download from Hugging Face the first time they're needed, and product pictures load from
ikea.com.

## First launch

Until the model and an index are both in place, the app opens on **Setup**:

1. **Model.** Downloads `embeddinggemma-2-text-vision-440m.litertlm` (388 MB) from Hugging Face, keeping the screen
   awake. Then it loads, trying the GPU first; Setup shows where it ended up: *GPU*, *GPU + CPU vision* or *CPU*.
2. **Products.** A build with the catalogue inside unpacks it here by itself. Otherwise run `uv run lens` or
   `uv run lens serve` on the PC, tap **Scan the PC's code** and point the phone at the terminal, or type the address it
   prints. The phone fetches `manifest.json`, `vectors.bin` and the 64 detail files. The previous index stays in place
   until the new one has arrived whole. An index imported from the PC is kept even when an app update brings a
   built-in one.
3. **Check** (optional, needs internet). Embeds 6 random catalogue pictures on the phone, the same files the PC
   embedded, and compares them with the index. *Phone and PC agree* means an average similarity above 0.95; each
   picture should also come back as its own best match. Below 0.85 something differs between the two sides.

Setup stays available afterwards as the **You** tab, with a **Product links** switch: United States (the dataset's
links) or Canada (ikea.com/ca).

## Screens

```
Tabs (floating bar): Home · Search · Scan · Basket · You
  Home      "Hej!", the Snap & find card, Recently found, Saved, a few products to try
  Search    search by description, Products (biggest categories) / Recent searches
  Basket    what's been added, with quantities, a total and Share list
  You       Setup

Scan  →  Scan intro (first time only)  →  Camera, Product mode  →  Best matches  →  Product page
                                          Camera, Room mode     →  Room          →  Product page
Search text  →  results  →  Product page
Category tile or row  →  category list  →  Product page
Product page  →  Similar products  →  results  →  Product page
```

| Screen | File | Notes |
| --- | --- | --- |
| Home | `src/screens/HomeScreen.tsx` | Recently found and Saved last until the app closes. |
| Search | `src/screens/SearchScreen.tsx` | Typed searches embed the text with the manifest's `queryPrefix`. |
| Scan intro | `src/screens/ScanIntroScreen.tsx` | Shown until *Continue* is tapped once. |
| Camera | `src/screens/CameraScreen.tsx` | **Product**: the photo is cropped to the square guide (`src/photo.ts`), resized to 448 px and embedded. **Room**: the whole photo goes to the room scan ([room-scan.md](room-scan.md)); the first time, it offers to download its models. Results replace the camera, so Back goes to where the scan started. |
| Room | `src/screens/RoomScreen.tsx` | The photo with each found product's outline in colour and a numbered dot. Tap a dot to jump to its row, or a product in the photo to open it. Each row: the cutout, the best match with its score, add to / remove from basket, and other matches. |
| Results, categories | `src/screens/ResultsScreen.tsx` | Two-column product grid with the match score. Products sharing a picture share its score. |
| Product page | `src/screens/ProductSheet.tsx` | Name, price, article number, Product details, Materials & care, Similar products, category path, Product ID, quantity and **Add to basket**, **Open in IKEA**. |
| Basket | `src/screens/BasketScreen.tsx` | IKEA-style list with quantity steppers and the total. **Share list** sends names, article numbers, quantities and prices as text; the app can't add to IKEA's own cart. |
| Setup | `src/screens/SetupScreen.tsx` | Model, index (built-in or from the PC), Check, Product links. |

Navigation is a tab plus a stack of screens in `src/App.tsx`; the product page is a modal. Android's Back closes the
top screen, then returns to Home, then leaves the app.

**Open in IKEA** calls `Linking.openURL` with the product's ikea.com address. IKEA's app is registered for those links
on both platforms, so the phone opens it when it's installed and the browser when it isn't.

## On the phone

Everything lives in the app's documents folder:

```
model/embeddinggemma-2-text-vision-440m.litertlm   the model (a .part file while downloading)
scene-models/                                       the room scan's OWL-ViT and EdgeTAM models
index/manifest.json, index/vectors.bin, index/details/NN.json
index/source.json                                   { "source": "pc" | "bundle", "created" }
index/incoming/                                     an import or unpack in progress
settings.json                                       { "country": "us" | "ca" }
basket.json                                         { "<product id>": quantity }
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
| `createOnnxSession(path)` / `runOnnx(id, inputs, outputs)` / `onnxRelease(id)` | Any ONNX model on ONNX Runtime 1.24.3, for the room scan. Values travel as float32 in one ArrayBuffer each way; an input the model declares as int32 or int64 is converted natively. |

Android: `android/src/main/java/lens/gemma/GemmaEmbedModule.kt` and `OnnxRunner.kt`. iOS: `ios/GemmaEmbedModule.swift`
(Expo binding), `ios/GemmaEngine.swift` (LiteRT-LM, kept separate so only its names are in scope) and
`ios/LensOnnx.mm` + `LensOnnxCore.hpp` (ONNX Runtime in C++). The ONNX code comes from the Sondr app's model lab.
Keep the LiteRT-LM and ONNX Runtime versions the same in `android/build.gradle` and `ios/GemmaEmbed.podspec`.

The two platforms run ONNX the same way: sessions by id, integer inputs converted to the type the model declares,
outputs packed once into the buffer JavaScript gets. On iOS the ONNX functions have a dispatch queue of their own, so a
scan doesn't hold up other modules' calls on Expo's shared one.

### What has been checked

Nothing has been built with Xcode or Gradle or run on a phone yet. Short of that:

| Code | Checked by |
| --- | --- |
| `OnnxRunner.kt` | Running it on the JVM with ONNX Runtime 1.24.3 on the real OWL-ViT and EdgeTAM models: the same values as ONNX Runtime 1.24.3 from Node. |
| `LensOnnx.mm` + `LensOnnxCore.hpp` | Building them with clang and GNUstep on Linux and calling them the way `GemmaEmbedModule.swift` does, on the same models: OWL-ViT's output identical to Node's, EdgeTAM's mask within 0.00001 with every pixel the same. Missing or broken model files, input data of the wrong length, unknown input or output names and released sessions come back as errors, not crashes. The C++ part also runs clean under AddressSanitizer and UBSan. |
| `GemmaEmbedModule.swift` | Type-checking it with Swift 6.2, in Swift 5 and 6 modes, against a stand-in for ExpoModulesCore with SDK 58's signatures, with `LensOnnx.h` read by Swift's own Objective-C importer. |
| `GemmaEngine.swift` | Type-checking it against LiteRT-LM 0.18.1's Swift sources and the C headers from that release. |
| `GemmaEmbedModule.kt` | Compiling it against the real LiteRT-LM classes and stand-ins for Expo's Kotlin API. |

GNUstep's older Objective-C runtime needed two changes that Apple's doesn't: the result object's C++ field declared in
its interface, and a shim so C++ exceptions reach the wrapper's `catch`. The tests ran on a copy with those changes.
Expect the first Xcode build to turn up something these checks can't, such as CocoaPods or Swift Package Manager
settings.

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

- **ONNX Runtime.** Android uses `onnxruntime-android`, iOS the `onnxruntime-c` pod (the C/C++ API; CocoaPods won't
  let a Swift pod depend on `onnxruntime-objc`), both 1.24.3. `onnxruntime-react-native` isn't used: it reaches the
  JavaScript runtime through the old architecture's bridge, which React Native 0.88 no longer has.
- **The built-in index.** `metro.config.js` resolves `searchlens-bundled-index` to `assets/searchlens.pack` as an asset
  when the file exists, and to `src/no-bundled-index.js` (null) when it doesn't. `.easignore` at the repository root
  replaces `.gitignore` for EAS uploads so the pack, which git ignores, still reaches the build.

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
| Room scan: "No ONNX session" or a crash loading the models | Check `onnxruntime-android` / `onnxruntime-c` made it into the build (`android/build.gradle`, `GemmaEmbed.podspec`). Delete `scene-models/` (the app's data) to download the models again. |
| Room scan finds nothing that's clearly there | It only keeps things that match the catalogue well (`MIN_MATCH` in `src/scene/room.ts`) and that the detector was told to look for (`src/scene/vocabulary.ts`). Try `tools/scene-check` on the same photo to see what it found and skipped. |
| The app didn't pick up the built-in catalogue | It's only installed when there's no index yet or the current one came from an older built-in one. An index imported from the PC is kept. |
| Open in IKEA opens the browser, not the app | The IKEA app isn't installed, or its link handling is off (Android: Settings → Apps → IKEA → Open by default). |
