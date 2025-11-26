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
let WILDFIRE_FRAME_TIMEOUT = 100;   // milliseconds

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
                // resolution: 256,
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

            // Add a promise to track when layer is fully ready
            frameLayer._readyPromise = new Promise((resolve) => {
                frameLayer.on('load', () => {
                    console.log(`[DEBUG] Frame ${timestep} loaded and ready`);
                    resolve();
                });
            });

            frameLayer.addTo(map);
            console.log(`[DEBUG] Frame ${timestep} added to map`);
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

    console.log(`[DEBUG] Starting animation with ${wildfireFrames.length} frames`);
    stopAnimation(); // Reset any existing animation

    wildfireFrames.forEach(frame => frame.setOpacity(0));
    let currentFrame = 0;
    
    // Function to show a frame with proper rendering
    const showFrame = async (frameIndex) => {
        console.log(`[DEBUG] Attempting to show frame ${frameIndex}`);
        
        const frame = wildfireFrames[frameIndex];
        
        // Wait for the layer to be ready if it has a ready promise
        if (frame._readyPromise) {
            console.log(`[DEBUG] Waiting for frame ${frameIndex} to be ready...`);
            await frame._readyPromise;
            console.log(`[DEBUG] Frame ${frameIndex} is ready!`);
        }
        
        // Try removing and re-adding the layer
        console.log(`[DEBUG] Removing and re-adding frame ${frameIndex}`);
        map.removeLayer(frame);
        map.addLayer(frame);
        
        // Set opacity
        frame.setOpacity(CONFIG.DEFAULT_WILDFIRE_OPACITY);
        console.log(`[DEBUG] Frame ${frameIndex} opacity set to ${CONFIG.DEFAULT_WILDFIRE_OPACITY}`);
        
        // Force multiple types of redraws
        if (frame._layer) {
            console.log(`[DEBUG] Calling redraw on frame ${frameIndex}._layer`);
            frame._layer.redraw();
        }
        
        // Try to access and manipulate the canvas directly
        if (frame._layer && frame._layer._canvas) {
            console.log(`[DEBUG] Forcing canvas style update for frame ${frameIndex}`);
            const canvas = frame._layer._canvas;
            canvas.style.opacity = CONFIG.DEFAULT_WILDFIRE_OPACITY;
            // Force a reflow
            canvas.offsetHeight;
        }
        
        // Force map refresh
        const center = map.getCenter();
        const zoom = map.getZoom();
        map.setView(center, zoom, { animate: false });
        console.log(`[DEBUG] Map view reset for frame ${frameIndex}`);
        
        // Additional fallback
        map.invalidateSize();
        console.log(`[DEBUG] Map size invalidated for frame ${frameIndex}`);
        
        // Try panBy with 0,0 to force a render
        map.panBy([0, 0]);
        console.log(`[DEBUG] Map panBy(0,0) called for frame ${frameIndex}`);
    };
    
    // Show first frame
    console.log(`[DEBUG] Scheduling first frame display`);
    showFrame(0).then(() => {
        console.log(`[DEBUG] First frame displayed successfully`);
    }).catch(err => {
        console.error(`[ERROR] Failed to show first frame:`, err);
    });

    wildfireAnimTimer = setInterval(() => {
        currentFrame++;
        console.log(`[DEBUG] Timer tick - advancing to frame ${currentFrame}`);

        if (currentFrame >= wildfireFrames.length) {
            console.log(`[DEBUG] Animation complete`);
            stopAnimation();
            showToast("Wildfire simulation complete.");
            return;
        }

        console.log(`[DEBUG] Hiding frame ${currentFrame - 1}`);
        wildfireFrames[currentFrame - 1].setOpacity(0);
        
        showFrame(currentFrame).catch(err => {
            console.error(`[ERROR] Failed to show frame ${currentFrame}:`, err);
        });
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