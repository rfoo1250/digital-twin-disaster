// IgnitionManager.js
// Handles user interactions for selecting and removing an ignition point

import * as turf from "@turf/turf";
import { showToast } from "../../utils/toast.js";
import MapCore from "./MapCore.js";
import ForestLayer from "./ForestLayer.js";

let isSettingIgnitionPoint = false;
let ignitionMarker = null;
let onMapClickHandler = null;

function enableIgnitionSelection() {
    const map = MapCore.getMap();
    const selectedCounty = MapCore.getSelectedCounty();

    if (!map) return;
    if (!selectedCounty) {
        showToast("Focus on a county first.", true);
        return;
    }

    isSettingIgnitionPoint = true;
    showToast("Click on a forest pixel within the selected county.");

    if (onMapClickHandler) map.off("click", onMapClickHandler);

    onMapClickHandler = (e) => handleMapClick(e, selectedCounty);
    map.on("click", onMapClickHandler);
}

async function handleMapClick(e, countyLayer) {
    if (!isSettingIgnitionPoint) return;

    const map = MapCore.getMap();
    const geoRaster = ForestLayer.getGeoRaster();

    if (!geoRaster) {
        showToast("Forest GeoTIFF not loaded.", true);
        return;
    }

    const { lat, lng } = e.latlng;
    const point = turf.point([lng, lat]);
    const inside = turf.booleanPointInPolygon(point, countyLayer.feature);

    if (!inside) {
        showToast("Click inside the selected county.", true);
        return;
    }

    // Convert lat/lng to raster pixel coordinates
    try {
        const x = Math.floor((lng - geoRaster.xmin) / geoRaster.pixelWidth);
        const y = Math.floor((geoRaster.ymax - lat) / Math.abs(geoRaster.pixelHeight));

        if (y < 0 || y >= geoRaster.height || x < 0 || x >= geoRaster.width) {
            showToast("Point outside GeoTIFF bounds.", true);
            return;
        }

        const val = geoRaster.values[0][y][x];

        if (val !== 1) {
            showToast("That point is not a forest pixel.", true);
            return;
        }

        placeIgnitionMarker(lat, lng);
    } catch (err) {
        console.error("[IGNITION ERROR]", err);
        showToast("Error reading pixel value.", true);
    }
}

function placeIgnitionMarker(lat, lng) {
    const map = MapCore.getMap();
    if (!map) return;

    if (ignitionMarker) map.removeLayer(ignitionMarker);

    ignitionMarker = L.marker([lat, lng], { pane: "markerPane" }).addTo(map);

    localStorage.setItem("ignitionPoint", JSON.stringify({ lat, lng }));
    showToast(`Ignition point set at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`);

    stopIgnitionSelection();

    // update UI buttons in Map
    if (window && typeof window.updateButtonStates === "function") {
        window.updateButtonStates();
    }
}

function stopIgnitionSelection() {
    const map = MapCore.getMap();
    if (!map) return;

    isSettingIgnitionPoint = false;
    if (onMapClickHandler) map.off("click", onMapClickHandler);
    onMapClickHandler = null;
}

function removeIgnitionPoint() {
    const map = MapCore.getMap();
    if (!map) return;

    if (ignitionMarker) {
        map.removeLayer(ignitionMarker);
        ignitionMarker = null;
        localStorage.removeItem("ignitionPoint");
        showToast("Ignition point removed.");
        // update UI buttons in Map
        if (window && typeof window.updateButtonStates === "function") {
            window.updateButtonStates();
        }
    } else {
        showToast("No ignition point to remove.", true);
    }
}

function getIgnitionMarker() {
    return ignitionMarker;
}

export default {
    enableIgnitionSelection,
    stopIgnitionSelection,
    removeIgnitionPoint,
    getIgnitionMarker
};
