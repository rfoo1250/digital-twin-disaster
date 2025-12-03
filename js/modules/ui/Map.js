// Map.js
// High-level orchestrator connecting MapCore, ForestLayer, IgnitionManager, and WildfireSimulationLayer

import MapCore from "./MapCore.js";
import ForestLayer from "./ForestLayer.js";
import IgnitionManager from "./IgnitionManager.js";
import WildfireSimulationLayer from "./WildfireSimulationLayer.js";
import { showToast } from "../../utils/toast.js";
import {
    loadWildfireSimulation,
    getCurrentCountyKey
} from "../services/DataManager.js";
import CONFIG from "../../config.js";

// Internal state
let isFocused = false;

function init() {
    MapCore.init();
    setupButtons();
    setupLayerToggles();
    // restoreIgnitionPointIfAny();
}

// ---------------- BUTTON SETUP ----------------
function setupButtons() {
    const focusBtn = document.getElementById("focus-on-county");
    const resetBtn = document.getElementById("reset-focus");
    const setIgnitionBtn = document.getElementById("set-ignition-point");
    const removeIgnitionBtn = document.getElementById("remove-ignition-point");
    const startSimBtn = document.getElementById("start-wildfire-sim");

    if (focusBtn) {
        focusBtn.addEventListener("click", async () => {
            const selected = MapCore.getSelectedCounty();
            const map = MapCore.getMap();

            if (!selected) return showToast("Please select a county.", true);

            map.flyToBounds(selected.getBounds(), {
                padding: [40, 40],
                duration: 1.5
            });

            // Highlight county
            MapCore.getCountyLayer().eachLayer((l) => {
                if (l === selected) l.setStyle(MapCore.highlightCountyStyle);
                else l.setStyle(MapCore.dimCountyStyle);
            });

            // Auto-load forest if enabled
            const forestToggle = document.getElementById("toggle-forest");
            if (forestToggle && forestToggle.checked) {
                await ForestLayer.handleCountySelectionForGEE(selected.feature);
            }

            isFocused = true;
            updateButtonStates();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            const map = MapCore.getMap();

            map.flyTo([37.8, -96], 4, { duration: 1.2 });
            isFocused = false;
            MapCore.setSelectedCounty(null);

            // Restore county styles
            MapCore.getCountyLayer().eachLayer(l => l.setStyle(MapCore.defaultCountyStyle));

            // Clear layers
            ForestLayer.resetForest();
            WildfireSimulationLayer.resetSimulation();
            IgnitionManager.removeIgnitionPoint();

            showToast("Reset to default view.");
            updateButtonStates();
        });
    }

    if (setIgnitionBtn) {
        setIgnitionBtn.addEventListener("click", () => {
            if (!isFocused) return showToast("Please focus on a county first.", true);
            IgnitionManager.enableIgnitionSelection();
        });
    }

    if (removeIgnitionBtn) {
        removeIgnitionBtn.addEventListener("click", () => {
            IgnitionManager.removeIgnitionPoint();
            updateButtonStates();
        });
    }

    if (startSimBtn) {
        startSimBtn.addEventListener("click", async () => {
            const ignition = JSON.parse(localStorage.getItem("ignitionPoint"));
            const selected = MapCore.getSelectedCounty();
            if (!ignition) return showToast("Please set an ignition point first.", true);
            if (!selected) return showToast("Please select a county first.", true);

            showToast("Loading wildfire simulation...");

            const countyKey = getCurrentCountyKey();
            if (!countyKey) return showToast("Missing county key.", true);

            // --- REAL CALL (future) ---
            const response = await loadWildfireSimulation({
                countyKey,
                igniPointLat: ignition.lat,
                igniPointLon: ignition.lng
            });

            // --- TEST RESPONSE (current) ---
            // const response = {
            //     success: true,
            //     // output_dir: `wildfire_output/sim_run_Door_WI_20251126_111442`
            //     output_dir: `wildfire_output/sim_run_Door_WI_20251121_150709`
            //     // output_dir: `wildfire_output/sim_run_Door_WI_20251121_134457`
            // };

            if (!response.success) return showToast("Simulation failed.", true);

            const loaded = await WildfireSimulationLayer.loadWildfireFrames(response.output_dir);
            if (loaded) {
                showToast("Starting animation...");

                // Wrap animation to detect completion
                const frames = WildfireSimulationLayer.getFrames();
                const totalFrames = frames.length;

                let checkFinished = null;

                // Start animation
                WildfireSimulationLayer.startAnimation();

                // Poll until animation is done
                // checkFinished = setInterval(() => {
                //     const lastFrame = frames[totalFrames - 1];

                //     // Real opacity value (Leaflet mutates _opacity internally)
                //     const lastOpacity = lastFrame._opacity;
                //     if (lastOpacity === CONFIG.DEFAULT_WILDFIRE_OPACITY) {
                //         clearInterval(checkFinished);
                //         enableTimestepControls();
                //     }
                // }, 500);
                enableTimestepControls();
            }

        });
    }

    // ---------------- WILDFIRE TIMESTEP CONTROLS ----------------
    const timestepPanel = document.getElementById("wildfire-timestep-controls");
    const timestepValueLabel = document.getElementById("timestep-value");
    const timestepLeftBtn = document.getElementById("timestep-left");
    const timestepRightBtn = document.getElementById("timestep-right");

    // Internal UI state
    let currentTimestep = 0;
    let maxTimestep = 0;

    // Called only after animation finishes
    function enableTimestepControls() {
        const frames = WildfireSimulationLayer.getFrames();
        if (!frames || frames.length === 0) return;

        maxTimestep = frames.length - 1; // last index
        currentTimestep = maxTimestep;   // animation finished at final frame

        // Show panel
        timestepPanel.style.display = "block";

        updateTimestepControlsUI();
    }

    // Update UI state — disables / enables arrows
    function updateTimestepControlsUI() {
        timestepValueLabel.textContent = currentTimestep;

        // Disable left button at timestep 0
        timestepLeftBtn.disabled = currentTimestep <= 0;
        // Disable right button at max timestep
        timestepRightBtn.disabled = currentTimestep >= maxTimestep;
    }

    // Move to a specific timestep (no animation)
    function showTimestep(ts) {
        const frames = WildfireSimulationLayer.getFrames();
        if (!frames || frames.length === 0) return;
        
        // Hide all frames
        frames.forEach(f => f.setOpacity(0));

        // Show the selected frame
        frames[ts].setOpacity(CONFIG.DEFAULT_WILDFIRE_OPACITY);

        // Force Leaflet to refresh rendering
        const map = MapCore.getMap();
        const c = map.getCenter();
        map.setView(c, map.getZoom(), { animate: false });
        
        currentTimestep = ts;
        updateTimestepControlsUI();
    }

    // Arrow button events
    if (timestepLeftBtn) {
        timestepLeftBtn.addEventListener("click", () => {
            if (currentTimestep > 0) {
                showTimestep(currentTimestep - 1);
            }
        });
    }

    if (timestepRightBtn) {
        timestepRightBtn.addEventListener("click", () => {
            if (currentTimestep < maxTimestep) {
                showTimestep(currentTimestep + 1);
            }
        });
    }


    updateButtonStates();
}

// ---------------- TOGGLES ----------------
function setupLayerToggles() {
    const countyToggle = document.getElementById("toggle-counties");
    const forestToggle = document.getElementById("toggle-forest");
    const wildfireToggle = document.getElementById("toggle-wildfire");

    const map = MapCore.getMap();

    if (countyToggle) {
        countyToggle.addEventListener("change", (e) => {
            if (e.target.checked) MapCore.getCountyLayer().addTo(map);
            else map.removeLayer(MapCore.getCountyLayer());
        });
    }

    if (forestToggle) {
        forestToggle.addEventListener("change", async (e) => {
            const selected = MapCore.getSelectedCounty();
            if (e.target.checked) {
                if (!selected) return showToast("Please select a county first.", true);
                if (!isFocused) return showToast("Please focus on the county first.", true);
                await ForestLayer.handleCountySelectionForGEE(selected.feature);
            } else {
                const layer = ForestLayer.getForestLayer();
                if (layer) map.removeLayer(layer);
            }
        });
    }

    if (wildfireToggle) {
        wildfireToggle.addEventListener("change", (e) => {
            const frames = WildfireSimulationLayer.getFrames();

            // No wildfire simulation yet?
            // if (!frames || frames.length === 0) {
            //     showToast("Run a wildfire simulation first.", true);
            //     wildfireToggle.checked = false; // revert toggle
            //     return;
            // }

            // Toggle frames
            frames.forEach(frame => {
                if (e.target.checked) frame.addTo(map);
                else map.removeLayer(frame);
            });
        });
    }

}

// ---------------- STATE RESTORE ----------------
// function restoreIgnitionPointIfAny() {
//     const map = MapCore.getMap();
//     const saved = localStorage.getItem("ignitionPoint");
//     if (!saved) return;

//     const { lat, lng } = JSON.parse(saved);
//     const marker = L.marker([lat, lng], { pane: "markerPane" }).addTo(map);
//     showToast("Restored ignition point.");

//     if (typeof updateButtonStates === "function") updateButtonStates();
// }

// ---------------- BUTTON STATE ----------------
function updateButtonStates() {
    const setIgnBtn = document.getElementById("set-ignition-point");
    const removeIgnBtn = document.getElementById("remove-ignition-point");
    const startSimBtn = document.getElementById("start-wildfire-sim");

    const hasIgnition = localStorage.getItem("ignitionPoint") !== null;

    if (setIgnBtn) setIgnBtn.disabled = !isFocused;
    if (removeIgnBtn) removeIgnBtn.disabled = !hasIgnition || !isFocused;
    if (startSimBtn) startSimBtn.disabled = !hasIgnition || !isFocused;
}

window.updateButtonStates = updateButtonStates;

export default { init };