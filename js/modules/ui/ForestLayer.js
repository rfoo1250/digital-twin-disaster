// ForestLayer.js
// Handles GeoTIFF forest cover loading, masking, and GEE fallback

import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import CONFIG from "../../config.js";
import {
    loadGEEClippedLayer,
    startForestDataExport,
    getGEEUrl,
    setCurrentCountyNameAndStateAbbr,
    getCurrentCountyKey
} from "../services/DataManager.js";
import { fipsToState } from "../../utils/constants.js";
import { showToast } from "../../utils/toast.js";
import MapCore from "./MapCore.js";

let forestLayer = null;
let geoRaster = null;
let geotiffLoaded = false;

async function handleCountySelectionForGEE(feature) {
    const map = MapCore.getMap();
    if (!map) return;

    try {
        const countyName = feature.properties.NAME || "Unknown";
        let stateAbbr = "";

        if (feature.properties.STATE) {
            const fipsCode = feature.properties.STATE.toString().padStart(2, "0");
            stateAbbr = fipsToState[fipsCode] || fipsCode;
        }

        if (countyName === "Unknown" || !stateAbbr) {
            showToast("Cannot identify selected county.", true);
            return;
        }

        setCurrentCountyNameAndStateAbbr(countyName, stateAbbr);

        const countyKey = getCurrentCountyKey();
        const geotiffUrl = `${CONFIG.API_BASE_URL}${CONFIG.GEOTIFF_URL}ForestCover_${countyKey}_2024.tif`;

        // Try to load the local GeoTIFF first
        try {
            const headResponse = await fetch(geotiffUrl, { method: "HEAD" });
            if (headResponse.ok) {
                const resp = await fetch(geotiffUrl);
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
                        const val = values[0];
                        return val === 1 ? "rgba(0,150,0,0.9)" : "rgba(0,0,0,0)";
                    },
                    mask: feature.geometry
                }).addTo(map);

                showToast("Forest GeoTIFF loaded successfully.");
                geotiffLoaded = true;
            }
        } catch (err) {
            console.warn("[WARN] Local GeoTIFF load failed:", err);
        }

        // Fallback: Use GEE tiles
        if (!geotiffLoaded) {
            await Promise.all([
                loadGEEClippedLayer(feature.geometry),
                startForestDataExport(feature.geometry)
            ]);

            const tileUrl = getGEEUrl();
            if (tileUrl) {
                const tileLayer = L.tileLayer(tileUrl, {
                    opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                    attribution: "GEE Forest Cover"
                });

                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = tileLayer.addTo(map);
                showToast("Loaded GEE forest layer (fallback).");
            } else {
                showToast("Failed to load forest layer.", true);
            }
        }

    } catch (error) {
        console.error("[GEE ERROR]", error);
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