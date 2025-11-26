// WildfireSimulationLayer.js
// Handles wildfire simulation frame loading, animation

import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import CONFIG from "../../config.js";
import MapCore from "./MapCore.js";
import ForestLayer from "./ForestLayer.js";
import { showToast } from "../../utils/toast.js";
import { getCurrentCountyKey } from "../services/DataManager.js";

let wildfireFrames = [];
let wildfireAnimTimer = null;

let WILDFIRE_ANIMATION_INTERVAL = 2000; // milliseconds

async function loadWildfireFrames(outputDir) {
    const map = MapCore.getMap();
    const selectedCounty = MapCore.getSelectedCounty();
    if (!map || !selectedCounty) return;

    // Cleanup old frames
    stopAnimation();
    wildfireFrames.forEach(layer => {
        try { map.removeLayer(layer); } catch {}
    });
    wildfireFrames = [];

    let timestep = 0;
    const maxTimesteps = 100;
    const baseUrl = `${CONFIG.API_BASE_URL}/${outputDir}`;

    while (timestep < maxTimesteps) {
        const rasterUrl = `${baseUrl}/wildfire_t_${timestep.toString().padStart(3, "0")}.tif`;

        try {
            const headResp = await fetch(rasterUrl, { method: "HEAD" });
            if (!headResp.ok) break;

            const resp = await fetch(rasterUrl);
            const arrayBuffer = await resp.arrayBuffer();
            const simGeoRaster = await parseGeoraster(arrayBuffer);

            const frameLayer = new GeoRasterLayer({
                georaster: simGeoRaster,
                pane: "wildfireSimPane",
                opacity: 0,
                resolution: 256,
                pixelValuesToColorFn: function(values) {
                    const val = values[0];
                    switch (val) {
                        case 2: return "rgba(255,165,0,0.9)"; // orange
                        case 3: return "rgba(255,0,0,0.9)";   // red
                        default: return "rgba(0,0,0,0)";
                    }
                },
                mask: selectedCounty.feature.geometry
            });

            frameLayer.addTo(map);
            wildfireFrames.push(frameLayer);
            timestep++;
        } catch (err) {
            console.error(`[ERROR] Failed to load frame ${timestep}:`, err);
            break;
        }
    }

    if (wildfireFrames.length === 0) {
        showToast("No wildfire frames found.", true);
        return false;
    }

    // Ensure correct ordering
    const forestLayer = ForestLayer.getForestLayer();
    if (forestLayer && map.hasLayer(forestLayer)) forestLayer.bringToFront();
    const countyLayer = MapCore.getCountyLayer();
    if (countyLayer) countyLayer.bringToFront();

    return true;
}

function startAnimation() {
    const map = MapCore.getMap();
    if (!map || wildfireFrames.length === 0) return;

    stopAnimation(); // Reset any existing animation

    wildfireFrames.forEach(frame => frame.setOpacity(0));

    let currentFrame = 0;
    wildfireFrames[0].setOpacity(0.95);

    wildfireAnimTimer = setInterval(() => {
        currentFrame++;

        if (currentFrame >= wildfireFrames.length) {
            stopAnimation();
            showToast("Wildfire simulation complete.");
            return;
        }

        wildfireFrames[currentFrame - 1].setOpacity(0);
        wildfireFrames[currentFrame].setOpacity(0.95);
    }, WILDFIRE_ANIMATION_INTERVAL);
}

function stopAnimation() {
    if (wildfireAnimTimer) {
        clearInterval(wildfireAnimTimer);
        wildfireAnimTimer = null;
    }
}

function resetSimulation() {
    const map = MapCore.getMap();
    if (!map) return;

    stopAnimation();
    wildfireFrames.forEach(frame => {
        try { map.removeLayer(frame); } catch {}
    });
    wildfireFrames = [];
}

export default {
    loadWildfireFrames,
    startAnimation,
    stopAnimation,
    resetSimulation,
    getFrames: () => wildfireFrames
};
