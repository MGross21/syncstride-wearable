# Models

GLB files for the console's 3D arm (Three.js), loaded by `js/arm3d.js` (meshopt-compressed).

The original Onshape exports live in `docs/models/left_arm/` so they are not deployed with the site.
To regenerate these files from the repo root:

```sh
npx @gltf-transform/cli@4.1.1 optimize docs/models/left_arm/left_upper_arm.glb pages/models/upper_arm.glb --compress meshopt --texture-compress false --simplify-ratio 0.5 --simplify-error 0.0005
npx @gltf-transform/cli@4.1.1 optimize docs/models/left_arm/left_lower_arm.glb pages/models/lower_arm.glb --compress meshopt --texture-compress false --simplify-ratio 0.5 --simplify-error 0.0005
```

Joint pivots (shoulder, elbow, wrist) are hard-coded in `js/arm3d.js` in the models' assembly coordinates.
