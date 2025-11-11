// Map.js

import CONFIG from '../../config.js';
import { getCountyGeoData, loadGEEClippedLayer, getGEEUrl } from '../services/DataManager.js';
import { fipsToState } from '../../utils/constants.js';
import { showToast } from '../../utils/toast.js';

/**
 * I will handle the double click function to zoom in on a county when clicked myself
 * 
 * caching the forest layer tile layer is a good idea too
 * 
 */

let map, countyLayer, forestLayer;
let selectedCounty = null;
let isFocused = false;
const GEE_TIFF_BASE_URL = CONFIG.GEE_TIFF_BASE_URL;

function init() {
    console.log('[INFO] Initializing Leaflet map...');

    // map = L.map('map').setView([37.8, -96], 4);
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
        isFocused = false; // reset focus whenever user changes county

        const name = feature.properties.NAME || 'Unknown';
        let stateCode = '';
        if (feature.properties.STATE) {
            const code = feature.properties.STATE.toString().padStart(2, '0');
            stateCode = fipsToState[code] || code;
        }

        updateCountyLabel(`Selected: ${name}${stateCode ? ', ' + stateCode : ''}`);
        // console.log(`[COUNTY DEBUG] Selected: ${name}`);

        countyLayer.eachLayer((l) => {
            if (l === layer) l.setStyle(highlightCountyStyle);
            else l.setStyle(defaultCountyStyle);
        });
    });
}

/* ---------- Fetch and display GEE layer when focused ---------- */
async function handleCountySelectionForGEE(feature) {
    try {
        await loadGEEClippedLayer(feature.geometry);
        const geeUrlOrFile = getGEEUrl();

        if (!geeUrlOrFile) {
            console.warn('[GEE WARN] No URL or GeoTIFF file info available.');
            showToast('No layer information found.');
            return;
        }

        // Remove any existing layer
        if (forestLayer) {
            try { map.removeLayer(forestLayer); } catch { }
            forestLayer = null;
        }

        // Build expected GeoTIFF file path (e.g., /data/geotiffs/county_06037.tif)
        let tiffPath = geeUrlOrFile.endsWith('.tif')
            ? `${GEE_TIFF_BASE_URL}${geeUrlOrFile}`
            : `${GEE_TIFF_BASE_URL}${geeUrlOrFile}.tif`;

        console.log(`[GEE INFO] Checking for GeoTIFF at: ${tiffPath}`);

        let tiffLoaded = false;
        try {
            const headResp = await fetch(tiffPath, { method: 'HEAD' });
            if (headResp.ok) {
                console.log('[GEE INFO] GeoTIFF file found, loading...');
                const resp = await fetch(tiffPath);
                const buffer = await resp.arrayBuffer();
                const georaster = await parseGeoraster(buffer);

                forestLayer = new GeoRasterLayer({
                    georaster,
                    opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                    pixelValuesToColorFn: (values) => {
                        const val = values[0];
                        if (val === null) return null;
                        // simple palette mapping: low values -> brown, high -> green
                        const g = Math.min(255, Math.max(0, val));
                        return `rgb(${255 - g}, ${g}, 80)`;
                    },
                });

                forestLayer.addTo(map);
                showToast('GeoTIFF layer loaded locally.');
                tiffLoaded = true;
            } else {
                console.log('[GEE INFO] GeoTIFF not found, falling back to GEE tile URL.');
            }
        } catch (err) {
            console.warn('[GEE WARN] GeoTIFF fetch failed, falling back to GEE tile.', err);
        }

        if (!tiffLoaded) {
            console.log('[GEE INFO] Loading dynamic GEE layer...');
            const tileUrl = geeUrlOrFile.startsWith('http')
                ? geeUrlOrFile
                : await getGEEUrl();

            if (!tileUrl) {
                console.warn('[GEE WARN] No GEE tile URL found.');
                showToast('No layer available.');
                return;
            }

            forestLayer = L.tileLayer(tileUrl, {
                attribution: 'Google Earth Engine — dynamic tiles',
                opacity: CONFIG.DEFAULT_FOREST_OPACITY,
            });

            if (isFocused) {
                forestLayer.addTo(map);
                showToast('Dynamic GEE layer loaded.');
            } else {
                console.log('[GEE DEBUG] Layer cached but not added (not focused).');
            }
        }

    } catch (error) {
        console.error('[GEE ERROR] Failed to load GEE/GeoTIFF layer:', error);
        showToast('Error loading map layer.');
    }
}

/* ---------- Buttons for focus/reset ---------- */
function setupButtons() {
    const focusBtn = document.getElementById('focus-on-county');
    const resetBtn = document.getElementById('reset-focus');

    if (focusBtn) {
        focusBtn.addEventListener('click', async () => {
            if (!selectedCounty) {
                alert('Please click a county first.');
                return;
            }

            const bounds = selectedCounty.getBounds();
            map.flyToBounds(
                bounds, 
                { padding: CONFIG.MAP_COUNTY_PADDING, duration: CONFIG.MAP_FLY_DURATION });
            // console.log('[COUNTY DEBUG] Focused on selected county.');
            isFocused = true;

            countyLayer.eachLayer((l) => {
                if (l === selectedCounty) l.setStyle(highlightCountyStyle);
                else l.setStyle(dimCountyStyle);
            });

            // Only load forest data if toggle is ON
            const forestCheckbox = document.getElementById('toggle-forest');
            if (forestCheckbox && forestCheckbox.checked) {
                await handleCountySelectionForGEE(selectedCounty.feature);
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map.flyTo(
                CONFIG.MAP_DEFAULT_CENTER, 
                CONFIG.MAP_DEFAULT_ZOOM, 
                { duration: CONFIG.MAP_FLY_DURATION }
            );
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
                    showToast('Select a county first.');
                    return;
                }
                if (!isFocused) {
                    showToast('Focus on the county first to load forest cover.');
                    return;
                }
                await handleCountySelectionForGEE(selectedCounty.feature);
            } else {
                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch { }
                }
            }
        });
    }
}

/* ---------- Label ---------- */
function updateCountyLabel(text) {
    const container = document.getElementById('county_selected_text');
    if (!container) return;

    container.textContent = text;

    // Add a "highlight" class briefly to draw attention
    container.classList.add('label-flash');

    // Remove it after 2 seconds (or whatever duration you want)
    setTimeout(() => {
        container.classList.remove('label-flash');
    }, CONFIG.COUNTY_LABEL_FLASH_DURATION);
}

export default { init };
