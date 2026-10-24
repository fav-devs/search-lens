# The PC tool: `lens`

`pc/` is a small Python command-line tool. It downloads the catalogue, embeds every product picture with
EmbeddingGemma 2 on an NVIDIA GPU, and hands the result to the phone over Wi-Fi.

## Install

Needs [uv](https://docs.astral.sh/uv/getting-started/installation/) (it installs Python itself) and, for speed, an
NVIDIA GPU with a current driver.

```sh
cd pc
uv sync
```

`uv sync` creates `pc/.venv` with PyTorch, transformers 5 and sentence-transformers, pinned by `uv.lock`. On Windows
and Linux, PyTorch comes from the CUDA 12.6 build index, which covers RTX 20, 30 and 40 cards. macOS gets the plain
PyPI build, with no CUDA.

**RTX 50 cards** need the CUDA 13 build: in `pc/pyproject.toml` change the index URL's `cu126` to `cu130`, then run
`uv lock` and `uv sync`.

Run the tool as `uv run lens …` from `pc/`, or activate `.venv` and run `lens …`.

## Commands

```sh
uv run lens                                   # all three steps, resuming where a previous run stopped
uv run lens download [--category TEXT]… [--limit N] [--size xxs|xs|s|m] [--workers 8]
uv run lens index    [--dims 128|256|512|768] [--batch 16] [--cpu]
uv run lens search   QUERY [--top 8] [--cpu]
uv run lens serve    [--port 8765]
```

`--data DIR` (default `./data`) goes **before** the command, e.g. `uv run lens --data D:\lens index`, and applies to all
of them.

### `lens` (no command)

Runs `download`, then `index` (512 dimensions, batch 16), then `serve` on port 8765, with the default options and the
whole catalogue. Each step skips work already done, so running it again after a stop costs little.

### `lens download`

1. Fetches `products-us.jsonl` (50 MB) from the
   [IKEA US dataset](https://huggingface.co/datasets/jeffreyszhou/ikea-us-products-2025), once.
2. Reads the products, keeping those whose category path contains any `--category` text (case-insensitive, e.g.
   `--category Lighting --category "Storage & organization"`), up to `--limit`.
3. Downloads each picture from IKEA's image server at `--size`: `xxs` 400 px (default), `xs` 500, `s` 600, `m` 700.
   Variants that share a photo share the download: the full catalogue is 30,511 products but 27,959 pictures,
   about 250 MB and 6 minutes at 8 parallel downloads. Each picture is tried up to 4 times, waiting longer each time; a 404 is not retried.
4. Writes `catalog.json` with the products whose picture arrived, and lists the failures in `failed.txt`.

Pictures already on disk are skipped. **The catalogue is what you downloaded last**: a run with `--category` makes a
smaller catalogue, and the next plain `lens` brings the whole one back.

### `lens index`

1. Finds the GPU and prints it (name, memory, bf16 or fp32). Without CUDA, or with `--cpu`, it runs on the CPU at
   about 1–2 seconds per picture.
2. Loads `google/embeddinggemma-2` (1.5 GB, downloaded from Hugging Face the first time into the Hugging Face cache)
   with the audio encoder switched off and the vision budget set to 140 tokens per picture.
3. Embeds the pictures in chunks of 512 and saves each chunk to `data/embeddings/<signature>/NNNNN.npy` as soon as it's
   done. A stopped run picks up at the next chunk. If the GPU runs out of memory, the batch halves itself and carries
   on.
4. Writes `data/index/` (see [index-format.md](index-format.md)): the vectors cut to `--dims` and stored as int8,
   the product list and the product details.

The chunks keep all 768 numbers, so changing `--dims` doesn't embed anything again. Their folder name is a hash of the
model, the vision budget and the list of pictures; changing any of those starts a new folder.

### `lens search QUERY`

Tries the index on the PC. `QUERY` is a description (`"black desk lamp"`) or the path of a photo. Prints the `--top`
closest pictures and their products: score, title, price, article number, link.

### `lens serve`

Shares `data/index/` over HTTP on every network interface, prints a QR code holding `http://<this PC's LAN IP>:<port>/`
and logs each file the phone takes. In the app: **Setup → Scan the PC's code**, or type the address. Ctrl+C stops it.

The QR code is drawn in black and white whatever the terminal's colours, so it scans on dark themes too.

## The data folder

```
pc/data/
  products-us.jsonl        the dataset's product list
  images/pe933703.jpg      one picture per product photo, named by IKEA's picture number
  catalog.json             the products kept by the last download
  failed.txt               pictures that couldn't be fetched
  embeddings/<signature>/  768-number vectors, 512 pictures per file
  index/                   what the phone gets: manifest.json, vectors.bin, details/
```

All of it can be rebuilt; it's ignored by git.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "There is an NVIDIA GPU, but this PyTorch can't use it" | The CPU build of PyTorch got installed. Run `uv sync` from `pc/` (it reinstalls from the CUDA index). On an RTX 50, switch to `cu130` first. |
| `nvidia-smi` doesn't work | Install or update the NVIDIA driver. |
| CUDA out of memory | It retries at half the batch on its own. To start smaller, use `--batch 4`. |
| "The model returned NaN" | The model ran in fp16. It only uses bf16 or fp32; if you changed the code, put that back. |
| The phone can't reach `lens serve` | Same Wi-Fi on both (not a guest network that isolates devices), allow Python through the Windows firewall on private networks, or try another `--port`. Check the address in a browser on the phone: `http://<ip>:8765/manifest.json`. |
| The QR code shows the wrong address (a VPN or virtual adapter) | Type the right address in the app instead. `ipconfig` (Windows) or `ip addr` (Linux) shows the Wi-Fi adapter's address. |
| Some pictures failed | See `data/failed.txt`. Run `lens download` again to retry them; products without a picture are left out of the index. |
