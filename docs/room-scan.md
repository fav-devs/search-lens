# Room scan

Photograph a desk, a shelf or a room. The app outlines the things in it, numbers them on the photo, and lists the
closest catalogue product for each, to open or put in the basket.

```
photo ──► OWL-ViT ──► boxes ──► EdgeTAM ──► outlines ──► cut out on white ──► EmbeddingGemma ──► catalogue search
          "chair",               (box prompt)             448 px, like a           (same as a           keep scores
          "lamp", …                                       catalogue shot)          product photo)       ≥ 0.85
```

Code: `app/src/scene/` (plain TypeScript), `app/src/screens/RoomScreen.tsx`, the ONNX bridge in
`app/modules/gemma-embed`, and `tools/scene-check` to run the same code on the PC.

## Steps

1. **Shrink.** The camera photo is resized to 1024 px on the long side (`room.ts`).
2. **Find** (`scene.ts`, `detect`). [OWL-ViT](https://huggingface.co/google/owlvit-base-patch32) base/32
   (Google, Apache-2.0; the quantised ONNX build from Xenova) looks for the things in `vocabulary.ts`: chairs, sofas,
   tables, shelves, cabinets, lamps, cushions, rugs, vases, mugs, baskets, mirrors and so on, 45 in all. Boxes scoring
   at least 0.12 are kept, boxes over 60% of the photo (the room itself) are dropped, overlapping boxes are merged, and at
   most 15 go on.
3. **Outline.** [EdgeTAM](https://huggingface.co/facebook/EdgeTAM) (Meta, Apache-2.0; the ONNX graphs from
   jax-image-tools/edgetam-video-onnx, the same ones ai-cut's Select uses) encodes the photo once, then each box goes
   in as a box prompt and comes back as a 256 × 256 mask. Masks EdgeTAM says aren't an object, masks under 0.2% of the
   photo, long thin slivers (more than 4 : 1) and second copies of the same thing are dropped.
4. **Cut out.** Each mask's bounding square (plus 8%) is cut from the photo at 448 px, with everything outside the
   mask faded to white: the object alone on white, the way the catalogue photographs products. Written as a PNG.
5. **Match** (`room.ts`). Each cutout is embedded and searched exactly like a single-product photo. Things whose best
   match scores under `MIN_MATCH` (0.85) are left out; the rest are numbered left to right.

The two extra models (193 MB) download the first time Room mode is used and are loaded only for the scan, then
released before the embedding model runs.

## What was tried first

**Segment everything with EdgeTAM alone.** A 12 × 12 grid of taps over the photo, each tap a point prompt, then
filtering and merging the masks. EdgeTAM answers a single tap with the most likely *part*: a chair's back, its seat
and its legs came back as three objects, and walls and floors as many more. Merging neighbouring parts (prompting
with the box around both and checking the mask covers both) chained wall, sofa, table and chairs into one blob, and
checked merging took 300–900 decoder runs, 50–150 s per photo on a 4-core CPU. Too slow and too noisy for a phone.

**A box prompt instead of a tap** gives the whole object. EdgeTAM takes a box as two points labelled 2 and 3; given
the box around a chair, it outlines the whole chair. So the question became where boxes come from, and a detector
told what to look for (OWL-ViT) finds whole products. A COCO detector such as the RF-DETR in ai-cut wasn't enough:
COCO has chairs, sofas and tables, but no lamps, shelves, cabinets, cushions or rugs.

## Results so far

On four IKEA room photos from ikea.com, run on a 4-core CPU with the PC's model (`tools/scene-check`, then
`lens search`), against a test index of the 1,588 tables, chairs and lights:

| Photo | Found | Kept (≥ 0.85) | What was kept |
| --- | --- | --- | --- |
| Black chairs at a table, sofa behind | 12 | 3 | ADDE chair, black (0.92 and 0.88); a black stool (0.89) |
| Round wooden table, six chairs | 13 | 4 | SKANSNÄS chair (0.91, 0.87); VOXLÖV chair (0.86); a table-and-chairs set (0.85) |
| Open-plan office | 15 | 4 | a black lounge chair (0.87); two black pendant lamps (0.89, 0.87); an LED strip (0.86, wrong) |
| Bedding and cushions | 3 | – | (nothing in the test index to match) |

Judged by eye against the catalogue photos (there is no answer key for these rooms), matches that looked right
scored 0.86–0.92 and wrong ones 0.76–0.86: thin edges of desks and drawers matching LED strips,
cushions and mugs matching chair covers and lamps because the test index has no cushions or mugs. The scan itself
(find, outline, cut out) took 1.5–4 s per photo on the CPU here, before matching.

What this doesn't tell us yet:

- **How fast it is on a phone.** OWL-ViT is the heaviest step; expect several seconds in all. Not measured.
- **How the phone's model scores.** The threshold was set with the PC's EmbeddingGemma; the phone's quantised one may
  score a little differently. If good things go missing or junk shows up, adjust `MIN_MATCH`.
- **The full catalogue.** With all 28,000 products, cushions and mugs have real matches, and so do more wrong ones.

## Tuning

| Setting | Where | Effect |
| --- | --- | --- |
| `MIN_MATCH` (0.85) | `src/scene/room.ts` | Lower shows more things, including more wrong ones. |
| `threshold` (0.12) | `analyzeScene` options | Detector confidence. Lower finds more, smaller or partly hidden things. |
| `limit` (15) | `analyzeScene` options | Most things looked at per photo; each costs a decode and an embedding. |
| The 4 : 1 sliver rule | `src/scene/scene.ts` | Drops long thin masks. Raise it if curtains or shelves go missing. |
| `THINGS` | `src/scene/vocabulary.ts` | What the detector looks for. After changing it, regenerate the token ids (comment at the top). |

To try a change without building the app: `tools/scene-check` runs the same code on photos on the PC and writes the
cutouts; `lens search <cutout.png>` shows what each matches.

## Known limits

- Two things in one box (two chairs side by side) can come out as one object; the match is usually still right.
- Very thin things (pendant lamp cords, chair legs seen edge-on) outline poorly.
- The overlay is drawn from 256 × 256 masks, so outlines are soft.
- Tapping the photo opens the smallest object under the finger; a dot jumps to that object's row.
