# Technical Design

## Component Boundary

- `ImageStudio` remains the request and form-state owner.
- `ImageResultGallery` owns thumbnail selection, preview state, transform controls, and copy/download feedback.
- `imageResultActions.ts` owns fetch/blob/canvas/data-URL/export operations without React state.

## Result Flow

```text
GenerationResult.assets -> compact thumbnail grid -> preview Dialog
-> local visual transform state -> copy/download transformed PNG
-> edit handoff -> PNG data URL -> ImageStudio edit input
```

The existing `submit` handler remains the single generation path. Regenerate closes the dialog and requests a new form submission. Edit handoff selects the current editable model when possible, otherwise the first enabled local-input image-edit model.

## Transform Contract

Rotation is normalized to 90-degree increments. Horizontal and vertical flips are independent booleans. Zoom is preview-only and bounded from 50% to 300%. Rotation and flips are applied to canvas exports and edit handoff; zoom does not change exported pixel dimensions.

## Failure Behavior

- Fetch/decode/canvas failures produce bounded UI feedback and leave the original result available.
- Clipboard image failure falls back to copying the image URL when text clipboard access exists.
- If no compatible image-edit model exists, the edit command is disabled with a clear label.
- Object URLs are always revoked after download/render use.

## Responsive Behavior

Thumbnail cards use a bounded auto-fill grid. The preview dialog is viewport-bounded, uses one internal image viewport, wraps command groups on small screens, and retains 44px mobile targets.
