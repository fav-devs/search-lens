# How Search Lens works

Search Lens finds an IKEA product from a photo. A PC with an NVIDIA GPU turns the whole catalogue into vectors once;
the phone turns each photo into a vector with the same model and looks for the closest ones. Nothing leaves the
phone when it searches.

```
                      PC (pc/, Python)                                    Phone (app/, Expo)
 ┌───────────────────────────────────────────────┐        ┌────────────────────────────────────────────────┐
 │ lens download                                 │        │ Setup                                           │
 │   Hugging Face: products-us.jsonl (~30,500)   │        │   EmbeddingGemma 2 text+vision 440M (388 MB)    │
 │   IKEA image server: one 400 px shot each     │        │   from Hugging Face, once                       │
 │                                               │        │                                                 │
 │ lens index                                    │  Wi-Fi │   index ← scan the PC's QR code                 │
 │   google/embeddinggemma-2 on the GPU          │ ─────► │                                                 │
 │   27,959 pictures → 512-number vectors        │        │ Scan                                            │
 │   manifest.json · vectors.bin · details/      │        │   photo → crop to the square → 448 px JPEG      │
 │                                               │        │   → LiteRT-LM → 512 numbers → closest pictures  │
 │ lens serve                                    │        │   → products → product page → IKEA app / web    │
 │   HTTP on the LAN + QR code in the terminal   │        │                                                 │
 └───────────────────────────────────────────────┘        └────────────────────────────────────────────────┘
```

## The model

[EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2) (Google, Apache-2.0) maps text, pictures, video and
audio into one 768-number space. Two pictures of the same thing land close together, and so do a picture and a
description of it. Search Lens uses two builds of it:

| | PC | Phone |
| --- | --- | --- |
| Build | `google/embeddinggemma-2` (PyTorch, bf16 on the GPU) | `litert-community/embeddinggemma-2-text-vision-440m-litert-lm` |
| Runtime | sentence-transformers / transformers 5 | Google's LiteRT-LM 0.18.1 (Kotlin and Swift) |
| Parts loaded | text + vision (the audio encoder is switched off) | text + vision (the bundle has no audio) |
| Weights | full precision | int4 text, int8 vision (quantisation-aware trained) |

They are the same network, so their vectors can be compared directly. The phone's quantised weights move vectors a
little, which is what the in-app **Check** measures.

## Keeping the phone and the PC in step

A picture's vector depends on more than the weights. These have to match on both sides, or matches quietly get worse
without anything failing:

- **Vision tokens per image: 140.** The PC processor defaults to 280 tokens per picture; phones run 70 or 140. The
  same picture at 280 and at 140 agrees to only about 0.97, which is the size of the gap between a right and a wrong
  match. The PC sets `max_soft_tokens = 140`, writes `visionTokens: 140` into the manifest, and the app passes that to
  LiteRT-LM both when loading the model and with every photo.
- **Dimensions: 512.** The model is trained so the first 128, 256 or 512 numbers are a usable smaller vector
  (Matryoshka). The PC keeps the first 512 and makes them unit length again; the phone asks LiteRT-LM for 512, which
  does the same.
- **Text prefix.** Typed searches are sent as `task: search result | query: <text>`, the model card's retrieval
  prompt; pictures get no prefix. The prefix travels in the manifest (`queryPrefix`).
- **Precision.** Never fp16 on the PC: the model's activations overflow it and the vectors come out NaN or quietly
  wrong. bf16 on GPUs that have it (RTX 30 and newer), fp32 otherwise.

## Search

The phone holds every picture's vector in memory as int8 (about 14 MB for 27,959 pictures) and compares the photo's
vector with all of them: a dot product per picture, times that picture's scale, keeping the best 12. There is no
vector database: the scan takes 34 ms in Node, and should take a few hundred milliseconds on the phone's Hermes engine, which has no JIT (not yet measured). Products that share a picture (a bed frame
in Queen and King) share its score and are listed together.

Photos are cropped to the square guide on screen before they are embedded, so the model sees the product centred on
its own, like the catalogue shots. Results load their thumbnails from IKEA's image server; the phone stores no
product pictures.

**Similar products** skips the model entirely: it searches with the picture's own stored vector.

## Room scan

A second camera mode finds several products in one photo. OWL-ViT (an open-vocabulary detector, told to look for
chairs, lamps, shelves, cushions and so on) draws boxes; EdgeTAM turns each box into an outline; each object is cut
out onto white like a catalogue shot and searched exactly like a single-product photo; objects that match nothing
well are dropped. Both extra models run on ONNX Runtime through the app's native module, and the steps in between
are plain TypeScript that also runs on the PC (`tools/scene-check`). Details and what was tried first in
[room-scan.md](room-scan.md).

## Product pages and IKEA links

The index carries each product's description, good-to-know notes, materials, care instructions and category path,
split into 64 files so a product page parses about 0.5 MB, not 31 MB. See [index-format.md](index-format.md).

**Open in IKEA** opens the product's ikea.com address. IKEA's app registers `/<country>/<language>/p/*` links on iOS
(apple-app-site-association, `com.ingka.ikea.app`) and Android (assetlinks.json), so the phone hands the link to the
IKEA app when it is installed and to the browser when it isn't. The dataset is the US catalogue; Setup can rewrite
links to ikea.com/ca, where products sold in Canada open their page and the rest land on a category page.

## Data

- **Products:** [jeffreyszhou/ikea-us-products-2025](https://huggingface.co/datasets/jeffreyszhou/ikea-us-products-2025),
  a July 2025 snapshot of ikea.com/us: 30,511 products with title, price, category path, description, materials,
  care and one picture file name each. Licensed for research and non-commercial use; names and pictures are IKEA's.
- **Pictures:** the dataset's file names work on IKEA's image server (`ikea.com/us/en/images/products/<file>?f=xxs`),
  which serves the same product shot at 400–700 px. The PC fetches 400 px (`xxs`), already more than the model looks
  at, instead of the dataset's 3.5 GB of full-size images.
- **Clean-up** done by the PC tool: sizes the scrape mangled (`181/2x161/8"` → `18 1/2x16 1/8"`), the title repeated at
  the start of every description, and the noise crumbs at both ends of the category path.

## Limits

- It is a **lookup aid**, not an oracle: it usually gets the series right, and size or colour variants of one series
  look almost identical, so it shows the top matches for a person to pick from.
- **Prices are US dollars from July 2025.** Products added since then aren't in the catalogue.
- The app has been type-checked and its screens rendered on the web, and the native module compiles against the real
  LiteRT-LM classes, but it has **not yet run on a phone**. The first EAS build is the real test; see
  [app.md](app.md#troubleshooting).
