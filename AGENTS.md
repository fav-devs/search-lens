# AGENTS.md

Search Lens: a PC tool (`pc/`, Python) builds an image index of the IKEA catalogue with EmbeddingGemma 2 on a GPU; an
Expo app (`app/`) embeds photos on the phone with the same model and searches that index. Read
[docs/architecture.md](docs/architecture.md) first.

## Keep the PC and the app in step

The PC writes vectors and the phone compares its own against them. If any of these drift apart, search quietly gets
worse; nothing errors. Change them together, on both sides, and check with **Setup → Check** on a phone.

| What | PC | App |
| --- | --- | --- |
| Index format name and version | `FORMAT`, `version` in `pc/lens/index.py` | `FORMAT` in `app/src/lens-index.ts` |
| Vision tokens per picture (140) | `VISION_TOKENS` in `pc/lens/index.py`, written to `manifest.visionTokens` | read from the manifest, passed to `GemmaEmbed.load` |
| Vector length (512 by default) | `--dims`, written to `manifest.dims` | read from the manifest, passed as `outputSize` |
| Text query prefix | `QUERY_PREFIX` in `pc/lens/index.py`, written to `manifest.queryPrefix` | read from the manifest |
| Detail files | `DETAIL_SHARDS`, `int(id) % shards` | `manifest.details.shards`, `Number(id) % shards` |
| Model | `google/embeddinggemma-2` | `embeddinggemma-2-text-vision-440m.litertlm` (`app/src/model.ts`) |

The file format itself is specified in [docs/index-format.md](docs/index-format.md); update it with any format change.

## Rules

- The PC model runs in **bf16 or fp32, never fp16** (NaN or silently wrong vectors).
- **Unit length after truncating:** cutting a vector to fewer dimensions needs it normalised again.
- **LiteRT-LM** is pinned to the same version in `app/modules/gemma-embed/android/build.gradle` and
  `app/modules/gemma-embed/ios/GemmaEmbed.podspec`. Upgrading it can change the Kotlin version Android needs
  (`android.kotlinVersion` in `app/app.json`); see [docs/app.md](docs/app.md#build-plumbing).
- The app keeps reading older index versions people may still have imported (version 1 has no details).
- Don't present data the dataset doesn't have (stock, reviews) as if it were real.

## Checks

```sh
cd app && npx tsc --noEmit                 # app types
cd pc && uv run lens --data /tmp/t download --category Lighting --limit 40 \
      && uv run lens --data /tmp/t index --cpu \
      && uv run lens --data /tmp/t search "black desk lamp"      # PC end to end, on the CPU
```

There are no automated tests yet, and the app has not run on a device; the first EAS build is the real check.

## Code style

Comments say why, in plain sentences; names are full words. TypeScript uses tabs, Python 4 spaces, Kotlin and Swift
2 spaces, matching the files around them.
