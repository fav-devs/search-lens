# Index format

What `lens index` writes to `pc/data/index/`, `lens serve` shares, and the app imports into its documents folder.
Writer: `pc/lens/index.py` (`write`). Readers: `pc/lens/index.py` (`read`, for `lens search`) and
`app/src/lens-index.ts`.

```
index/
  manifest.json      settings, pictures, products
  vectors.bin        one vector per picture
  details/00.json    product page text, products whose id % 64 == 0
  details/01.json
  …
  details/63.json
```

Format name `search-lens-index`, current version **2**.

## manifest.json

UTF-8 JSON, one object:

| Field | Example | Meaning |
| --- | --- | --- |
| `format` | `"search-lens-index"` | Identifies the file. The app refuses anything else. |
| `version` | `2` | 1 = no `details`; 2 = adds `details` and the `details/` folder. |
| `model` | `"google/embeddinggemma-2"` | The model the vectors came from. |
| `visionTokens` | `140` | Vision tokens per picture used on the PC. The app loads LiteRT-LM with the same number. |
| `queryPrefix` | `"task: search result \| query: "` | Put in front of typed searches before embedding them. |
| `dims` | `512` | Numbers per vector: 128, 256, 512 or 768. The app asks LiteRT-LM for vectors this long. |
| `count` | `27959` | Number of pictures, and of rows in `vectors.bin`. |
| `created` | `"2026-10-24T08:39:15+00:00"` | When the index was written (UTC). |
| `imageBase` | `"https://www.ikea.com/us/en/images/products/"` | Prefix for picture URLs. |
| `imageSize` | `"xxs"` | The `?f=` size the PC embedded (`xxs` = 400 px). |
| `details` | `{ "shards": 64 }` | Version 2 only: how many detail files there are. |
| `pictures` | `["zebrasaev-pendant-lamp-white-plastic__1286742_pe933703_s5.jpg", …]` | Each picture's file name on IKEA's image server, in vector order (sorted by the `pe…` number). |
| `products` | see below | Every product, in dataset order. |

A picture's URL is `imageBase + encodeURIComponent(pictures[i]) + "?f=" + imageSize`.

Each product:

| Field | Example | Meaning |
| --- | --- | --- |
| `id` | `"10580070"` | IKEA's 8-digit product id. Shown as the article number `105.800.70`. |
| `title` | `"ZEBRASÄV pendant lamp, white/plastic, 18\""` | Name in capitals, then kind, colour and size (sizes repaired). |
| `price` | `9.99` | US dollars, July 2025. |
| `url` | `"https://www.ikea.com/us/en/p/zebrasaev-pendant-lamp-white-plastic-10580070/"` | Product page. |
| `category` | `"Pendant lighting"` | The narrowest category. |
| `picture` | `36` | Row of this product's picture in `vectors.bin` and `pictures`. Several products can share one. |

## vectors.bin

Little-endian binary, two blocks back to back:

```
offset 0                  count × dims  int8     row i = picture i's vector, quantised
offset count × dims       count         float32  scale i
```

Picture *i*'s vector is `int8[i·dims … (i+1)·dims) × scale[i]`, which has unit length (to within rounding). The PC
quantises each row as `scale = max(|v|) / 127`, `int8 = round(v / scale)`, after cutting the 768-number vector to
`dims` and making it unit length again.

`dims` is a multiple of 128, so the float block always starts 4-byte aligned. File size is exactly
`count × dims + count × 4` bytes; the app checks this.

To score a query vector *q* (unit length, `dims` numbers) against picture *i*: `dot(q, int8 row i) × scale[i]`, the
cosine similarity.

## details/NN.json

Version 2. `NN` is two digits, `00` to `shards − 1`. Product `id` lives in file `int(id) % shards`. Each file is a JSON
object keyed by product id:

```json
{
  "10580070": {
    "description": "ZEBRASÄV pendant lamp surprises – an asymmetrical shape that looks different from all angles, …",
    "goodToKnow": ["Light bulb sold separately. IKEA recommends LED bulb E26 globe opal white.", "…"],
    "materials": ["Polypropylene plastic (min. 50% recycled)"],
    "care": [],
    "path": ["Lighting", "Lamps & light fixtures", "Ceiling lights", "Pendant lighting"]
  }
}
```

Any list can be empty and `description` can be `""` (669 products have none). Files are about 0.5 MB each, 31 MB in
all.

## The pack: searchlens.pack

`lens bundle` (`pc/lens/pack.py`) puts all of the above in one file for building into the app; the app unpacks it
on first launch (`app/src/bundled.ts`) into the same folder a Wi-Fi import uses.

```
offset 0          "SLPACK1\n"                       8 bytes
offset 8          header size                       uint32, little-endian
offset 12         header                            ASCII JSON
offset 12 + size  the entries' bytes, back to back
```

The header:

```json
{
  "format": "search-lens-index",
  "version": 2,
  "created": "2026-10-24T19:47:39+00:00",
  "entries": [
    { "name": "manifest.json", "offset": 0, "size": 10538041 },
    { "name": "vectors.bin", "offset": 10538041, "size": 14426844 },
    { "name": "details/00.json", "offset": 24964885, "size": 512404 },
    …
  ]
}
```

Entry offsets count from the end of the header. `created` is the manifest's: the app compares it with the index it
already has to decide whether an app update brought a newer catalogue.

## Changing the format

- Bump `version` for any change a reader has to know about, and keep the app able to read the versions people may
  still have on their phones (it reads version 1 by treating `details` as missing).
- Change `FORMAT` only if old readers must refuse the new files.
- The constants that must agree between `pc/lens/index.py` and the app are listed in [AGENTS.md](../AGENTS.md).
