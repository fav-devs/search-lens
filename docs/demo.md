# Demo runbook

How to show Search Lens to someone at the store without it falling over.

## The day before

1. **Build the index at home.** On the PC: `cd pc`, `uv run lens`. It downloads, embeds (minutes on the GPU) and shows
   a QR code.
2. **Install a `preview` build** (`npx eas-cli build --profile preview --platform android`, or ios). It runs on its
   own; a development build needs the PC running `expo start`.
3. **Set the phone up on home Wi-Fi.** Setup → download the model (388 MB) → *Scan the PC's code*.
4. **Run Check.** You want *Phone and PC agree* (similarity above 0.95). If it's lower, see
   [app.md](app.md#troubleshooting) before trusting any demo.
5. **Choose the links.** You → Product links → *Canada* opens ikea.com/ca pages (and the IKEA app set to Canada).
   Prices on screen stay the US dataset's.
6. **Rehearse with things at home.** Scan five or six IKEA products you own, including two of the same series in
   different sizes, so you know what a good and a confusing result look like.

## At the store

- **Internet:** searching works offline, but thumbnails and **Open in IKEA** need data or Wi-Fi.
- **Taking the photo:** fill the square with the product, plain background if you can, whole product in frame, no
  hands across it. Straight-on beats an angle; a lid or a part alone matches worse than the whole thing.
- **Reading the results:** the top few are usually the right series; the exact size or colour is for the person to
  confirm against the product, using the price, dimensions in the name, and the article number.
- **The story in one line:** a product with no tag → photo → the right page in the IKEA app in a few seconds, with
  the article number to look up stock.

## Good things to show

- A tagless product → **Best matches** → product page → **Open in IKEA** jumping into the IKEA app.
- **Similar products** on a product page: instant, and handy when the exact variant isn't the top match.
- **Search** by description: "white bin with lid", "black desk lamp".
- Flight mode on: scanning still finds the matches, because the model and the index are on the phone (their
  pictures and the IKEA links need internet, though).

## Be upfront about

- It's a demo built on a public July 2025 snapshot of ikea.com/us, not IKEA's own data: newer products are missing and
  prices are US.
- It finds the series reliably; telling apart sizes of the same series from a photo is harder.
- The product names and pictures are IKEA's. The dataset is for non-commercial use, and anything beyond a demo would
  need IKEA's say-so.
