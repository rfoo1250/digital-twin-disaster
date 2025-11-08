// js/modules/ui/WildfireMapLayer.js
// Map layer module for the wildfire simulation.
// Handles static map background loading and boundary computation.

/**
 * TODO:
 * rename this damn file name
 * move api to api client
 * handle data in datamaanger
 */

// Vars
// const apiKey = "SH2x3RGMiI6d11eXYZuX"; // API key moved internal to module
const apiKey = "JpoaHlHUOI1nu8GvzUc0"; // API key moved internal to module

/**
 * Computes a bounding box from forest feature data with optional padding
 * @param {Object} forestFeature - GeoJSON forest feature
 * @param {number} padding - Padding percentage (0.1 = 10% padding)
 * @returns {Array<Array<number>>} [[minLon, minLat], [maxLon, maxLat]]
 */
function computeBoundingBox(forestFeature, padding = 0.1) {
    if (forestFeature?.geometry?.coordinates?.[0]) {
        const coords = forestFeature.geometry.coordinates[0];
        const lons = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);

        const lonMin = Math.min(...lons);
        const lonMax = Math.max(...lons);
        const latMin = Math.min(...lats);
        const latMax = Math.max(...lats);

        // Add padding relative to bounds size
        const lonPad = (lonMax - lonMin) * padding;
        const latPad = (latMax - latMin) * padding;

        return [
            [lonMin - lonPad, latMin - latPad],
            [lonMax + lonPad, latMax + latPad]
        ];
    }
    
    // Default bounds (Colorado)
    // TODO: change this dynamic future
    return [[-109.06, 36.99], [-102.04, 41.00]];
}

/**
 * Fetches a static map from MapTiler based on a geographic bounding box
 * and sets it as the background for the given container.
 * @param {object} options
 * @param {HTMLElement} options.container - The container to apply the background to.
 * @param {HTMLCanvasElement} options.canvas - The canvas (to get dimensions from).
 * @param {Array<Array<number>>} options.bbox - The bounding box as [[minLon, minLat], [maxLon, maxLat]].
 */
async function loadMapBackground({ container, canvas, bbox }) {
    if (!container || !canvas || !bbox) {
        console.error("loadMapBackground: Missing container, canvas, or bbox.", { container, canvas, bbox });
        return false;
    }

    const width = canvas.width;
    const height = canvas.height;

    // Construct MapTiler URL for the given bbox and canvas size
    const bboxString = `${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]}`;
    const mapUrl = `https://api.maptiler.com/maps/satellite/static/${bboxString}/${width}x${height}.jpg?key=${apiKey}`;

    try {
        const img = new Image();
        const loadPromise = new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error("Failed to load map image"));
        });

        img.src = mapUrl;
        await loadPromise;

        // --- Ensure background image fits the canvas bounds exactly ---
        // Create or reuse a background <div> that matches the canvas dimensions
        let bgLayer = container.querySelector('.wildfire-bg-layer');
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.className = 'wildfire-bg-layer';
            bgLayer.style.position = 'absolute';
            bgLayer.style.top = canvas.offsetTop + 'px';
            bgLayer.style.left = canvas.offsetLeft + 'px';
            bgLayer.style.zIndex = 0;
            container.insertBefore(bgLayer, canvas); // ensure it's behind the canvas
        }

        // Match canvas pixel dimensions (not CSS width)
        bgLayer.style.width = `${canvas.width}px`;
        bgLayer.style.height = `${canvas.height}px`;
        bgLayer.style.backgroundImage = `url(${mapUrl})`;
        bgLayer.style.backgroundSize = `${canvas.width}px ${canvas.height}px`;
        bgLayer.style.backgroundPosition = 'center';
        bgLayer.style.backgroundRepeat = 'no-repeat';
        bgLayer.style.backgroundColor = '#1a1d1a';

        console.log("Map background aligned to canvas bounds successfully.");
        return true;
    } catch (e) {
        console.error("Error loading map background:", e);
        container.style.backgroundColor = "#1a1d1a";
        return false;
    }
}


export { computeBoundingBox, loadMapBackground };
