// ForestLayer.js
// Handles GeoTIFF forest cover loading, masking, and GEE fallback

import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import CONFIG from "../../config.js";
import {
    loadGEEClippedLayer,
    startForestDataExport,
    checkForestDataStatus,
    getCurrentGEEForestFileUrl,
    setCurrentCountyNameAndStateAbbr,
    getCurrentCountyKey
} from "../services/DataManager.js";
import { fipsToState } from "../../utils/constants.js";
import { showToast } from "../../utils/toast.js";
import { showLoader, hideLoader } from "../../utils/loader.js";
import MapCore from "./MapCore.js";

let forestLayer = null;
let geoRaster = null;
let geotiffLoaded = false;

async function handleCountySelectionForGEE(feature) {
    const map = MapCore.getMap();
    if (!map) return;

    showLoader("Loading forest data…");

    try {
        const countyName = feature.properties.NAME || "Unknown";
        let stateAbbr = "";

        if (feature.properties.STATE) {
            const fipsCode = feature.properties.STATE.toString().padStart(2, "0");
            stateAbbr = fipsToState[fipsCode] || fipsCode;
        }

        if (countyName === "Unknown" || !stateAbbr) {
            hideLoader();
            showToast("Cannot identify selected county.", true);
            return;
        }

        setCurrentCountyNameAndStateAbbr(countyName, stateAbbr);
        const countyKey = getCurrentCountyKey();

        // Reset previous state
        geotiffLoaded = false;
        if (forestLayer) {
            try { map.removeLayer(forestLayer); } catch (e) {}
            forestLayer = null;
        }
        geoRaster = null;

        // Construct served URL for the expected GeoTIFF
        const servedGeotiffUrl = `${CONFIG.API_BASE_URL}/exports/${encodeURIComponent(countyKey)}.tif`;

        // 1) Try local GeoTIFF first
        try {
            const headResp = await fetch(servedGeotiffUrl, { method: "HEAD" });
            if (headResp.ok) {
                const resp = await fetch(servedGeotiffUrl);
                if (!resp.ok) throw new Error(`Failed to fetch GeoTIFF: ${resp.status}`);
                const arrayBuffer = await resp.arrayBuffer();
                geoRaster = await parseGeoraster(arrayBuffer);

                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = new GeoRasterLayer({
                    georaster: geoRaster,
                    pane: "forestPane",
                    opacity: 1.0,
                    resolution: 128,
                    pixelValuesToColorFn: (values) => {
                        const v = values[0];
                        return v === 1 ? "rgba(0,150,0,0.9)" : "rgba(0,0,0,0)";
                    },
                    mask: feature.geometry
                }).addTo(map);

                geotiffLoaded = true;
                hideLoader();
                showToast("Forest layer map loaded successfully.");
                return;
            }
        } catch (err) {
            console.warn("[WARN] Local GeoTIFF not available or failed to load:", err);
        }

        // 2) Start export + show preview tiles while waiting
        // startForestDataExport initiates backend export and records task in DataManager
        await startForestDataExport(feature.geometry);

        // Try to get a preview tile (may be null)
        const tileUrl = await loadGEEClippedLayer(feature.geometry);
        let previewLayer = null;
        if (tileUrl) {
            previewLayer = L.tileLayer(tileUrl, {
                opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                attribution: "GEE Forest Cover"
            }).addTo(map);
        }

        // 3) Poll backend (via DataManager) until export completes or fails
        const MAX_ATTEMPTS = 120; // e.g., 10 minutes @ 5s
        const INTERVAL_MS = 5000;
        let attempts = 0;
        let finalStatus = null;

        while (attempts < MAX_ATTEMPTS) {
            attempts += 1;
            // checkForestDataStatus updates DataManager state and returns 'COMPLETED' | 'PROCESSING' | 'FAILED'
            const status = await checkForestDataStatus();
            if (status === "COMPLETED") {
                finalStatus = "COMPLETED";
                break;
            }
            if (status === "FAILED") {
                finalStatus = "FAILED";
                break;
            }
            // still processing — wait then loop
            await new Promise((res) => setTimeout(res, INTERVAL_MS));
        }

        // 4) Handle end of polling
        if (finalStatus === "COMPLETED") {
            // Get the served file URL from DataManager (preferred) or fallback to /exports/<countyKey>.tif
            const fileUrl = getCurrentGEEForestFileUrl() || servedGeotiffUrl;

            try {
                const resp = await fetch(fileUrl);
                if (!resp.ok) throw new Error(`Failed to fetch completed GeoTIFF: ${resp.status}`);
                const arrayBuffer = await resp.arrayBuffer();
                geoRaster = await parseGeoraster(arrayBuffer);

                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = new GeoRasterLayer({
                    georaster: geoRaster,
                    pane: "forestPane",
                    opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                    resolution: 128,
                    pixelValuesToColorFn: (values) => {
                        const v = values[0];
                        return v === 1 ? "rgba(0,150,0,0.9)" : "rgba(0,0,0,0)";
                    },
                    mask: feature.geometry
                }).addTo(map);

                geotiffLoaded = true;
                if (previewLayer) {
                    try { map.removeLayer(previewLayer); } catch {}
                }

                hideLoader();
                showToast("Forest layer map loaded successfully.");
                return;
            } catch (err) {
                console.error("[ERROR] Failed to download/parse final GeoTIFF:", err);
                if (previewLayer) {
                    hideLoader();
                    showToast("Preview available, but final GeoTIFF failed to load.", true);
                    return;
                } else {
                    hideLoader();
                    showToast("Failed to load forest layer.", true);
                    return;
                }
            }
        } else if (finalStatus === "FAILED") {
            if (previewLayer) {
                hideLoader();
                showToast("Export failed, showing preview (if available).", true);
                return;
            } else {
                hideLoader();
                showToast("Failed to generate forest GeoTIFF.", true);
                return;
            }
        } else {
            // timeout
            if (previewLayer) {
                hideLoader();
                showToast("Export is taking longer than expected; preview is shown.", false);
                return;
            } else {
                hideLoader();
                showToast("Timed out waiting for forest data.", true);
                return;
            }
        }

    } catch (error) {
        console.error("[GEE ERROR]", error);
        hideLoader();
        showToast("Error loading forest layer.", true);
    }
}

function getForestLayer() {
    return forestLayer;
}

function getGeoRaster() {
    return geoRaster;
}

function resetForest() {
    const map = MapCore.getMap();
    if (map && forestLayer) {
        try {
            map.removeLayer(forestLayer);
        } catch (err) {
            console.warn("Failed to remove forest layer:", err);
        }
    }

    forestLayer = null;
    geoRaster = null;
    geotiffLoaded = false;
}

export default {
    handleCountySelectionForGEE,
    getForestLayer,
    getGeoRaster,
    resetForest
};
