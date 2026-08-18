let scene, camera, renderer, controls, currentModel;

const backgroundMusic = new Audio('music/Ibalong_Festival_Song-Drums-segment-0.00-256.65.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.35;
backgroundMusic.preload = 'auto';

let musicEnabled = false;
let musicPausedByTTS = false;

function updateKrpanoMusicIcon() {
    if (window.krpano && window.krpano.set) {
        try {
            const crop = musicEnabled ? '64|704|64|64' : '0|704|64|64';
            window.krpano.set('layer[skin_btn_music].crop', crop);
        } catch (error) {
            // ignore if the skin layer is not ready yet
        }
    }
}

function setMusicButtonState() {
    updateKrpanoMusicIcon();
    const musicButton = document.getElementById('music_control_button');
    if (!musicButton) return;
    musicButton.textContent = musicEnabled ? '♫ Music On' : '♫ Music Off';
    musicButton.classList.toggle('muted', !musicEnabled);
}

function pauseBackgroundMusicForTTS() {
    if (!backgroundMusic || backgroundMusic.paused || !musicEnabled) return;
    backgroundMusic.pause();
    musicPausedByTTS = true;
}

function resumeBackgroundMusicAfterTTS() {
    if (!musicEnabled || !musicPausedByTTS) return;
    musicPausedByTTS = false;
    backgroundMusic.play().catch(() => {});
}

function toggleBackgroundMusic() {
    musicEnabled = !musicEnabled;

    if (musicEnabled) {
        backgroundMusic.play().catch(() => {});
        musicPausedByTTS = false;
    } else {
        backgroundMusic.pause();
        musicPausedByTTS = false;
    }

    updateKrpanoMusicIcon();
    setMusicButtonState();
}

window.toggleBackgroundMusic = toggleBackgroundMusic;
window.addEventListener('pointerdown', () => {
    if (musicEnabled && !musicPausedByTTS) {
        backgroundMusic.play().catch(() => {});
    }
}, { once: true });

setMusicButtonState();

function initThreeJS() {
    const container = document.getElementById("threejs_container");
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    camera.position.set(0, 0, 3);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

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

function loadGLBModel(glbPath, texturePath) {
    closeAllModals();
    if (!renderer) initThreeJS();

    document.getElementById("model3d_backdrop").style.display = "block";
    document.getElementById("model3d_modal").style.display = "block";

    setTimeout(updateViewportDimensions, 50);

    if (currentModel) scene.remove(currentModel);

    let pngTexture = null;
    if (texturePath) {
        const textureLoader = new THREE.TextureLoader();
        pngTexture = textureLoader.load(texturePath, (tex) => {
            tex.flipY = false;
            if ('colorSpace' in tex) {
                tex.colorSpace = THREE.SRGBColorSpace;
            } else if ('encoding' in tex) {
                tex.encoding = THREE.sRGBEncoding;
            }
        });
    }

    const loader = new THREE.GLTFLoader();

    loader.load(
        glbPath,
        (gltf) => {
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
}

function toggle3DFullscreen() {
    const modal = document.getElementById("model3d_modal");
    modal.classList.toggle("fullscreen");
    setTimeout(updateViewportDimensions, 260);
}

function clearGLBModel() {
    document.getElementById("model3d_backdrop").style.display = "none";
    const modal = document.getElementById("model3d_modal");
    modal.style.display = "none";
    modal.classList.remove("fullscreen");
}

window.loadGLBModel = loadGLBModel;
window.clearGLBModel = clearGLBModel;
window.toggle3DFullscreen = toggle3DFullscreen;
window.show_3d_obj = loadGLBModel;

function showTextModal(title, subtitle, bodyText, introItalicText) {
    closeAllModals();

    document.getElementById("text_modal_title").innerText = title || "";
    document.getElementById("text_modal_subtitle").innerText = subtitle || "";

    const bodyContainer = document.getElementById("text_modal_body");
    bodyContainer.innerHTML = "";

    if (introItalicText) {
        const italicP = document.createElement("p");
        italicP.className = "text-italic-intro";
        italicP.innerText = introItalicText;
        bodyContainer.appendChild(italicP);
    }

    if (bodyText) {
        const mainP = document.createElement("div");
        mainP.innerText = bodyText;
        bodyContainer.appendChild(mainP);
    }

    document.getElementById("text_backdrop").style.display = "block";
    document.getElementById("text_modal_card").style.display = "block";
}

function closeTextModal() {
    stopTTS();
    document.getElementById("text_backdrop").style.display = "none";
    document.getElementById("text_modal_card").style.display = "none";
}

window.showTextModal = showTextModal;
window.closeTextModal = closeTextModal;

function createImageWrapper(imgSrc) {
    const wrapper = document.createElement("div");
    wrapper.className = "gallery-img-wrapper";

    const img = document.createElement("img");
    img.src = imgSrc;

    wrapper.appendChild(img);
    return wrapper;
}

function showInfoPanel(title, subtitle, bodyText, introItalic, imgMain, imgMid, imgBottom1, imgBottom2) {
    closeAllModals();

    document.getElementById("info_panel_title").innerText = title || "";
    document.getElementById("info_panel_subtitle").innerText = subtitle || "";

    const bodyContainer = document.getElementById("info_panel_body");
    bodyContainer.innerHTML = "";

    if (introItalic) {
        const italicP = document.createElement("p");
        italicP.className = "panel-italic-intro";
        italicP.innerText = introItalic;
        bodyContainer.appendChild(italicP);
    }

    if (bodyText) {
        const textDiv = document.createElement("div");
        textDiv.innerText = bodyText;
        bodyContainer.appendChild(textDiv);
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

function closeInfoPanel() {
    stopTTS();
    document.getElementById("info_panel_backdrop").style.display = "none";
    document.getElementById("info_panel_modal").style.display = "none";
}

window.showInfoPanel = showInfoPanel;
window.closeInfoPanel = closeInfoPanel;

const imagePopupState = {
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

    if (!imagePopupElements.image || !imagePopupElements.backdrop) return;

    imagePopupElements.backdrop.addEventListener('click', hideImagePopup);
    imagePopupElements.modal.addEventListener('click', (event) => event.stopPropagation());
    imagePopupElements.close.addEventListener('click', hideImagePopup);
    imagePopupElements.zoomIn.addEventListener('click', () => adjustImagePopupZoom(1.2));
    imagePopupElements.zoomOut.addEventListener('click', () => adjustImagePopupZoom(1 / 1.2));
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

function adjustImagePopupZoom(factor) {
    imagePopupState.scale *= factor;
    updateImagePopupTransform();
}

function startImageDrag(event) {
    event.preventDefault();
    imagePopupState.dragging = true;
    imagePopupState.pointerStartX = event.clientX;
    imagePopupState.pointerStartY = event.clientY;
    imagePopupState.imageStartX = imagePopupState.x;
    imagePopupState.imageStartY = imagePopupState.y;
    imagePopupElements.image.style.cursor = 'grabbing';
}

function moveImageDrag(event) {
    if (!imagePopupState.dragging) return;
    event.preventDefault();
    const dx = event.clientX - imagePopupState.pointerStartX;
    const dy = event.clientY - imagePopupState.pointerStartY;
    imagePopupState.x = imagePopupState.imageStartX + dx;
    imagePopupState.y = imagePopupState.imageStartY + dy;
    updateImagePopupTransform();
}

function stopImageDrag() {
    if (!imagePopupState.dragging) return;
    imagePopupState.dragging = false;
    if (imagePopupElements.image) {
        imagePopupElements.image.style.cursor = 'grab';
    }
}

function handleImageWheel(event) {
    if (!imagePopupElements.modal || imagePopupElements.modal.style.display === 'none') return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 / 1.15 : 1.15;
    adjustImagePopupZoom(delta);
}

function showImagePopup(imageSrc) {
    closeAllModals();
    if (!imagePopupElements.backdrop || !imagePopupElements.modal || !imagePopupElements.image) return;

    imagePopupElements.image.src = imageSrc;
    resetImagePopupTransform();
    imagePopupElements.backdrop.style.display = 'block';
    imagePopupElements.modal.style.display = 'flex';
}

function hideImagePopup() {
    if (!imagePopupElements.backdrop || !imagePopupElements.modal) return;
    imagePopupElements.backdrop.style.display = 'none';
    imagePopupElements.modal.style.display = 'none';
}

window.showImagePopup = showImagePopup;
window.hideImagePopup = hideImagePopup;
window.show_image_popup = showImagePopup;
window.hide_image_popup = hideImagePopup;

window.addEventListener('load', initImagePopup);
window.addEventListener('keydown', handleGlobalKeyDown);

function handleGlobalKeyDown(event) {
    const key = event.key;
    if (key !== 'Escape' && key !== 'Backspace') return;

    const textModal = document.getElementById('text_modal_card');
    const infoModal = document.getElementById('info_panel_modal');
    const imageModal = document.getElementById('image_popup_modal');
    const model3dModal = document.getElementById('model3d_modal');

    const isAnyOpen = [textModal, infoModal, imageModal, model3dModal].some(el => el && el.style.display !== 'none');
    if (!isAnyOpen) return;

    event.preventDefault();

    if (imageModal && imageModal.style.display !== 'none') hideImagePopup();
    if (infoModal && infoModal.style.display !== 'none') closeInfoPanel();
    if (textModal && textModal.style.display !== 'none') closeTextModal();
    if (model3dModal && model3dModal.style.display !== 'none') clearGLBModel();
}

function closeAllModals() {
    if (typeof stopTTS === 'function') stopTTS();
    document.getElementById("text_backdrop").style.display = "none";
    document.getElementById("text_modal_card").style.display = "none";
    document.getElementById("info_panel_backdrop").style.display = "none";
    document.getElementById("info_panel_modal").style.display = "none";
    if (typeof clearGLBModel === "function") clearGLBModel();
    hideImagePopup();
}

let currentUtterance = null;
let activePlayBtnId = null;
let activeStopBtnId = null;

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
    const bodyText = container.querySelector('[id$="_body"]')?.innerText || '';

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
