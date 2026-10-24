# scene-check

Runs the app's room scan (`app/src/scene/`, the same TypeScript the phone runs) on photos on the PC, with
`onnxruntime-node` in place of the phone's native bridge. Use it to try photos and to tune the room scan without
building the app.

```sh
(cd ../../app && npm install)  # the scan code imports jpeg-js from the app's packages
cd tools/scene-check
npm install
npm run models                 # the three models, ~193 MB, into ./models
npm run scan -- desk.jpg       # → out/desk/: 1.png, 2.png … (cutouts), overlay.png, objects.json
```

Photos should be JPEGs about 1024 px on the long side, which is what the app hands the scan. To see what each cutout
matches, search a PC index with it: `cd ../../pc && uv run lens search ../tools/scene-check/out/desk/1.png`.
