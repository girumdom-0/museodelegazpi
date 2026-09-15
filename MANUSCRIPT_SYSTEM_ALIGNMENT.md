# GIRUMDOM Manuscript and System Alignment Review

## Overall Assessment

The manuscript and the implemented GIRUMDOM system share the same main objective: a web-based, non-immersive virtual museum for Museo de Legazpi using 360-degree scenes, interactive 3D artifacts, multimedia information, and accessibility features.

However, several sections describe a larger or different system than the one currently implemented. The manuscript should be revised so that its technical descriptions, diagrams, database design, system requirements, and evaluation claims match the deployed application.

## Areas That Align

- Web-based virtual museum accessible through browsers.
- Krpano-powered 360-degree museum navigation.
- Interactive 3D artifact visualization.
- Images and text-based exhibit information.
- Browser text-to-speech support.
- Video content for the Battle of Legazpi exhibit.
- Mobile, tablet, laptop, and desktop access.
- GitHub and Vercel deployment.
- Supabase and Cloudflare-backed asset/content delivery.
- WebGL-based rendering for 3D content.

## Required Corrections

### 1. Project Status

The manuscript says the system is still in the proposal stage, but the application has already been implemented, deployed, tested, and evaluated.

Replace statements such as:

> Since the study is currently in the proposal stage...

with wording such as:

> Since the system has been implemented and evaluated, this chapter presents the implemented features, system design, testing results, and evaluation findings of GIRUMDOM.

### 2. Actual Technology Stack

The manuscript currently mentions technologies that are not accurately reflected in the deployed system.

Revise the technology sections to describe:

- HTML, CSS, and JavaScript for the web interface and application logic.
- Krpano for 360-degree scenes, navigation, hotspots, and tour controls.
- Three.js and GLTFLoader for interactive GLB 3D artifact models.
- Supabase REST APIs for tour text and asset metadata.
- Cloudflare-hosted storage for large media assets and 3D models.
- GitHub for source control and project hosting integration.
- Vercel for deployment.
- The browser Speech Synthesis API for text-to-speech.
- WebGL for hardware-accelerated 3D rendering.

Remove or qualify references to the following unless they were actually used during development and are documented as production tools:

- Firestore
- A-Frame
- Augmented Reality (AR)
- WebXR as a required runtime feature

Calibry Nest and Thor3D may remain as artifact-production or scanning tools, but they should not be described as runtime application technologies.

### 3. Augmented Reality Claims

The implemented system provides non-immersive virtual reality, 360-degree navigation, and interactive 3D visualization. It does not currently provide camera-based augmented reality or physical-world object placement.

Revise references to AR in the following areas:

- Executive Summary
- Project Context
- Technical Terms
- Scope and Delimitations
- Interview Guide
- Conceptual Framework
- System Requirements

Use “interactive 3D visualization” or “WebGL-based 3D artifact viewing” where appropriate, unless an actual AR feature is added later.

### 4. Database Design

The current class and database descriptions do not match the implemented data model.

The application currently uses data sources including:

- `tour_texts`
  - `action_name`
  - `title`
  - `summary_text`
  - `full_text`
- `assets`
  - `asset_type`
  - `storage_provider`
  - `storage_key`
  - `public_url`
- Krpano scenes and hotspots defined in `tour.xml`.
- Local and remote media assets.

Revise the database design section to describe these actual structures instead of presenting unimplemented collections such as `Artifact`, `Admin`, `ContentUpdate`, and `MuseumAreas` as active database tables.

### 5. Administrator Features

The manuscript claims that system administrators can upload, update, and delete artifact information and media through the system. The current repository does not contain an administrator dashboard or CRUD interface.

Either implement and document the administrator module later, or revise the manuscript to state:

> Content and asset metadata are managed through the connected Supabase data source and external asset storage. The current public-facing application does not include a user-facing administrator dashboard.

### 6. Class Diagram

The current class diagram represents a planned system more extensive than the implemented application.

The following items are not implemented as application classes or services:

- `Admin` CRUD methods
- `ContentUpdate` audit history
- Rollback operations
- `NonImmersiveVRSession` storage
- `User.getCoordinates()`
- `User.interactVR()`
- `Artifact.getHistory()`
- Database-managed `MuseumAreas`

The diagram should either be revised or clearly labeled as a proposed/future design.

An implementation-aligned conceptual model should include:

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

### 7. System Architecture

The current system is primarily client-side. Krpano and Three.js run in the user's browser.

The architecture explanation should state:

- The browser loads the static application from Vercel.
- Krpano loads tour configuration and panorama tiles.
- Three.js loads and renders GLB models when requested.
- Supabase provides text and asset metadata.
- Cloudflare provides large images, models, and other media.
- Browser APIs provide text-to-speech and media playback.

Avoid describing a traditional application server as the component responsible for all rendering and processing unless that server actually exists in deployment.

### 8. System Requirements

Separate requirements into development, deployment, and user requirements.

Suggested user requirements:

- A modern browser such as Chrome, Edge, Firefox, or Safari.
- JavaScript enabled.
- WebGL support for 3D artifact viewing.
- Stable internet access.
- A device capable of displaying 360-degree scenes and selected 3D models.

Avoid presenting 50 Mbps, 16 GB RAM, Windows 11, or a specific processor as strict requirements for every user. These are better described as recommended development, testing, or high-performance conditions.

### 9. Mobile and Tablet Limitations

Add a limitation section explaining that:

- Panorama and 3D assets can consume significant browser memory.
- Mobile browsers may terminate pages that exceed memory or GPU limits.
- 3D models are loaded on demand rather than all at startup.
- Mobile WebGL pixel density is reduced to lower GPU pressure.
- Performance varies by device, browser, network, and available memory.
- Messenger's embedded browser may behave differently from Safari or Chrome.
- Full reliability cannot be guaranteed on older or low-memory devices.

### 10. External Browser and VR Requests

The WebVR plugin may request Google Cardboard device-profile files. These requests are optional and do not represent the core museum content.

The manuscript should describe VR support as optional browser/plugin capability, not as a requirement for ordinary phone, tablet, laptop, or desktop use.

### 11. Evaluation Results

Clarify the following details:

- Number of IT experts who evaluated the system.
- Number of end users who evaluated the system.
- Sampling method.
- Rating scale.
- Formula used to calculate the mean.
- Meaning of each verbal interpretation.

Replace “sub-average rating” with “mean rating” or “average rating.” A rating of `5.00` is not sub-average.

Also check the respondent counts in the tables. Some tables appear to show three respondents while other narrative sections refer to 30 respondents.

### 12. Terminology and Typographical Corrections

Review the manuscript for the following consistency issues:

- Use one form consistently: `GIRUMDOM`, not alternating capitalization.
- Use `non-immersive virtual reality` consistently.
- Use `360-degree` instead of inconsistent forms such as `360view` or `360Degree`.
- Use `iPod` only if the device is intentionally included; otherwise use `tablet`.
- Replace `sub-average` with `average` or `mean`.
- Correct `ISO 25010` to `ISO/IEC 25010` where referring to the standard.
- Replace “game application” with “web application” or “virtual museum system.”
- Correct references to “Firestore” where the implementation uses Supabase.
- Correct references to “A-Frame” where the implementation uses Three.js and Krpano.
- Check inconsistent totals and cost figures in the economic discussion.

## Suggested Technology Stack Paragraph

Use a paragraph similar to the following in the manuscript:

> The implemented GIRUMDOM system is a client-side web application developed using HTML, CSS, and JavaScript. Krpano is used to display and navigate the 360-degree museum scenes, while Three.js and GLTFLoader are used to render selected GLB 3D artifact models. Supabase REST APIs provide tour text and asset metadata, while Cloudflare-hosted storage delivers large images, models, and other media files. GitHub is used for source control and Vercel is used for deployment. Browser Speech Synthesis provides text-to-speech functionality, and WebGL provides hardware-accelerated rendering for interactive 3D content.

## Suggested Limitations Paragraph

> The system requires an internet connection and depends on browser support for JavaScript, WebGL, media playback, and speech synthesis. Performance may vary depending on device memory, GPU capability, browser version, and network quality. Mobile and tablet browsers may impose stricter memory limits when loading panorama textures and 3D models. To reduce resource usage, 3D models are loaded only when requested and mobile WebGL rendering uses a reduced pixel ratio. Immersive VR and camera-based augmented reality are outside the implemented scope of the current version.

## Priority Order

Before final defense or submission, revise these items first:

1. Remove unsupported AR claims.
2. Replace Firestore and A-Frame references with Supabase, Three.js, and Krpano.
3. Update the database design to match `tour_texts` and `assets`.
4. Correct the class diagram or label it as a proposed future design.
5. Remove unsupported administrator CRUD claims.
6. Correct the project status from proposal to implemented system.
7. Add mobile and tablet performance limitations.
8. Correct evaluation terminology, respondent counts, and rating calculations.
9. Update the system architecture diagram and explanation.
10. Perform a final grammar, terminology, and consistency review.
