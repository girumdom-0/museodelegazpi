/*
    File: script.js
    Purpose: Handles UI interactions outside of krpano: background music, text-to-speech (TTS), 3D model loading via Three.js, image popups, modal management, and utility helpers.
    Summary of responsibilities:
        - Background audio management and krpano skin integration
        - Initialize and manage Three.js scene for GLB/GLTF models
        - Modal open/close helpers for text, image, info and 3D viewers
        - Image popup panning/zoom controls and keyboard handlers
        - Text-to-speech control (play/pause/stop) and TTS UI updates
    Note: Exposes a few functions globally for krpano or UI to call (e.g., `loadGLBModel`, `toggleBackgroundMusic`).
*/

// Store the Three.js objects used by the interactive 3D model viewer.
let scene, camera, renderer, controls, currentModel;
// Track the optional texture, pending model request, resize listener, and active tour text.
let currentTexture = null;
let modelRequest = null;
let modelLoadVersion = 0;
let threeResizeHandler = null;
let threeAnimationActive = false;
let threeContextLost = false;
let activeTourTextAction = '';
// Cache remote tour descriptions so modal content can be reused without repeated requests.
const tourTexts = new Map();

// Define the Supabase and Cloudflare endpoints used to retrieve text and media metadata.
const supabaseTourTextsUrl = 'https://qysyaobzgltbxrpqjssv.supabase.co/rest/v1/tour_texts?select=action_name,title,summary_text,full_text';
const supabaseTourTextsKey = 'sb_publishable_NW9pedzYcVN0nIbzusJELQ_G9KsMwrU';
const supabaseAssetsUrl = 'https://qysyaobzgltbxrpqjssv.supabase.co/rest/v1/assets';
const supabaseAssetsKey = 'sb_publishable_NW9pedzYcVN0nIbzusJELQ_G9KsMwrU';
const cloudflareAssetsUrl = 'https://museodelegazpi-assets.07304476.workers.dev';
const assetUrlCache = new Map();
let assetCatalogPromise;
let textDetailsExpanded = false;
// Enable Three.js internal caching for loaded resources.
THREE.Cache.enabled = true;

// Build one stable cache key for an asset's type, provider, and storage path.
function assetCacheKey(assetType, storageProvider, storageKey) {
    // Normalize the provider and path so equivalent asset requests share one cache entry.
    return `${assetType}:${storageProvider.trim()}:${storageKey.trim()}`;
}

function preloadAssetCatalog() {
    // Request all public asset URLs once during startup so later media loads are faster.
    const params = new URLSearchParams({
        select: 'asset_type,storage_provider,storage_key,public_url',
    });

    // Fetch the catalog with the public Supabase key and disable stale browser caching.
    return fetch(`${supabaseAssetsUrl}?${params}`, {
        cache: 'no-store',
        headers: { apikey: supabaseAssetsKey, Authorization: `Bearer ${supabaseAssetsKey}` },
    })
        .then((response) => response.ok ? response.json() : [])
        .then((entries) => {
            // Store model metadata and index every returned public URL for quick lookup.
            cacheModelAssetInfo(entries);
            // Index every returned public URL by its normalized asset identity.
            entries.forEach((entry) => {
                const publicUrl = entry.public_url?.trim();
                if (publicUrl) {
                    assetUrlCache.set(
                        assetCacheKey(entry.asset_type, entry.storage_provider, entry.storage_key),
                        publicUrl
                    );
                }
            });
            return entries;
        })
        .catch(() => []);
}

function fetchAssetPublicUrl(assetType, storageProvider, storageKey, fallbackUrl) {
    // Return a cached URL immediately when this asset has already been resolved.
    const cacheKey = assetCacheKey(assetType, storageProvider, storageKey);
    const cachedUrl = assetUrlCache.get(cacheKey);
    if (cachedUrl) return Promise.resolve(cachedUrl);

    // Build PostgREST filters for the requested asset.
    const params = new URLSearchParams({
        select: 'public_url',
        asset_type: `eq.${assetType}`,
        storage_provider: `eq.${storageProvider}`,
        storage_key: `eq.${storageKey}`,
        limit: '1',
    });

    // Query only the requested asset and use the supplied fallback if the service is unavailable.
    const fetchUrl = () => fetch(`${supabaseAssetsUrl}?${params}`, {
        cache: 'no-store',
        headers: { apikey: supabaseAssetsKey, Authorization: `Bearer ${supabaseAssetsKey}` },
    })
        .then((response) => response.ok ? response.json() : [])
        .then((entries) => {
            const publicUrl = entries[0]?.public_url;
            if (publicUrl) assetUrlCache.set(cacheKey, publicUrl);
            return publicUrl || fallbackUrl;
        })
        .catch(() => fallbackUrl);

    // Resolve this asset immediately instead of waiting for the full catalog.
    // The catalog still warms the cache in parallel, but it must not block a model
    // download when the visitor has already requested that model.
    return fetchUrl().then((resolvedUrl) => assetUrlCache.get(cacheKey) || resolvedUrl);
}

// Begin loading the asset catalog while the rest of the page initializes.
assetCatalogPromise = preloadAssetCatalog();

function cacheTourTexts(entries) {
    // Index each description by its action name for hotspot and model lookups.
    // Use action_name as the lookup key used by Krpano hotspots and 3D models.
    entries.forEach((entry) => tourTexts.set(entry.action_name, entry));
}

function fetchTourTexts() {
    // Load the published tour copy used by text and information modals.
    return fetch(supabaseTourTextsUrl, {
        cache: 'no-store',
        headers: { apikey: supabaseTourTextsKey, Authorization: `Bearer ${supabaseTourTextsKey}` },
    })
        .then((response) => response.ok ? response.json() : [])
        .then((entries) => {
            cacheTourTexts(entries || []);
            return entries || [];
        });
}

// Keep the tour usable when the remote text service cannot be reached.
fetchTourTexts().catch(() => {});

function setActiveTourTextAction(actionName) {
    // Remember which database text record the next modal should display.
    activeTourTextAction = actionName;
}

// Expose the active action setter so Krpano hotspot actions can select modal text.
window.setActiveTourTextAction = setActiveTourTextAction;

// Create the background audio element for the Ibalong music.
// It loops continuously and starts at a low volume so it feels like ambient background music.
const backgroundMusic = new Audio('music/Ibalong_Festival_Song-Drums-segment-0.00-256.65.mp3');
// Configure the audio element as looping ambient music.
backgroundMusic.loop = true;
backgroundMusic.volume = 0.35;
backgroundMusic.preload = 'none';
backgroundMusic.muted = false;

// musicEnabled = true means the background music is currently playing.
// musicPausedByTTS tracks whether speech playback temporarily paused the music.
let musicEnabled = true;
let musicPausedByTTS = false;
let musicPausedByVideo = false;

// Start the music only if it is currently paused.
// This avoids restarting the audio unnecessarily when the user clicks around the page.
function startBackgroundMusic() {
    if (!backgroundMusic) return;
    if (backgroundMusic.paused) {
        const playPromise = backgroundMusic.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }
}

// Update the krpano skin icon so it matches the current music status.
// The on icon is shown when musicEnabled is true; the pause icon is shown when false.
function updateKrpanoMusicIcon() {
    if (window.krpano && window.krpano.set) {
        try {
            const url = musicEnabled ? '%SWFPATH%skin/music_on.png' : '%SWFPATH%skin/music_pause.png';
            window.krpano.set('layer[skin_btn_music].url', url);
        } catch (error) {
            // Ignore if the skin layer is not ready yet.
        }
    }
}

// Update the helper button text and styling when the music state changes.
function setMusicButtonState() {
    updateKrpanoMusicIcon();
    const musicButton = document.getElementById('music_control_button');
    if (!musicButton) return;
    // Reflect the audio state in the optional helper button.
    musicButton.textContent = musicEnabled ? '♫ Music On' : '♫ Music Off';
    musicButton.classList.toggle('muted', !musicEnabled);
}

// Pause the background music when TTS starts reading a hotspot or text panel.
// This prevents the voice and music from overlapping.
function pauseBackgroundMusicForTTS() {
    if (!backgroundMusic || backgroundMusic.paused || !musicEnabled) return;
    backgroundMusic.pause();
    musicPausedByTTS = true;
}

// Resume the background music after TTS finishes or is stopped.
function resumeBackgroundMusicAfterTTS() {
    if (!musicEnabled || !musicPausedByTTS) return;
    musicPausedByTTS = false;
    backgroundMusic.play().catch(() => {});
}

// Toggle the playing state of the background music.
// When turning it on, it starts playback; when turning it off, it pauses the audio.
function toggleBackgroundMusic() {
    // Flip the requested state before starting or pausing the audio element.
    musicEnabled = !musicEnabled;

    if (musicEnabled) {
        startBackgroundMusic();
        musicPausedByTTS = false;
    } else {
        backgroundMusic.pause();
        musicPausedByTTS = false;
    }

    updateKrpanoMusicIcon();
    setMusicButtonState();
}

// Expose the toggle globally so krpano can call it from the skin button.
window.toggleBackgroundMusic = toggleBackgroundMusic;

// Browser autoplay rules require user interaction before audio can start.
// This fires once on the first pointerdown and restarts the music if it is enabled.
window.addEventListener('pointerdown', () => {
    // Retry playback after the user's first gesture to satisfy autoplay policies.
    if (musicEnabled && !musicPausedByTTS) {
        startBackgroundMusic();
    }
}, { once: true });

// Start the background Ibalong music on page load and update the icon state immediately.
startBackgroundMusic();
setMusicButtonState();

function initThreeJS() {
    // Create the Three.js scene only when the first 3D model is opened.
    const container = document.getElementById("threejs_container");
    threeAnimationActive = true;
    scene = new THREE.Scene();

    // Create a perspective camera using the viewer's current aspect ratio.
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(0, 0, 3);

    // Reduce rendering quality on smaller devices to limit GPU and battery usage.
    const isMobileDevice = window.matchMedia('(max-width: 900px)').matches;
    // Create a transparent WebGL renderer with low-power preferences.
    renderer = new THREE.WebGLRenderer({
        antialias: !isMobileDevice,
        alpha: true,
        powerPreference: 'low-power'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    const maxPixelRatio = isMobileDevice ? 0.5 : 1.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));

    // Use the correct color-management API for the loaded Three.js version.
    if ('outputColorSpace' in renderer) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }

    // Insert the renderer canvas into the modal's container.
    container.appendChild(renderer.domElement);

    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        threeContextLost = true;
        console.warn('3D viewer WebGL context lost; waiting for restoration.');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
        threeContextLost = false;
        updateViewportDimensions();
        console.info('3D viewer WebGL context restored.');
    });

    // Add broad ambient light plus directional lights so models remain readable from all angles.
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 8, 5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-5, -2, -5);
    scene.add(fillLight);

    // Attach orbit controls so users can rotate and zoom the model.
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Render only while the viewer is active, and update orbit damping each frame.
    function animate() {
        requestAnimationFrame(animate);
        if (threeAnimationActive && !threeContextLost && document.getElementById("model3d_modal").style.display !== "none") {
            controls.update();
            renderer.render(scene, camera);
        }
    }
    animate();

    threeResizeHandler = updateViewportDimensions;
    window.addEventListener('resize', threeResizeHandler);
}

function updateViewportDimensions() {
    // Keep the camera projection and canvas size synchronized with the modal dimensions.
    const container = document.getElementById("threejs_container");
    if (camera && renderer && container) {
        // Recalculate the projection and drawing buffer after a resize.
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

function disposeModel(model) {
    // Release GPU geometry and material resources before replacing a model.
    model.traverse((child) => {
        if (!child.isMesh) return;

        // Dispose geometry and every material attached to this mesh.
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
    });
}

function removeCurrentModel() {
    // Remove the previous model and release its mesh and texture resources.
    if (currentModel) {
        scene.remove(currentModel);
        disposeModel(currentModel);
        currentModel = null;
    }

    // Release the optional texture independently from the model scene graph.
    if (currentTexture) {
        currentTexture.dispose();
        currentTexture = null;
    }
}

const modelTextActions = {
    // Map each GLB filename to the matching Supabase tour-text action.
    'bust.glb': 'model_bust',
    'general.glb': 'model_general',
    'orignakintatay.glb': 'model_orignakintatay',
    'planchaflat.glb': 'model_planchaflat',
    'plantsadeuling.glb': 'model_plantsadeuling',
    'DZMBMIC.glb': 'model_DZMBMIC'
};

// Cache metadata for models and images returned by the asset catalog.
const modelAssetInfo = new Map();
const imageAssetInfo = new Map();

function cacheModelAssetInfo(entries) {
    // Keep optional titles and descriptions alongside each model or image storage key.
    entries.forEach((entry) => {
        if (!entry.storage_key) return;
        // Keep only display metadata needed by the model and image panels.
        const metadata = {
            title: entry.title?.trim() || entry.asset_name?.trim() || '',
            description: entry.description?.trim() || ''
        };
        if (entry.asset_type === 'model') modelAssetInfo.set(entry.storage_key.trim(), metadata);
        if (entry.asset_type === 'image') imageAssetInfo.set(entry.storage_key.trim(), metadata);
    });
}

function loadGLBModel(glbPath, texturePath) {
    // Close competing views before opening the model viewer.
    closeAllModals();
    const loadVersion = ++modelLoadVersion;

    // Resolve the model's display text from the remote catalog, then use local defaults.
    const modelName = glbPath.split('/').pop();
    const modelText = tourTexts.get(modelTextActions[modelName]);
    const modelInfo = modelText ? {
        title: modelText.title?.trim() || '3D Exhibit',
        description: modelText.summary_text?.trim() || modelText.full_text?.trim() || 'Explore this museum object in three dimensions.'
    } : modelAssetInfo.get(modelName) || {
        title: '3D Exhibit',
        description: 'Explore this museum object in three dimensions.'
    };
    // Initialize the renderer lazily so the page does not create a WebGL context unnecessarily.
    if (!renderer) initThreeJS();
    threeAnimationActive = true;
    // Write the resolved model metadata into the 3D information panel.
    document.getElementById('model3d_title').textContent = modelInfo.title;
    document.getElementById('model3d_description').textContent = modelInfo.description;
    document.getElementById('model3d_info').hidden = true;
    document.getElementById('model3d_info_button').setAttribute('aria-label', `Show information about ${modelInfo.title}`);
    document.getElementById('model3d_info_button').title = `Show information about ${modelInfo.title}`;
    document.getElementById('threejs_container').setAttribute('aria-busy', 'true');
    document.getElementById('threejs_container').setAttribute('data-load-progress', '0%');

    // Make the model backdrop and dialog visible before loading begins.
    document.getElementById("model3d_backdrop").style.display = "block";
    document.getElementById("model3d_modal").style.display = "block";

    setTimeout(updateViewportDimensions, 50);

    // Cancel an older load so a slower response cannot replace the newly requested model.
    if (modelRequest) modelRequest.cancelled = true;
    removeCurrentModel();

    // Use a request token to ignore late responses from older model loads.
    const request = { cancelled: false, loadVersion };
    modelRequest = request;
    let pngTexture = null;
    // Load an optional texture and configure it for the model's material color space.
    if (texturePath) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        pngTexture = textureLoader.load(texturePath, (tex) => {
            // Discard a texture if the user opened a different model while it loaded.
            if (request.cancelled || request.loadVersion !== modelLoadVersion) {
                tex.dispose();
                return;
            }
            currentTexture = tex;
            tex.flipY = false;
            if ('colorSpace' in tex) {
                tex.colorSpace = THREE.SRGBColorSpace;
            } else if ('encoding' in tex) {
                tex.encoding = THREE.sRGBEncoding;
            }
        });
    }

    // Configure GLTF loading with Draco support for compressed museum models.
    const loader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    // Begin loading the Draco decoder while the model request is in flight.
    dracoLoader.preload();
    loader.setDRACOLoader(dracoLoader);

    const storageKey = glbPath.replace(/^models\//, '');
    const fallbackModelPath = `${cloudflareAssetsUrl}/${glbPath}`;
    const cachedModelPath = assetUrlCache.get(assetCacheKey('model', 'cloudflare', storageKey));
    // Start downloading from the known Cloudflare URL without waiting for Supabase.
    Promise.resolve(cachedModelPath || fallbackModelPath)
        .then((resolvedGlbPath) => {
            if (request.cancelled || request.loadVersion !== modelLoadVersion) return;

            // Load, center, scale, and add the model after its asset URL is resolved.
            loader.load(
        resolvedGlbPath,
        (gltf) => {
            if (request.cancelled || request.loadVersion !== modelLoadVersion) {
                disposeModel(gltf.scene);
                return;
            }

            // Mark the request complete and retain the loaded scene as the active model.
            modelRequest = null;
            document.getElementById('threejs_container').setAttribute('aria-busy', 'false');
            currentModel = gltf.scene;

            // Apply the optional replacement texture or make existing materials double-sided.
            currentModel.traverse((child) => {
                if (child.isMesh) {
                    if (pngTexture) {
                        child.material = new THREE.MeshStandardMaterial({
                            map: pngTexture,
                            roughness: 0.5,
                            metalness: 0.1,
                            side: THREE.DoubleSide
                        });
                    } else {
                        child.material.side = THREE.DoubleSide;
                    }
                }
            });

            // Calculate bounds so the camera frames models of different sizes consistently.
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            currentModel.position.sub(center);
            scene.add(currentModel);

            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.35;
            cameraZ = isNaN(cameraZ) || cameraZ === 0 ? 3 : cameraZ;

            camera.position.set(0, 0, cameraZ);
            camera.lookAt(0, 0, 0);

            controls.target.set(0, 0, 0);
            controls.update();
        },
        (progressEvent) => {
            const container = document.getElementById('threejs_container');
            if (!container || !progressEvent.lengthComputable) return;
            const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            container.setAttribute('data-load-progress', `${percent}%`);
        },
        (error) => {
            if (request.cancelled || request.loadVersion !== modelLoadVersion) return;
            document.getElementById('threejs_container').setAttribute('aria-busy', 'false');
            console.error("Error loading GLB:", error);
        }
            );
        });
}

function toggleModel3DInfo() {
    // Toggle the model description while keeping the button's accessible label accurate.
    const info = document.getElementById('model3d_info');
    const button = document.getElementById('model3d_info_button');
    if (!info || !button) return;

    // Invert the hidden state and update screen-reader text for the control.
    info.hidden = !info.hidden;
    const action = info.hidden ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${action} model information`);
    button.title = `${action} model information`;
}

// Toggle the model viewer's fullscreen CSS state and refresh its viewport size.
function toggle3DFullscreen() {
    // Toggle the fullscreen CSS state and recalculate the WebGL viewport afterward.
    const modal = document.getElementById("model3d_modal");
    modal.classList.toggle("fullscreen");
    setTimeout(updateViewportDimensions, 260);
}

// Close the 3D viewer and release the current model without destroying its WebGL context.
function clearGLBModel() {
    // Stop pending loads, remove the model, and pause rendering on close.
    modelLoadVersion += 1;
    if (modelRequest) modelRequest.cancelled = true;
    modelRequest = null;
    removeCurrentModel();
    document.getElementById("model3d_backdrop").style.display = "none";
    const modal = document.getElementById("model3d_modal");
    modal.style.display = "none";
    modal.classList.remove("fullscreen");
    threeAnimationActive = false;
    // Keep one renderer for the page lifetime. Repeatedly forcing context loss
    // can evict Krpano's WebGL context on iOS Safari.
}

// Expose 3D viewer functions for Krpano actions and HTML controls.
window.loadGLBModel = loadGLBModel;
window.clearGLBModel = clearGLBModel;
window.toggle3DFullscreen = toggle3DFullscreen;
window.toggleModel3DInfo = toggleModel3DInfo;
window.show_3d_obj = loadGLBModel;

function showTextModal(title, subtitle, bodyText, introItalicText) {
    // Populate the reusable text modal with the selected tour content.
    closeAllModals();

    // Prefer the database record selected by the latest hotspot action.
    const savedText = tourTexts.get(activeTourTextAction);
    const fullText = savedText?.full_text || '';
    if (savedText) {
        title = savedText.title || title;
        bodyText = savedText.summary_text || bodyText;
    }
    activeTourTextAction = '';

    // Fill the fixed modal shell with the selected title and subtitle.
    document.getElementById("text_modal_title").innerText = title || "";
    document.getElementById("text_modal_subtitle").innerText = subtitle || "";

    const bodyContainer = document.getElementById("text_modal_body");
    const moreButton = document.getElementById("text_modal_more");
    // Clear content from the previous hotspot before rendering this one.
    bodyContainer.innerHTML = "";
    textDetailsExpanded = false;

    // Render optional introductory and summary sections as text nodes for safe plain-text output.
    if (introItalicText) {
        const italicP = document.createElement("p");
        italicP.className = "text-italic-intro";
        italicP.innerText = introItalicText;
        bodyContainer.appendChild(italicP);
    }

    if (bodyText) {
        const mainP = document.createElement("div");
        mainP.id = "text_modal_summary";
        mainP.innerText = bodyText;
        bodyContainer.appendChild(mainP);
    }

    // Add the expandable full text section only when remote content provides one.
    if (fullText) {
        const fullTextContainer = document.createElement("div");
        fullTextContainer.id = "text_modal_full_text";
        fullTextContainer.innerText = fullText;
        fullTextContainer.hidden = true;
        bodyContainer.appendChild(fullTextContainer);
        moreButton.hidden = false;
        moreButton.textContent = "Full Text";
    } else {
        moreButton.hidden = true;
    }

    // Reveal the backdrop and modal after all content has been prepared.
    document.getElementById("text_backdrop").style.display = "block";
    document.getElementById("text_modal_card").style.display = "block";
}

function toggleTextDetails() {
    // Swap the summary and full-text sections without rebuilding the modal.
    const summaryContainer = document.getElementById("text_modal_summary");
    const fullTextContainer = document.getElementById("text_modal_full_text");
    const moreButton = document.getElementById("text_modal_more");
    if (!summaryContainer || !fullTextContainer || !moreButton) return;

    // Switch which text version is visible and update the button label.
    textDetailsExpanded = !textDetailsExpanded;
    summaryContainer.hidden = textDetailsExpanded;
    fullTextContainer.hidden = !textDetailsExpanded;
    moreButton.textContent = textDetailsExpanded ? "Back" : "Full Text";
}

function closeTextModal() {
    // Stop speech before hiding the modal so audio cannot continue invisibly.
    stopTTS();
    document.getElementById("text_backdrop").style.display = "none";
    document.getElementById("text_modal_card").style.display = "none";
}

// Expose text-modal functions for Krpano actions and HTML controls.
window.showTextModal = showTextModal;
window.closeTextModal = closeTextModal;
window.toggleTextDetails = toggleTextDetails;

function createImageWrapper(imgSrc) {
    // Create a lazy gallery image and resolve local storage paths through the asset service.
    const wrapper = document.createElement("div");
    wrapper.className = "gallery-img-wrapper";

    // Configure the image for deferred loading and asynchronous decoding.
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";

    if (imgSrc && !/^https?:\/\//i.test(imgSrc)) {
        const storageKey = imgSrc.replace(/^images\//, '');
        fetchAssetPublicUrl('image', 'cloudflare', storageKey, imgSrc)
            .then((assetUrl) => {
                img.src = assetUrl;
            });
    } else {
        img.src = imgSrc;
    }

    wrapper.appendChild(img);
    return wrapper;
}

function showInfoPanel(title, subtitle, bodyText, introItalic, imgMain, imgMid, imgBottom1, imgBottom2) {
    // Populate the exhibit panel's text and gallery before making it visible.
    closeAllModals();

    // Replace supplied fallback copy with the selected database record when available.
    const savedText = tourTexts.get(activeTourTextAction);
    const fullText = savedText?.full_text || '';
    if (savedText) {
        title = savedText.title || title;
        bodyText = savedText.summary_text || '';
    }
    activeTourTextAction = '';

    // Populate the panel heading and reset its text content.
    document.getElementById("info_panel_title").innerText = title || "";
    document.getElementById("info_panel_subtitle").innerText = subtitle || "";

    const bodyContainer = document.getElementById("info_panel_body");
    const moreButton = document.getElementById("info_panel_more");
    // Remove the previous exhibit description before adding the new one.
    bodyContainer.innerHTML = "";
    moreButton.hidden = !fullText;
    moreButton.textContent = "Full Text";
    bodyContainer.dataset.expanded = "false";

    if (introItalic) {
        const italicP = document.createElement("p");
        italicP.className = "panel-italic-intro";
        italicP.innerText = introItalic;
        bodyContainer.appendChild(italicP);
    }

    if (bodyText) {
        const textDiv = document.createElement("div");
        textDiv.id = "info_panel_summary";
        textDiv.innerText = bodyText;
        bodyContainer.appendChild(textDiv);
    }

    if (fullText) {
        const fullTextDiv = document.createElement("div");
        fullTextDiv.id = "info_panel_full_text";
        fullTextDiv.innerText = fullText;
        fullTextDiv.hidden = true;
        bodyContainer.appendChild(fullTextDiv);
    }

    // Clear and rebuild the exhibit gallery from the supplied image paths.
    const gallery = document.getElementById("info_panel_gallery");
    gallery.innerHTML = "";

    // Add available images in their intended gallery order.
    if (imgMain) {
        gallery.appendChild(createImageWrapper(imgMain));
    }

    if (imgMid) {
        gallery.appendChild(createImageWrapper(imgMid));
    }

    if (imgBottom1 || imgBottom2) {
        const row = document.createElement("div");
        row.className = "gallery-bottom-row";

        if (imgBottom1) {
            row.appendChild(createImageWrapper(imgBottom1));
        }
        if (imgBottom2) {
            row.appendChild(createImageWrapper(imgBottom2));
        }
        gallery.appendChild(row);
    }

    document.getElementById("info_panel_backdrop").style.display = "block";
    document.getElementById("info_panel_modal").style.display = "block";
}

function toggleInfoTextDetails() {
    // Toggle between the shortened exhibit description and its full text.
    const summary = document.getElementById("info_panel_summary");
    const fullText = document.getElementById("info_panel_full_text");
    const moreButton = document.getElementById("info_panel_more");
    if (!summary || !fullText || !moreButton) return;

    // Treat the button label as the current state and swap the two text blocks.
    const expanded = moreButton.textContent === "Full Text";
    summary.hidden = expanded;
    fullText.hidden = !expanded;
    moreButton.textContent = expanded ? "Back" : "Full Text";
}

function closeInfoPanel() {
    // Stop speech before hiding the exhibit panel so audio remains synchronized with the UI.
    stopTTS();
    document.getElementById("info_panel_backdrop").style.display = "none";
    document.getElementById("info_panel_modal").style.display = "none";
}

// Expose exhibit-panel functions for Krpano actions and HTML controls.
window.showInfoPanel = showInfoPanel;
window.closeInfoPanel = closeInfoPanel;
window.toggleInfoTextDetails = toggleInfoTextDetails;

// Store the selected gallery, zoom level, pan position, and active touch pointers.
const imagePopupState = {
    images: [],
    imageIndex: 0,
    requestId: 0,
    scale: 1,
    x: 0,
    y: 0,
    pointerStartX: 0,
    pointerStartY: 0,
    imageStartX: 0,
    imageStartY: 0,
    dragging: false,
    pointers: new Map(),
    pinchStartDistance: 0,
    pinchStartScale: 1,
};

// Store references to image-popup elements after the document has loaded.
const imagePopupElements = {};

function initImagePopup() {
    // Cache popup controls once and connect navigation, zoom, pointer, and wheel events.
    imagePopupElements.backdrop = document.getElementById('image_popup_backdrop');
    imagePopupElements.modal = document.getElementById('image_popup_modal');
    imagePopupElements.image = document.getElementById('image_popup_image');
    imagePopupElements.zoomIn = document.getElementById('image_popup_zoom_in');
    imagePopupElements.zoomOut = document.getElementById('image_popup_zoom_out');
    imagePopupElements.close = document.getElementById('image_popup_close');
    imagePopupElements.previous = document.getElementById('image_popup_previous');
    imagePopupElements.next = document.getElementById('image_popup_next');
    imagePopupElements.counter = document.getElementById('image_popup_counter');

    if (!imagePopupElements.image || !imagePopupElements.backdrop) return;

    // Connect popup controls to close, zoom, navigation, pointer, and wheel handlers.
    imagePopupElements.backdrop.addEventListener('click', hideImagePopup);
    imagePopupElements.modal.addEventListener('click', (event) => event.stopPropagation());
    imagePopupElements.close.addEventListener('click', hideImagePopup);
    imagePopupElements.zoomIn.addEventListener('click', () => adjustImagePopupZoom(1.2));
    imagePopupElements.zoomOut.addEventListener('click', () => adjustImagePopupZoom(1 / 1.2));
    imagePopupElements.previous.addEventListener('click', () => changeImagePopup(-1));
    imagePopupElements.next.addEventListener('click', () => changeImagePopup(1));
    imagePopupElements.image.addEventListener('pointerdown', startImageDrag);
    window.addEventListener('pointermove', moveImageDrag);
    window.addEventListener('pointerup', endImagePointer);
    window.addEventListener('pointercancel', endImagePointer);
    imagePopupElements.backdrop.addEventListener('wheel', handleImageWheel, { passive: false });
}

function updateImagePopupTransform() {
    // Apply the current pan and zoom state to the displayed image.
    if (!imagePopupElements.image) return;
    // Combine the current pan offset and zoom factor into one CSS transform.
    imagePopupElements.image.style.transform = `translate(${imagePopupState.x}px, ${imagePopupState.y}px) scale(${imagePopupState.scale})`;
}

function resetImagePopupTransform() {
    // Return the popup image to its original centered scale and position.
    imagePopupState.scale = 1;
    imagePopupState.x = 0;
    imagePopupState.y = 0;
    updateImagePopupTransform();
}

/* Adjust the image popup zoom level by a multiplicative factor.
   Keeps the state in `imagePopupState.scale` and applies the CSS transform.
   Called by zoom buttons and mouse wheel handlers.
*/
function adjustImagePopupZoom(factor) {
    imagePopupState.scale *= factor;
    updateImagePopupTransform();
}

/* Begin dragging the image inside the popup.
   Records pointer start coordinates and current image offset for smooth dragging.
*/
function startImageDrag(event) {
    event.preventDefault();
    imagePopupState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (imagePopupState.pointers.size === 2) {
        const [firstPointer, secondPointer] = imagePopupState.pointers.values();
        imagePopupState.pinchStartDistance = Math.hypot(
            secondPointer.x - firstPointer.x,
            secondPointer.y - firstPointer.y
        );
        imagePopupState.pinchStartScale = imagePopupState.scale;
        imagePopupState.dragging = false;
        imagePopupElements.image.style.cursor = 'grabbing';
        return;
    }

    if (imagePopupState.pointers.size > 2) return;

    imagePopupState.dragging = true;
    imagePopupState.pointerStartX = event.clientX;
    imagePopupState.pointerStartY = event.clientY;
    imagePopupState.imageStartX = imagePopupState.x;
    imagePopupState.imageStartY = imagePopupState.y;
    imagePopupElements.image.style.cursor = 'grabbing';
}

/* Handle pointer move while dragging the popup image.
   Computes delta from the initial pointer position and updates transform.
*/
function moveImageDrag(event) {
    if (!imagePopupState.pointers.has(event.pointerId)) return;
    event.preventDefault();

    imagePopupState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (imagePopupState.pointers.size >= 2) {
        const [firstPointer, secondPointer] = imagePopupState.pointers.values();
        const distance = Math.hypot(
            secondPointer.x - firstPointer.x,
            secondPointer.y - firstPointer.y
        );
        if (imagePopupState.pinchStartDistance > 0) {
            imagePopupState.scale = imagePopupState.pinchStartScale * distance / imagePopupState.pinchStartDistance;
            updateImagePopupTransform();
        }
        return;
    }

    if (!imagePopupState.dragging) return;
    const dx = event.clientX - imagePopupState.pointerStartX;
    const dy = event.clientY - imagePopupState.pointerStartY;
    imagePopupState.x = imagePopupState.imageStartX + dx;
    imagePopupState.y = imagePopupState.imageStartY + dy;
    updateImagePopupTransform();
}

/* End dragging the popup image and restore cursor state. */
function stopImageDrag() {
    imagePopupState.dragging = false;
    if (imagePopupElements.image) {
        imagePopupElements.image.style.cursor = 'grab';
    }
}

function endImagePointer(event) {
    // Remove the released pointer and continue dragging if another pointer remains.
    imagePopupState.pointers.delete(event.pointerId);

    if (imagePopupState.pointers.size === 1) {
        const remainingPointer = imagePopupState.pointers.values().next().value;
        imagePopupState.pointerStartX = remainingPointer.x;
        imagePopupState.pointerStartY = remainingPointer.y;
        imagePopupState.imageStartX = imagePopupState.x;
        imagePopupState.imageStartY = imagePopupState.y;
        imagePopupState.dragging = true;
    } else if (imagePopupState.pointers.size === 0) {
        stopImageDrag();
        imagePopupState.pinchStartDistance = 0;
    }
}

/* Mouse wheel handler for the image popup: zooms in/out while preventing page scroll. */
function handleImageWheel(event) {
    if (!imagePopupElements.modal || imagePopupElements.modal.style.display === 'none') return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 / 1.15 : 1.15;
    adjustImagePopupZoom(delta);
}

function updateImagePopupGallery() {
    // Load the selected gallery item, update navigation state, and reset its transform.
    const { images, imageIndex } = imagePopupState;
    const imageSrc = images[imageIndex];
    const requestId = ++imagePopupState.requestId;

    // Clear the old source while the selected image URL is resolved.
    imagePopupElements.image.removeAttribute('src');
    imagePopupElements.image.alt = 'Loading museum image';

    if (imageSrc && !/^https?:\/\//i.test(imageSrc)) {
        const storageKey = imageSrc.replace(/^images\//, '');
        const fallbackUrl = `${cloudflareAssetsUrl}/${imageSrc}`;
        imagePopupElements.image.src = fallbackUrl;
        imagePopupElements.image.alt = 'Museum image';
        fetchAssetPublicUrl('image', 'cloudflare', storageKey, fallbackUrl)
            .then((assetUrl) => {
                if (requestId === imagePopupState.requestId) {
                    imagePopupElements.image.src = assetUrl;
                    imagePopupElements.image.alt = 'Museum image';
                }
            });
    } else {
        imagePopupElements.image.src = imageSrc;
        imagePopupElements.image.alt = 'Museum image';
    }

    // Update gallery navigation state and reset pan/zoom for the new image.
    imagePopupElements.counter.textContent = `${imageIndex + 1} / ${images.length}`;
    imagePopupElements.previous.hidden = images.length < 2;
    imagePopupElements.next.hidden = images.length < 2;
    resetImagePopupTransform();
}

function changeImagePopup(direction) {
    // Move through the gallery circularly so the first and last images connect.
    if (imagePopupState.images.length < 2) return;
    // Wrap the index around the gallery boundaries in either direction.
    imagePopupState.imageIndex = (imagePopupState.imageIndex + direction + imagePopupState.images.length) % imagePopupState.images.length;
    updateImagePopupGallery();
}

/* Open the image popup and load the provided image source or gallery. */
function showImagePopup(imageSrc, imageSources, captions = [], galleryTitle = 'Museum image') {
    // Open one image or a complete gallery after resetting other modal views.
    closeAllModals();
    if (!imagePopupElements.backdrop || !imagePopupElements.modal || !imagePopupElements.image) return;

    imagePopupState.images = Array.isArray(imageSources) && imageSources.length
        ? imageSources
        : [imageSrc];
    imagePopupState.imageIndex = Math.max(0, imagePopupState.images.indexOf(imageSrc));
    updateImagePopupGallery();
    imagePopupElements.backdrop.style.display = 'block';
    imagePopupElements.modal.style.display = 'flex';
}

/* Close the image popup and hide its backdrop. */
function hideImagePopup() {
    // Hide the image viewer without destroying its cached event handlers.
    if (!imagePopupElements.backdrop || !imagePopupElements.modal) return;
    imagePopupElements.backdrop.style.display = 'none';
    imagePopupElements.modal.style.display = 'none';
}

// Expose both descriptive and legacy image-popup names for existing tour actions.
window.showImagePopup = showImagePopup;
window.hideImagePopup = hideImagePopup;
window.show_image_popup = showImagePopup;
window.hide_image_popup = hideImagePopup;

function showBattleVideo() {
    // Resolve and play the Battle of Legazpi video while pausing background music.
    closeAllModals();
    const backdrop = document.getElementById('battle_video_backdrop');
    const modal = document.getElementById('battle_video_modal');
    const video = document.getElementById('battle_video');
    if (!backdrop || !modal || !video) return;

    // Resolve the source only the first time the video is opened.
    const source = video.querySelector('source[data-src]');
    if (source) {
        const fallbackUrl = source.dataset.src;
        const assetUrl = fetchAssetPublicUrl(
            source.dataset.assetType,
            source.dataset.storageProvider,
            source.dataset.storageKey,
            fallbackUrl
        );

        assetUrl.then((url) => {
            source.src = url;
            source.removeAttribute('data-src');
            video.load();
            video.play().catch(() => {});
        });
    }

    // Pause background music so it does not compete with the video soundtrack.
    if (backgroundMusic && !backgroundMusic.paused && musicEnabled) {
        backgroundMusic.pause();
        musicPausedByVideo = true;
    }
    backdrop.style.display = 'block';
    modal.style.display = 'block';
    video.currentTime = 0;
}

function hideBattleVideo() {
    // Stop and reset the video, then restore music if this dialog paused it.
    const backdrop = document.getElementById('battle_video_backdrop');
    const modal = document.getElementById('battle_video_modal');
    const video = document.getElementById('battle_video');
    // Stop playback and return the video to its beginning.
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
    if (musicPausedByVideo && musicEnabled) {
        musicPausedByVideo = false;
        backgroundMusic.play().catch(() => {});
    }
    if (backdrop) backdrop.style.display = 'none';
    if (modal) modal.style.display = 'none';
}

function skipBattleVideo(seconds) {
    // Move the video playhead forward without exceeding its loaded duration.
    const video = document.getElementById('battle_video');
    if (!video) return;
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + seconds);
}

// Expose video controls for hotspot actions and custom interface controls.
window.showBattleVideo = showBattleVideo;
window.hideBattleVideo = hideBattleVideo;
window.skipBattleVideo = skipBattleVideo;

// Initialize popup event handlers after the document is fully loaded.
window.addEventListener('load', initImagePopup);
// Route keyboard navigation and modal-close shortcuts through one global handler.
window.addEventListener('keydown', handleGlobalKeyDown);

/* Global keyboard handler to close any open modal on Escape or Backspace.
   Prevents default navigation behavior when a modal is open.
*/
function handleGlobalKeyDown(event) {
    // Close open views with Escape or Backspace, and navigate images with arrow keys.
    const key = event.key;
    if (key !== 'Escape' && key !== 'Backspace' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;

    // Collect every modal so one keyboard action can close the active views safely.
    const textModal = document.getElementById('text_modal_card');
    const infoModal = document.getElementById('info_panel_modal');
    const imageModal = document.getElementById('image_popup_modal');
    const model3dModal = document.getElementById('model3d_modal');
    const battleVideoModal = document.getElementById('battle_video_modal');

    // Ignore navigation keys when no modal is currently visible.
    const isAnyOpen = [textModal, infoModal, imageModal, model3dModal, battleVideoModal].some(el => el && el.style.display !== 'none');
    if (!isAnyOpen) return;

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        changeImagePopup(key === 'ArrowRight' ? 1 : -1);
        return;
    }

    event.preventDefault();

    if (imageModal && imageModal.style.display !== 'none') hideImagePopup();
    if (infoModal && infoModal.style.display !== 'none') closeInfoPanel();
    if (textModal && textModal.style.display !== 'none') closeTextModal();
    if (model3dModal && model3dModal.style.display !== 'none') clearGLBModel();
    if (battleVideoModal && battleVideoModal.style.display !== 'none') hideBattleVideo();
}

/* Close every modal on the page and stop any active TTS or 3D view.
   Safe to call before opening a new modal so only one view is visible.
*/
function closeAllModals() {
    // Hide every view before another one opens so modal states cannot overlap.
    if (typeof stopTTS === 'function') stopTTS();
    // Hide text and information panels before closing the heavier 3D and media views.
    document.getElementById("text_backdrop").style.display = "none";
    document.getElementById("text_modal_card").style.display = "none";
    document.getElementById("info_panel_backdrop").style.display = "none";
    document.getElementById("info_panel_modal").style.display = "none";
    if (typeof clearGLBModel === "function") clearGLBModel();
    hideImagePopup();
    hideBattleVideo();
}

// Track the active speech utterance and the controls that should reflect its state.
let currentUtterance = null;
let activePlayBtnId = null;
let activeStopBtnId = null;

/* Toggle Text-To-Speech playback for a modal/card.
    - If speech is active: pause/resume accordingly.
    - If not active: build the text from container title/subtitle/body and start speaking.
    Also manages background music pause/resume to avoid audio overlap.
*/
function toggleTTS(containerId, playBtnId, stopBtnId) {
    // Read the active modal's visible text and coordinate speech with background music.
    const synth = window.speechSynthesis;

    // Existing speech is controlled as pause/resume instead of starting another utterance.
    if (synth.speaking) {
        if (synth.paused) {
            synth.resume();
            document.getElementById(playBtnId).innerText = "⏸ Pause";
            pauseBackgroundMusicForTTS();
        } else {
            synth.pause();
            document.getElementById(playBtnId).innerText = "▶ Resume";
            resumeBackgroundMusicAfterTTS();
        }
        return;
    }

    pauseBackgroundMusicForTTS();
    synth.cancel();

    const container = document.getElementById(containerId);
    if (!container) return;

    // Collect visible title, subtitle, and body text into one speech string.
    const title = container.querySelector('h2, [id$="_title"]')?.innerText || '';
    const subtitle = container.querySelector('[id$="_subtitle"]')?.innerText || '';
    const bodyText = container.querySelector('[id$="_body"], [id$="_description"], [id$="_summary"]')?.innerText || '';

    const fullTextToRead = `${title}. ${subtitle}. ${bodyText}`.trim();
    if (!fullTextToRead) return;

    activePlayBtnId = playBtnId;
    activeStopBtnId = stopBtnId;

    // Create and configure the browser speech request.
    currentUtterance = new SpeechSynthesisUtterance(fullTextToRead);
    currentUtterance.rate = 0.95;

    currentUtterance.onstart = function () {
        // Show pause and stop controls once speech playback begins.
        document.getElementById(playBtnId).innerText = "⏸ Pause";
        document.getElementById(stopBtnId).style.display = "inline-flex";
    };

    currentUtterance.onend = function () {
        // Restore idle controls after speech finishes normally.
        resetTTSUI();
    };

    currentUtterance.onerror = function () {
        // Restore idle controls if the browser reports a speech error.
        resetTTSUI();
    };

    synth.speak(currentUtterance);
}

/* Stop any active TTS and restore UI and background music state. */
function stopTTS() {
    // Cancel speech immediately, restore music, and reset the TTS controls.
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    resumeBackgroundMusicAfterTTS();
    resetTTSUI();
}

function resetTTSUI() {
    // Return the active play and stop buttons to their idle state.
    // Reset the play control associated with the completed or cancelled utterance.
    if (activePlayBtnId) {
        const playBtn = document.getElementById(activePlayBtnId);
        if (playBtn) playBtn.innerText = "▶ Listen";
    }
    if (activeStopBtnId) {
        const stopBtn = document.getElementById(activeStopBtnId);
        if (stopBtn) stopBtn.style.display = "none";
    }
    activePlayBtnId = null;
    activeStopBtnId = null;
}

