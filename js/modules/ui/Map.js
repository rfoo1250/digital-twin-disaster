import CONFIG from '../../config.js';
import {
    getCountyGeoData,
    loadGEEClippedLayer,
    getGEEUrl,
    startForestDataExport,
    checkForestDataStatus,
    getCurrentGEEForestGeoJSON,
    setCurrentCountyNameAndStateAbbr,
    getCurrentCountyKey
} from '../services/DataManager.js';
import { runWildfireSimulation } from '../services/APIClient.js';
import { fipsToState } from '../../utils/constants.js';
import { showToast } from '../../utils/toast.js';

let map, countyLayer, forestLayer;
let selectedCounty = null;
let isFocused = false;

function init() {
    console.log('[INFO] Initializing Leaflet map...');

    map = L.map('map').setView(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM);

    L.tileLayer(CONFIG.TILE_LAYER_URL, {
        attribution: CONFIG.TILE_LAYER_ATTRIBUTION,
    }).addTo(map);

    const countyData = getCountyGeoData();
    if (countyData) {
        countyLayer = L.geoJSON(countyData, {
            style: defaultCountyStyle,
            onEachFeature: onEachCountyFeature,
        }).addTo(map);
    }

    setupLayerToggles();
    setupButtons();

    console.log('[INFO] Leaflet map initialized successfully.');
}

/* ---------- Styles ---------- */
const defaultCountyStyle = { color: '#333', weight: 1, opacity: 0.6, fillOpacity: 0 };
const highlightCountyStyle = { color: '#111', weight: 3, opacity: 0.95, fillOpacity: 0.08 };
const dimCountyStyle = { color: '#999', weight: 0.5, opacity: 0.2, fillOpacity: 0 };

/* ---------- County interactivity ---------- */
function onEachCountyFeature(feature, layer) {
    layer.on('click', () => {
        selectedCounty = layer;
        isFocused = false;

        const name = feature.properties.NAME || 'Unknown';
        let stateCode = '';
        if (feature.properties.STATE) {
            const code = feature.properties.STATE.toString().padStart(2, '0');
            stateCode = fipsToState[code] || code;
        }

        updateCountyLabel(`Selected: ${name}${stateCode ? ', ' + stateCode : ''}`);

        countyLayer.eachLayer((l) => {
            if (l === layer) l.setStyle(highlightCountyStyle);
            else l.setStyle(defaultCountyStyle);
        });
    });
}

/* ---------- Fetch and display GEE layer when focused ---------- */
async function handleCountySelectionForGEE(feature) {
    try {
        const countyName = feature.properties.NAME || 'Unknown';
        let stateAbbr = '';
        if (feature.properties.STATE) {
            const fipsCode = feature.properties.STATE.toString().padStart(2, '0');
            stateAbbr = fipsToState[fipsCode] || fipsCode;
        }
        if (countyName === 'Unknown' || stateAbbr === '') {
            showToast('Cannot identify selected county. Please try again.', true);
            return;
        }

        console.log(`[INFO] Initiating GEE tasks for: ${countyName}, ${stateAbbr}`);
        
        // should go hand in hand
        setCurrentCountyNameAndStateAbbr(countyName, stateAbbr);

        await Promise.all([
            loadGEEClippedLayer(feature.geometry),
            startForestDataExport(feature.geometry)
        ]);

        console.log('[INFO] GEE tasks initiated.');

        const url = getGEEUrl();
        if (!url) {
            console.warn('[GEE WARN] No URL returned.');
            showToast('No forest layer available.');
            return;
        }
        if (forestLayer) {
            try { map.removeLayer(forestLayer); } catch { }
            forestLayer = null;
        }
        forestLayer = L.tileLayer(url, {
            attribution: 'Google Earth Engine — County forest cover',
            opacity: CONFIG.DEFAULT_FOREST_OPACITY,
        });
        forestLayer.on('tileload', e => console.log(`[FOREST DEBUG] Loaded: ${e.tile.src}`));
        const forestCheckbox = document.getElementById('toggle-forest');
        if (isFocused && forestCheckbox && forestCheckbox.checked) {
            forestLayer.addTo(map);
            showToast('Forest cover loaded for focused county.');
        } else {
            console.log('[GEE DEBUG] Forest layer cached but not added (focus or toggle inactive).');
        }
    } catch (error) {
        console.error('[GEE ERROR] Failed to load forest layer:', error);
        showToast('Failed to load forest layer.', true);
    }
}

/* ---------- Buttons for focus/reset ---------- */
function setupButtons() {
    const focusBtn = document.getElementById('focus-on-county');
    const resetBtn = document.getElementById('reset-focus');
    const startWildfireSimBtn = document.getElementById('start-wildfire-sim'); // <-- Your new button

    if (focusBtn) {
        focusBtn.addEventListener('click', async () => {
            if (!selectedCounty) {
                showToast('Please click a county first.', true);
                return;
            }

            const bounds = selectedCounty.getBounds();
            map.flyToBounds(bounds, {
                padding: CONFIG.MAP_COUNTY_PADDING,
                duration: CONFIG.MAP_FLY_DURATION
            });

            isFocused = true;

            countyLayer.eachLayer((l) => {
                if (l === selectedCounty) l.setStyle(highlightCountyStyle);
                else l.setStyle(dimCountyStyle);
            });

            const forestCheckbox = document.getElementById('toggle-forest');
            if (forestCheckbox && forestCheckbox.checked) {
                await handleCountySelectionForGEE(selectedCounty.feature);
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map.flyTo(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM, {
                duration: CONFIG.MAP_FLY_DURATION
            });

            selectedCounty = null;
            isFocused = false;

            countyLayer.eachLayer((l) => l.setStyle(defaultCountyStyle));
            updateCountyLabel('No county selected');
            showToast('Reset to default view.');

            if (forestLayer) {
                try { map.removeLayer(forestLayer); } catch { }
                forestLayer = null;
            }
        });
    }

    if (startWildfireSimBtn) {
        startWildfireSimBtn.addEventListener('click', async () => {
            console.log('[INFO] "Start Simulation" clicked. Checking forest data status...');
            
            // Call the on-demand check function from DataManager
            const status = await checkForestDataStatus();

            switch (status) {
                case 'COMPLETED':
                    // SUCCESS!
                    const filePath = getCurrentGEEForestGeoJSON();
                    console.log(`[INFO] Forest data is ready at: ${filePath}. Starting simulation...`);
                    showToast('Forest data is ready. Starting simulation...', false); // false = not an error

                    const response = runWildfireSimulation(getCurrentCountyKey());
                    if (response) {
                        console.log('[INFO] Wildfire simulation response:', response);
                    }

                    // --- As requested, placeholder for simulation start ---
                    // startActualSimulation(filePath); 
                    // ----------------------------------------------------
                    break;

                case 'PROCESSING':
                    // NOT DONE YET
                    console.warn('[WARN] Forest data is not ready. Still processing.');
                    showToast('Forest data is still being processed. Please wait.', true); // true = isError
                    break;

                case 'FAILED':
                    // FAILED
                    console.error('[ERROR] Forest data export failed.');
                    showToast('Forest data export failed. Please try again.', true); // true = isError
                    break;
                
                case 'NONE':
                    // NOT EVEN STARTED
                    console.warn('[WARN] Forest data export was never started.');
                    showToast('Please select and focus on a county to prepare data first.', true); // true = isError
                    break;

                default:
                    // UNKNOWN
                    console.error(`[ERROR] Unknown forest data status: ${status}`);
                    showToast('An unknown error occurred. Check console.', true);
            }
        });
    }
}

/* ---------- Layer toggles ---------- */
function setupLayerToggles() {
    const countyCheckbox = document.getElementById('toggle-counties');
    if (countyCheckbox) {
        countyCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) countyLayer.addTo(map);
            else map.removeLayer(countyLayer);
        });
    }

    const forestCheckbox = document.getElementById('toggle-forest');
    if (forestCheckbox) {
        forestCheckbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                if (!selectedCounty) {
                    showToast('Select a county first.', true); // Pass true for isError
                    return;
                }
                if (!isFocused) {
                    showToast('Focus on the county first to load forest cover.', true); // Pass true for isError
                    return;
                }
                await handleCountySelectionForGEE(selectedCounty.feature);
            } else if (forestLayer) {
                try { map.removeLayer(forestLayer); } catch { }
            }
        });
    }
}

/* ---------- Label ---------- */
function updateCountyLabel(text) {
    const container = document.getElementById('county_selected_text');
    if (!container) return;

    container.textContent = text;
    container.classList.add('label-flash');

    setTimeout(() => {
        container.classList.remove('label-flash');
    }, CONFIG.COUNTY_LABEL_FLASH_DURATION);
}

export default { init };