# Search Lens

Take a photo of an IKEA product that has lost its tag, and the phone lists the closest products in the catalogue: name,
size, price and article number. Tap one for its product page (description, good to know, materials and care, category,
article number) and **Open in IKEA**, which opens the IKEA app when it's installed and IKEA.com when it isn't.

Everything runs on-device with **EmbeddingGemma 2**, Google's open multimodal embedding model. Photos and text land
in one vector space, so you can also type "white 4-drawer dresser with knobs".

```
PC (your NVIDIA GPU)                                     Phone (Expo app)
──────────────────────────────────────────               ───────────────────────────────────────────
lens download   ~30,500 products + one 400 px picture     model: EmbeddingGemma 2 text+vision (388 MB,
                each, from IKEA's image server             downloaded once from Hugging Face)
lens index      every picture → a 512-number vector   ─►  index: ~14 MB vectors + product list, over Wi-Fi
lens serve      QR code in the terminal ───────────────►  photo → crop to guide → vector → closest pictures
                                                           → tap → ikea.com product page
```

The phone stores no product pictures: results load thumbnails from IKEA's site. Product text comes with the index, in 64
small files (`details/`), and a product page reads only the one it needs.

**Opening the IKEA app.** IKEA's app claims ikea.com product links (`/<country>/<language>/p/…`) on iOS and Android, so
the app just opens the link and the phone picks the IKEA app if it's there. The dataset is the US catalogue; *Setup →
Product links → Canada* rewrites links to ikea.com/ca. Prices stay US, and products not sold in Canada open a category
page there.

## 1 · PC: build the index

Needs [uv](https://docs.astral.sh/uv/getting-started/installation/) and an NVIDIA GPU with a current driver. A CPU
works too, but takes hours for the full catalogue instead of minutes.

```sh
cd pc
uv sync          # Python, PyTorch with CUDA, transformers, sentence-transformers
uv run lens      # download → index → serve, resuming wherever a previous run stopped
```

`uv run lens` does everything and ends with a QR code for the phone. The steps on their own:

| Command | What it does |
| --- | --- |
| `lens download [--category "Lighting"] [--limit 500]` | Product list from the [IKEA US dataset](https://huggingface.co/datasets/jeffreyszhou/ikea-us-products-2025) (July 2025), plus one picture per product from IKEA's image server at 400 px (~250 MB in total, about 6 min). |
| `lens index [--dims 512] [--batch 16]` | Embeds every picture on the GPU and writes `data/index/` (vectors, product list, product details). Prints which GPU it found. Stopping and running again picks up where it was; pictures already embedded aren't embedded again. |
| `lens search "black desk lamp"` / `lens search photo.jpg` | Tries the index on the PC. |
| `lens serve [--port 8765]` | Shares `data/index/` on the Wi-Fi and prints the QR code. Allow Python through the firewall if Windows asks. |

The first `lens index` downloads `google/embeddinggemma-2` (~1.5 GB) from Hugging Face.

**GPU.** `uv sync` installs PyTorch for CUDA 12.6, which covers RTX 20, 30 and 40 cards. **RTX 50 cards** need CUDA 13:
change `cu126` to `cu130` in `pc/pyproject.toml`, then run `uv sync` again. If `lens index` says it's running on the
CPU even though the PC has an NVIDIA card, `nvidia-smi` will show whether the driver is installed.

## 2 · Phone: build the app

The app uses a native module (LiteRT-LM), so it needs a development build; Expo Go can't run it.

```sh
cd app
npm install
npx eas-cli build --profile development --platform android   # or ios; `preview` makes a standalone build for demos
npx expo start --dev-client                                    # for the development build
```

On first launch, **Setup** walks you through it:

1. **Model**: downloads EmbeddingGemma 2 Text Vision 440M (388 MB). Use Wi-Fi.
2. **Products from the PC**: run `uv run lens` (or `lens serve`) on the PC, tap *Scan the PC's code*, and point the
   phone at the terminal. The phone and PC must be on the same Wi-Fi.
3. **Check** (optional): embeds a few catalogue pictures on the phone and compares them with the PC's vectors. You want
   a similarity of about 0.95 or higher, with each picture finding itself first.

Then point the camera at the product, fill the square with it, and press the shutter.

## Docs

| | |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | How it works, the model, and what keeps the phone and the PC in step |
| [docs/pc-tool.md](docs/pc-tool.md) | Every `lens` command and option, the data folder, troubleshooting |
| [docs/app.md](docs/app.md) | Building, first launch, screens, the native module, build plumbing, troubleshooting |
| [docs/index-format.md](docs/index-format.md) | The files the PC writes and the phone reads |
| [docs/demo.md](docs/demo.md) | Showing it to someone at the store |
| [AGENTS.md](AGENTS.md) | For anyone changing the code: what must stay the same on both sides |

## Layout

```
pc/lens/catalog.py         dataset + picture download, data clean-up
pc/lens/index.py           GPU detection, embedding, the index format, `lens search`
pc/lens/serve.py           Wi-Fi file server + terminal QR code
app/src/                   screens, index import and search, photo crop, settings
app/modules/gemma-embed/   native module: LiteRT-LM on Android (Kotlin) and iOS (Swift)
app/plugins/with-litert.js Android GPU libraries + embedding LiteRT-LM's iOS framework
```

## Status and data

The app type-checks and its screens have been rendered on the web, but it hasn't run on a phone yet; the first EAS
build is the real test ([troubleshooting](docs/app.md#troubleshooting)). Product data and pictures are IKEA's, from a
dataset published for research and non-commercial use. This is a personal demo, not an IKEA product.
