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

let scene, camera, renderer, controls, currentModel;
let currentTexture = null;
let modelRequest = null;
let activeTourTextAction = '';
const tourTexts = new Map();

const supabaseTourTextsUrl = 'https://qysyaobzgltbxrpqjssv.supabase.co/rest/v1/tour_texts?select=action_name,title,summary_text,full_text';
const supabaseTourTextsKey = 'sb_publishable_NW9pedzYcVN0nIbzusJELQ_G9KsMwrU';
const supabaseAssetsUrl = 'https://qysyaobzgltbxrpqjssv.supabase.co/rest/v1/assets';
const supabaseAssetsKey = 'sb_publishable_NW9pedzYcVN0nIbzusJELQ_G9KsMwrU';
const cloudflareAssetsUrl = 'https://museodelegazpi-assets.07304476.workers.dev';
const assetUrlCache = new Map();
let assetCatalogPromise;
const modelPaths = [
    'models/bust.glb',
    'models/orignakintatay.glb',
    'models/general.glb',
    'models/planchaflat.glb',
    'models/plantsadeuling.glb',
    'models/DZMBMIC.glb',
];

const localFullTexts = new Map([
    ['show_sister_city_info', `SISTER CITY-RELATIONSHIP
BETWEEN THE CITY OF
LEGAZPI AND AYUNTAMIENTO ZUMMARAGA

In seeking the roots of the person from whom the city was named, the officials of the City of Legazpi signed Sister-city Relationship Agreement with the Ayuntamiento de Zumarraga, España on October 21, 1975. Zumarraga in Gipuzkoa, a province of the Basque Country autonomous community of Spain is the birthplace of Adelantado Don Miguel Lopez de Legazpi. "Adelantado" was a title used by some Spanish conquistadores of the 16th century who served as a governor of a province in Spain or of a Spanish colonial province. The sister-city Agreement was signed by Legazpi City Mayor Gregorio Imperial and Zumarraga Alcalde Don Cruz-Maria Uribezalgo Larrañaga.

The Agreement states in part: "The City Government of Legazpi and the Ayuntamiento de Zumarraga...commit and bind themselves to have and encourage exchange of information regarding their local history, traditions and culture, tourism, literature, current problems and progress in local government administration and such other subjects of mutual interests..."

Pursuant to the objectives of the above Agreement, Legazpi City Mayor Geraldine Rosal and her husband, City Administrator Noel Rosal visited Zumarraga on February 19-20, 2012. They met with Zumarraga Mayor Mikel Serrano, his legislative council and a group of local businessmen. According to Mayor Rosal, they were able to discuss tourism, investments and other business opportunities that would redound to the mutual benefits of Legazpi and Zumarraga. The trip was sponsored by Agencia de Espanola Cooperacion Internacional para el Desarollo (AECID), Spain's aid agency, which had been extending financial and technological assistance to Legazpi in its development projects. One of the largest of these projects is the sanitary landfill where AECID extended over P100 million assistance.

The naming of the City is credited to Don Ramon Montero of the Gobierno Superior de las Islas Filipinas who, in July 17, 1856, signed a decree creating the visita of Pueblo Viejo, out of Binanuahan and the adjacent villages of Lamba, Rawis and Bigaa. In another decree, he named the town Legazpi, which was inaugurated on October 22, 1856.

Miguel Lopez de Legazpi, was born in 1502 in Zumárraga, Spain; he was a Basque by birth. In 1528, he moved to Mexico (then called New Spain) and worked there in the financial council until he was appointed civil governor of Mexico City. In 1564, he was commissioned by King Philip II of Spain to lead an expedition to the Pacific Ocean in search of the Spice Island, along the routes taken by Ferdinand Magellan and Ruy Lopez de Villalobos. He arrived in the Visayas in September 1565 and initially made Cebu his seat of government. His grandson, Juan de Salcedo, captured Manila in 1571, made it his new seat of government and declared it the capital of the Philippines. He died of a stroke on August 20, 1572, after having scolded an aide. His remains were interred in a vault in San Agustin Church, Intramuros, Manila. The Spanish rule of the Philippines would last until September 1898.

Legazpi was actually the name of a place in the municipality of Zumarraga in Gipuzkoa, a province of the Basque Country autonomous community of Spain. In the birthplace of Miguel Lopez now stands a Legazpi Tower to commemorate his great contributions to Spain.

THE CITY NAMED AFTER
MIGUEL LOPEZ DE LEGAZPI

LEGAZPI CITY is the capital of the Province of Albay. Its prominence indicates that many events which happened here affected many other places in the province. The city was founded in 1856 and was named after the Basque Spanish navigator, Miguel Lopez de Legazpi-who never set foot in Albay. The most plausible reason for naming the place after Legazpi was because he was the grandfather of Captain Juan de Salcedo, the intrepid conquistador who in 1572 raided the region for gold and built the first Spanish garrison in Bikol named Santiago de Libong, now in the town of Libon, Albay. In fact, in 1772 Governor General Simon de Anda named the settlement adjacent to the City Salcedo (later renamed Daraga).`],
]);

let textDetailsExpanded = false;
THREE.Cache.enabled = true;

function assetCacheKey(assetType, storageProvider, storageKey) {
    return `${assetType}:${storageProvider.trim()}:${storageKey.trim()}`;
}

function preloadAssetCatalog() {
    const params = new URLSearchParams({
        select: 'asset_type,storage_provider,storage_key,public_url,asset_name,title,description',
    });

    return fetch(`${supabaseAssetsUrl}?${params}`, {
        cache: 'no-store',
        headers: { apikey: supabaseAssetsKey, Authorization: `Bearer ${supabaseAssetsKey}` },
    })
        .then((response) => response.ok ? response.json() : [])
        .then((entries) => {
            cacheModelAssetInfo(entries);
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

function preloadModels(entries) {
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    modelPaths.forEach((modelPath) => {
        const storageKey = modelPath.replace(/^models\//, '');
        const catalogEntry = entries.find((entry) => (
            entry.asset_type === 'model' &&
            entry.storage_provider === 'cloudflare' &&
            entry.storage_key === storageKey &&
            entry.public_url
        ));
        const modelUrl = catalogEntry?.public_url || `${cloudflareAssetsUrl}/${modelPath}`;
        const loader = new THREE.GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        loader.load(
            modelUrl.trim(),
            (gltf) => disposeModel(gltf.scene),
            undefined,
            () => {}
        );
    });
}

function fetchAssetPublicUrl(assetType, storageProvider, storageKey, fallbackUrl) {
    const cacheKey = assetCacheKey(assetType, storageProvider, storageKey);
    const cachedUrl = assetUrlCache.get(cacheKey);
    if (cachedUrl) return Promise.resolve(cachedUrl);

    const params = new URLSearchParams({
        select: 'public_url',
        asset_type: `eq.${assetType}`,
        storage_provider: `eq.${storageProvider}`,
        storage_key: `eq.${storageKey}`,
        limit: '1',
    });

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

    return (assetCatalogPromise || Promise.resolve()).then(() => {
        return assetUrlCache.get(cacheKey) || fetchUrl();
    });
}

assetCatalogPromise = preloadAssetCatalog();
assetCatalogPromise.then(preloadModels);

function cacheTourTexts(entries) {
    entries.forEach((entry) => tourTexts.set(entry.action_name, entry));
}

function fetchTourTexts() {
    return fetch('/api/tour-texts', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Local API unavailable')))
        .catch(() => fetch(supabaseTourTextsUrl, {
            cache: 'no-store',
            headers: { apikey: supabaseTourTextsKey, Authorization: `Bearer ${supabaseTourTextsKey}` },
        }))
        .then((response) => response && response.ok ? response.json() : [])
        .then((entries) => {
            cacheTourTexts(entries || []);
            return entries || [];
        });
}

fetchTourTexts().catch(() => {});
window.setInterval(() => fetchTourTexts().catch(() => {}), 3000);

function setActiveTourTextAction(actionName) {
    activeTourTextAction = actionName;
}

window.setActiveTourTextAction = setActiveTourTextAction;

// Create the background audio element for the Ibalong music.
// It loops continuously and starts at a low volume so it feels like ambient background music.
const backgroundMusic = new Audio('music/Ibalong_Festival_Song-Drums-segment-0.00-256.65.mp3');
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
    if (musicEnabled && !musicPausedByTTS) {
        startBackgroundMusic();
    }
}, { once: true });

// Start the background Ibalong music on page load and update the icon state immediately.
startBackgroundMusic();
setMusicButtonState();

function initThreeJS() {
    const container = document.getElementById("threejs_container");
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(0, 0, 3);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    if ('outputColorSpace' in renderer) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }

    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 8, 5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-5, -2, -5);
    scene.add(fillLight);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    function animate() {
        requestAnimationFrame(animate);
        if (document.getElementById("model3d_modal").style.display !== "none") {
            controls.update();
            renderer.render(scene, camera);
        }
    }
    animate();

    window.addEventListener('resize', updateViewportDimensions);
}

function updateViewportDimensions() {
    const container = document.getElementById("threejs_container");
    if (camera && renderer && container) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}

function disposeModel(model) {
    model.traverse((child) => {
        if (!child.isMesh) return;

        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
    });
}

function removeCurrentModel() {
    if (currentModel) {
        scene.remove(currentModel);
        disposeModel(currentModel);
        currentModel = null;
    }

    if (currentTexture) {
        currentTexture.dispose();
        currentTexture = null;
    }
}

const modelDescriptions = {
    'bust.glb': {
        title: 'Miguel Lopez de Legazpi Bust',
        description: 'Explore this three-dimensional representation of Miguel Lopez de Legazpi.'
    },
    'general.glb': {
        title: 'General 3D Exhibit',
        description: 'Explore the exhibit from every angle using the interactive 3D viewer.'
    },
    'orignakintatay.glb': {
        title: 'Original Kin Tatay Exhibit',
        description: 'Explore this museum object in three dimensions.'
    },
    'planchaflat.glb': {
        title: 'Plancha Flat Exhibit',
        description: 'Explore this museum object in three dimensions.'
    },
    'plantsadeuling.glb': {
        title: 'Plant Sa Deuling Exhibit',
        description: 'Explore this museum object in three dimensions.'
    },
    'DZMBMIC.glb': {
        title: 'DZMBMIC Exhibit',
        description: 'Explore this museum object in three dimensions.'
    }
};

const modelTextActions = {
    'bust.glb': 'model_bust',
    'general.glb': 'model_general',
    'orignakintatay.glb': 'model_orignakintatay',
    'planchaflat.glb': 'model_planchaflat',
    'plantsadeuling.glb': 'model_plantsadeuling',
    'DZMBMIC.glb': 'model_DZMBMIC'
};

const modelAssetInfo = new Map();
const imageAssetInfo = new Map();

function cacheModelAssetInfo(entries) {
    entries.forEach((entry) => {
        if (!entry.storage_key) return;
        const metadata = {
            title: entry.title?.trim() || entry.asset_name?.trim() || '',
            description: entry.description?.trim() || ''
        };
        if (entry.asset_type === 'model') modelAssetInfo.set(entry.storage_key.trim(), metadata);
        if (entry.asset_type === 'image') imageAssetInfo.set(entry.storage_key.trim(), metadata);
    });
}

function loadGLBModel(glbPath, texturePath) {
    closeAllModals();
    if (!renderer) initThreeJS();

    const modelName = glbPath.split('/').pop();
    const modelText = tourTexts.get(modelTextActions[modelName]);
    const modelInfo = modelText ? {
        title: modelText.title?.trim() || modelDescriptions[modelName]?.title || '3D Exhibit',
        description: modelText.summary_text?.trim() || modelText.full_text?.trim() || modelDescriptions[modelName]?.description || 'Explore this museum object in three dimensions.'
    } : modelAssetInfo.get(modelName) || modelDescriptions[modelName] || {
        title: '3D Exhibit',
        description: 'Explore this museum object in three dimensions.'
    };
    document.getElementById('model3d_title').textContent = modelInfo.title;
    document.getElementById('model3d_description').textContent = modelInfo.description;
    document.getElementById('model3d_info').hidden = true;
    document.getElementById('model3d_info_button').setAttribute('aria-label', `Show information about ${modelInfo.title}`);
    document.getElementById('model3d_info_button').title = `Show information about ${modelInfo.title}`;

    document.getElementById("model3d_backdrop").style.display = "block";
    document.getElementById("model3d_modal").style.display = "block";

    setTimeout(updateViewportDimensions, 50);

    if (modelRequest) modelRequest.cancelled = true;
    removeCurrentModel();

    const request = { cancelled: false };
    modelRequest = request;
    let pngTexture = null;
    if (texturePath) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous');
        pngTexture = textureLoader.load(texturePath, (tex) => {
            if (request.cancelled) {
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

    const loader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(dracoLoader);

    const storageKey = glbPath.replace(/^models\//, '');
    fetchAssetPublicUrl(
        'model',
        'cloudflare',
        storageKey,
        `${cloudflareAssetsUrl}/${glbPath}`
    )
        .then((resolvedGlbPath) => {
            if (request.cancelled) return;

            loader.load(
        resolvedGlbPath,
        (gltf) => {
            if (request.cancelled) {
                disposeModel(gltf.scene);
                return;
            }

            modelRequest = null;
            currentModel = gltf.scene;

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
        undefined,
        (error) => console.error("Error loading GLB:", error)
            );
        });
}

function toggleModel3DInfo() {
    const info = document.getElementById('model3d_info');
    const button = document.getElementById('model3d_info_button');
    if (!info || !button) return;

    info.hidden = !info.hidden;
    const action = info.hidden ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${action} model information`);
    button.title = `${action} model information`;
}

function toggle3DFullscreen() {
    const modal = document.getElementById("model3d_modal");
    modal.classList.toggle("fullscreen");
    setTimeout(updateViewportDimensions, 260);
}

function clearGLBModel() {
    if (modelRequest) modelRequest.cancelled = true;
    modelRequest = null;
    removeCurrentModel();
    document.getElementById("model3d_backdrop").style.display = "none";
    const modal = document.getElementById("model3d_modal");
    modal.style.display = "none";
    modal.classList.remove("fullscreen");
}

window.loadGLBModel = loadGLBModel;
window.clearGLBModel = clearGLBModel;
window.toggle3DFullscreen = toggle3DFullscreen;
window.toggleModel3DInfo = toggleModel3DInfo;
window.show_3d_obj = loadGLBModel;

function showTextModal(title, subtitle, bodyText, introItalicText) {
    closeAllModals();

    const savedText = tourTexts.get(activeTourTextAction);
    const fullText = savedText?.full_text || localFullTexts.get(activeTourTextAction) || '';
    if (savedText) {
        title = savedText.title || title;
        bodyText = savedText.summary_text || bodyText;
    }
    activeTourTextAction = '';

    document.getElementById("text_modal_title").innerText = title || "";
    document.getElementById("text_modal_subtitle").innerText = subtitle || "";

    const bodyContainer = document.getElementById("text_modal_body");
    const moreButton = document.getElementById("text_modal_more");
    bodyContainer.innerHTML = "";
    textDetailsExpanded = false;

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

    if (fullText) {
        const fullTextContainer = document.createElement("div");
        fullTextContainer.id = "text_modal_full_text";
        fullTextContainer.innerText = fullText;
        fullTextContainer.hidden = true;
        bodyContainer.appendChild(fullTextContainer);
        moreButton.hidden = false;
        moreButton.textContent = "See more";
    } else {
        moreButton.hidden = true;
    }

    document.getElementById("text_backdrop").style.display = "block";
    document.getElementById("text_modal_card").style.display = "block";
}

function toggleTextDetails() {
    const summaryContainer = document.getElementById("text_modal_summary");
    const fullTextContainer = document.getElementById("text_modal_full_text");
    const moreButton = document.getElementById("text_modal_more");
    if (!summaryContainer || !fullTextContainer || !moreButton) return;

    textDetailsExpanded = !textDetailsExpanded;
    summaryContainer.hidden = textDetailsExpanded;
    fullTextContainer.hidden = !textDetailsExpanded;
    moreButton.textContent = textDetailsExpanded ? "Show less" : "See more";
}

function closeTextModal() {
    stopTTS();
    document.getElementById("text_backdrop").style.display = "none";
    document.getElementById("text_modal_card").style.display = "none";
}

window.showTextModal = showTextModal;
window.closeTextModal = closeTextModal;
window.toggleTextDetails = toggleTextDetails;

function createImageWrapper(imgSrc) {
    const wrapper = document.createElement("div");
    wrapper.className = "gallery-img-wrapper";

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
    closeAllModals();

    const savedText = tourTexts.get(activeTourTextAction);
    const fullText = savedText?.full_text || '';
    if (savedText) {
        title = savedText.title || title;
        bodyText = savedText.summary_text || '';
    }
    activeTourTextAction = '';

    document.getElementById("info_panel_title").innerText = title || "";
    document.getElementById("info_panel_subtitle").innerText = subtitle || "";

    const bodyContainer = document.getElementById("info_panel_body");
    const moreButton = document.getElementById("info_panel_more");
    bodyContainer.innerHTML = "";
    moreButton.hidden = !fullText;
    moreButton.textContent = "See more";
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

    const gallery = document.getElementById("info_panel_gallery");
    gallery.innerHTML = "";

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
    const summary = document.getElementById("info_panel_summary");
    const fullText = document.getElementById("info_panel_full_text");
    const moreButton = document.getElementById("info_panel_more");
    if (!summary || !fullText || !moreButton) return;

    const expanded = moreButton.textContent === "See more";
    summary.hidden = expanded;
    fullText.hidden = !expanded;
    moreButton.textContent = expanded ? "Show less" : "See more";
}

function closeInfoPanel() {
    stopTTS();
    document.getElementById("info_panel_backdrop").style.display = "none";
    document.getElementById("info_panel_modal").style.display = "none";
}

window.showInfoPanel = showInfoPanel;
window.closeInfoPanel = closeInfoPanel;
window.toggleInfoTextDetails = toggleInfoTextDetails;

const imagePopupState = {
    images: [],
    imageIndex: 0,
    captions: [],
    galleryTitle: 'Museum image',
    scale: 1,
    x: 0,
    y: 0,
    pointerStartX: 0,
    pointerStartY: 0,
    imageStartX: 0,
    imageStartY: 0,
    dragging: false,
};

const imagePopupElements = {};

function initImagePopup() {
    imagePopupElements.backdrop = document.getElementById('image_popup_backdrop');
    imagePopupElements.modal = document.getElementById('image_popup_modal');
    imagePopupElements.image = document.getElementById('image_popup_image');
    imagePopupElements.zoomIn = document.getElementById('image_popup_zoom_in');
    imagePopupElements.zoomOut = document.getElementById('image_popup_zoom_out');
    imagePopupElements.close = document.getElementById('image_popup_close');
    imagePopupElements.previous = document.getElementById('image_popup_previous');
    imagePopupElements.next = document.getElementById('image_popup_next');
    imagePopupElements.counter = document.getElementById('image_popup_counter');
    imagePopupElements.caption = document.getElementById('image_popup_caption');

    if (!imagePopupElements.image || !imagePopupElements.backdrop) return;

    imagePopupElements.backdrop.addEventListener('click', hideImagePopup);
    imagePopupElements.modal.addEventListener('click', (event) => event.stopPropagation());
    imagePopupElements.close.addEventListener('click', hideImagePopup);
    imagePopupElements.zoomIn.addEventListener('click', () => adjustImagePopupZoom(1.2));
    imagePopupElements.zoomOut.addEventListener('click', () => adjustImagePopupZoom(1 / 1.2));
    imagePopupElements.previous.addEventListener('click', () => changeImagePopup(-1));
    imagePopupElements.next.addEventListener('click', () => changeImagePopup(1));
    imagePopupElements.image.addEventListener('pointerdown', startImageDrag);
    window.addEventListener('pointermove', moveImageDrag);
    window.addEventListener('pointerup', stopImageDrag);
    imagePopupElements.backdrop.addEventListener('wheel', handleImageWheel, { passive: false });
}

function updateImagePopupTransform() {
    if (!imagePopupElements.image) return;
    imagePopupElements.image.style.transform = `translate(${imagePopupState.x}px, ${imagePopupState.y}px) scale(${imagePopupState.scale})`;
}

function resetImagePopupTransform() {
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
    if (!imagePopupState.dragging) return;
    event.preventDefault();
    const dx = event.clientX - imagePopupState.pointerStartX;
    const dy = event.clientY - imagePopupState.pointerStartY;
    imagePopupState.x = imagePopupState.imageStartX + dx;
    imagePopupState.y = imagePopupState.imageStartY + dy;
    updateImagePopupTransform();
}

/* End dragging the popup image and restore cursor state. */
function stopImageDrag() {
    if (!imagePopupState.dragging) return;
    imagePopupState.dragging = false;
    if (imagePopupElements.image) {
        imagePopupElements.image.style.cursor = 'grab';
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
    const { images, imageIndex } = imagePopupState;
    const imageSrc = images[imageIndex];

    if (imageSrc && !/^https?:\/\//i.test(imageSrc)) {
        const storageKey = imageSrc.replace(/^images\//, '');
        fetchAssetPublicUrl('image', 'cloudflare', storageKey, imageSrc)
            .then((assetUrl) => {
                if (imagePopupState.images[imagePopupState.imageIndex] === imageSrc) {
                    imagePopupElements.image.src = assetUrl;
                }
            });
    } else {
        imagePopupElements.image.src = imageSrc;
    }

    imagePopupElements.counter.textContent = `${imageIndex + 1} / ${images.length}`;
    const storageKey = imageSrc?.replace(/^images\//, '');
    const databaseCaption = imageAssetInfo.get(storageKey)?.title
        || imageAssetInfo.get(storageKey)?.description;
    const caption = imagePopupState.captions[imageIndex]
        || databaseCaption
        || `${imagePopupState.galleryTitle} — Image ${imageIndex + 1}`;
    imagePopupElements.caption.textContent = caption;
    imagePopupElements.previous.hidden = images.length < 2;
    imagePopupElements.next.hidden = images.length < 2;
    resetImagePopupTransform();
}

function changeImagePopup(direction) {
    if (imagePopupState.images.length < 2) return;
    imagePopupState.imageIndex = (imagePopupState.imageIndex + direction + imagePopupState.images.length) % imagePopupState.images.length;
    updateImagePopupGallery();
}

/* Open the image popup and load the provided image source or gallery. */
function showImagePopup(imageSrc, imageSources, captions = [], galleryTitle = 'Museum image') {
    closeAllModals();
    if (!imagePopupElements.backdrop || !imagePopupElements.modal || !imagePopupElements.image) return;

    imagePopupState.images = Array.isArray(imageSources) && imageSources.length
        ? imageSources
        : [imageSrc];
    imagePopupState.captions = Array.isArray(captions) ? captions : [];
    imagePopupState.galleryTitle = galleryTitle;
    imagePopupState.imageIndex = Math.max(0, imagePopupState.images.indexOf(imageSrc));
    updateImagePopupGallery();
    imagePopupElements.backdrop.style.display = 'block';
    imagePopupElements.modal.style.display = 'flex';
}

/* Close the image popup and hide its backdrop. */
function hideImagePopup() {
    if (!imagePopupElements.backdrop || !imagePopupElements.modal) return;
    imagePopupElements.backdrop.style.display = 'none';
    imagePopupElements.modal.style.display = 'none';
}

window.showImagePopup = showImagePopup;
window.hideImagePopup = hideImagePopup;
window.show_image_popup = showImagePopup;
window.hide_image_popup = hideImagePopup;

function showBattleVideo() {
    closeAllModals();
    const backdrop = document.getElementById('battle_video_backdrop');
    const modal = document.getElementById('battle_video_modal');
    const video = document.getElementById('battle_video');
    if (!backdrop || !modal || !video) return;

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

    if (backgroundMusic && !backgroundMusic.paused && musicEnabled) {
        backgroundMusic.pause();
        musicPausedByVideo = true;
    }
    backdrop.style.display = 'block';
    modal.style.display = 'block';
    video.currentTime = 0;
}

function hideBattleVideo() {
    const backdrop = document.getElementById('battle_video_backdrop');
    const modal = document.getElementById('battle_video_modal');
    const video = document.getElementById('battle_video');
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
    const video = document.getElementById('battle_video');
    if (!video) return;
    video.currentTime = Math.min(video.duration || Infinity, video.currentTime + seconds);
}

window.showBattleVideo = showBattleVideo;
window.hideBattleVideo = hideBattleVideo;
window.skipBattleVideo = skipBattleVideo;

window.addEventListener('load', initImagePopup);
window.addEventListener('keydown', handleGlobalKeyDown);

/* Global keyboard handler to close any open modal on Escape or Backspace.
   Prevents default navigation behavior when a modal is open.
*/
function handleGlobalKeyDown(event) {
    const key = event.key;
    if (key !== 'Escape' && key !== 'Backspace' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;

    const textModal = document.getElementById('text_modal_card');
    const infoModal = document.getElementById('info_panel_modal');
    const imageModal = document.getElementById('image_popup_modal');
    const model3dModal = document.getElementById('model3d_modal');
    const battleVideoModal = document.getElementById('battle_video_modal');

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
    if (typeof stopTTS === 'function') stopTTS();
    document.getElementById("text_backdrop").style.display = "none";
    document.getElementById("text_modal_card").style.display = "none";
    document.getElementById("info_panel_backdrop").style.display = "none";
    document.getElementById("info_panel_modal").style.display = "none";
    if (typeof clearGLBModel === "function") clearGLBModel();
    hideImagePopup();
    hideBattleVideo();
}

let currentUtterance = null;
let activePlayBtnId = null;
let activeStopBtnId = null;

/* Toggle Text-To-Speech playback for a modal/card.
    - If speech is active: pause/resume accordingly.
    - If not active: build the text from container title/subtitle/body and start speaking.
    Also manages background music pause/resume to avoid audio overlap.
*/
function toggleTTS(containerId, playBtnId, stopBtnId) {
    const synth = window.speechSynthesis;

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

    const title = container.querySelector('h2, [id$="_title"]')?.innerText || '';
    const subtitle = container.querySelector('[id$="_subtitle"]')?.innerText || '';
    const bodyText = container.querySelector('[id$="_body"], [id$="_description"], [id$="_summary"]')?.innerText || '';

    const fullTextToRead = `${title}. ${subtitle}. ${bodyText}`.trim();
    if (!fullTextToRead) return;

    activePlayBtnId = playBtnId;
    activeStopBtnId = stopBtnId;

    currentUtterance = new SpeechSynthesisUtterance(fullTextToRead);
    currentUtterance.rate = 0.95;

    currentUtterance.onstart = function () {
        document.getElementById(playBtnId).innerText = "⏸ Pause";
        document.getElementById(stopBtnId).style.display = "inline-flex";
    };

    currentUtterance.onend = function () {
        resetTTSUI();
    };

    currentUtterance.onerror = function () {
        resetTTSUI();
    };

    synth.speak(currentUtterance);
}

/* Stop any active TTS and restore UI and background music state. */
function stopTTS() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    resumeBackgroundMusicAfterTTS();
    resetTTSUI();
}

function resetTTSUI() {
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

embedpano({ xml: "tour.xml", passQueryParameters: "startscene,startlookat", consolelog: true });
