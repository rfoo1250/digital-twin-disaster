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

        const lonPad = (lonMax - lonMin) * padding;
        const latPad = (latMax - latMin) * padding;

        return [
        [lonMin - lonPad, latMin - latPad],
        [lonMax + lonPad, latMax + latPad]
        ];
    }

    // Default bounds (Colorado)
    return [[-109.06, 36.99], [-102.04, 41.00]];
}

/**
 * Initializes a Leaflet map as background for the wildfire simulation container.
 * Inserts the map behind the canvas and fits it to the bounding box.
 */
function loadMapBackground({ container, canvas, bbox }) {
    if (!container || !bbox) {
        console.error("Missing container or bbox for Leaflet map.");
        return;
    }

    // Create a background div for Leaflet that matches the overlay container
    const overlayParent = canvas.parentElement; // typically #wildfire-overlay

    // Remove existing map if present
    let existingMapDiv = overlayParent.querySelector('.wildfire-map-layer');
    if (existingMapDiv) {
    existingMapDiv.remove();
    }

    const mapDiv = document.createElement('div');
    mapDiv.className = 'wildfire-map-layer';
    mapDiv.style.position = 'absolute';
    mapDiv.style.top = '0';
    mapDiv.style.left = '0';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    mapDiv.style.zIndex = 0;
    mapDiv.style.pointerEvents = 'none'; // allow canvas mouse events
    overlayParent.insertBefore(mapDiv, canvas);
    
    // Compute center from bbox
    const centerLat = (bbox[0][1] + bbox[1][1]) / 2;
    const centerLon = (bbox[0][0] + bbox[1][0]) / 2;

    // Initialize Leaflet map inside wildfire container
    const map = L.map(mapDiv, {
        center: [centerLat, centerLon],
        zoom: 10,
        zoomControl: false,
        attributionControl: false,
        interactive: false, // disables dragging, zoom, etc.
    });
    // Force all Leaflet panes to z-index 0 to stay behind canvas
    Object.values(map.getPanes()).forEach(pane => pane.style.zIndex = 0);

    // Add satellite tiles from MapTiler
    L.tileLayer(`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${apiKey}`, {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        attribution:
        '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ' +
        '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
        crossOrigin: true
    }).addTo(map);

    // Fit to bbox
    const bounds = L.latLngBounds(
        [bbox[0][1], bbox[0][0]],
        [bbox[1][1], bbox[1][0]]
    );
    map.fitBounds(bounds);

    // Prevent user interactions
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();

    console.log("Leaflet map inserted as wildfire background.");
    return { map, mapDiv };
}


export { computeBoundingBox, loadMapBackground };
