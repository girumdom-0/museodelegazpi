# Class Diagram and Implemented System Alignment

The class diagram only partially aligns with the implemented system.

## What Aligns

- `User` conceptually maps to visitors using the virtual tour.
- `Artifact` maps to museum exhibits and 3D models.
- `ArtifactsModel` maps to the `.glb` models loaded by Three.js.
- `MediaFile` maps to images, audio, and video assets.
- `MuseumAreas` conceptually maps to Krpano scenes.
- The system supports viewing artifacts, 360-degree scenes, descriptions, and text-to-speech.

## What Does Not Align

### 1. Admin

- The diagram shows an `Admin` class with upload, update, delete, and content-management operations.
- The current system has no administrator interface or CRUD implementation.

### 2. ContentUpdate

- The diagram shows update history and rollback operations.
- The current code does not implement update logs, rollback, or audit history.

### 3. NonImmersiveVRSession

- The diagram shows user sessions with start and end times.
- The current system does not store or manage user sessions.

### 4. User Methods

- The diagram includes methods such as `getCoordinates()` and `interactVR()`.
- The current system uses Krpano navigation and browser interactions; these methods are not implemented as application classes.

### 5. Artifact Methods

- Methods such as `getDetails()`, `display3DModel()`, and `getHistory()` are not actual JavaScript class methods.
- The current system uses functions such as `loadGLBModel()`, `showInfoPanel()`, and `showImagePopup()`.

### 6. MuseumAreas

- The diagram suggests a database entity containing scene paths and coordinates.
- The actual scenes are primarily defined in `tour.xml`, not retrieved from a `MuseumAreas` database table.

### 7. Database Structure

- The manuscript describes artifact, admin, media, and area collections.
- The actual code uses Supabase tables such as `tour_texts` and `assets`, while panorama scenes are stored in `tour.xml`.

## Recommended Correction

The manuscript should replace the current class diagram with an implementation-aligned model containing:

- `Visitor`
- `KrpanoTour`
- `Scene`
- `Hotspot`
- `TourText`
- `ArtifactModel`
- `Asset`
- `InfoPanel`
- `ImageGallery`
- `TextToSpeech`
- `ThreeModelViewer`
- `BattleVideo`

The relationships should show:

```text
Visitor
  -> KrpanoTour
      -> Scene
          -> Hotspot
              -> TourText
              -> Asset
              -> ArtifactModel

ArtifactModel
  -> ThreeModelViewer

TourText
  -> InfoPanel
      -> TextToSpeech

Asset
  -> ImageGallery
  -> BattleVideo
```

The following items should be removed from the implemented-system diagram or clearly labeled as proposed future features:

- Admin CRUD
- Content update logs
- Rollback
- User session tracking
- Database-managed museum areas
- `getCoordinates()`
- `interactVR()`
- `display3DModel()`

The current diagram describes a larger planned system than the one actually implemented. It should be revised to represent the real browser-based Krpano, Three.js, Supabase, Cloudflare, and Vercel architecture.