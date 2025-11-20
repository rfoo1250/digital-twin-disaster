// Updated Map.js
import * as turf from '@turf/turf';
import parseGeoraster from 'georaster';
import GeoRasterLayer from 'georaster-layer-for-leaflet';

import CONFIG from '../../config.js';
import {
    getCountyGeoData,
    loadWildfireSimulation,
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

let isFocused = false;
let isSettingIgnitionPoint = false;
let map, countyLayer, forestLayer;
let selectedCounty = null;
let ignitionMarker = null;
let geoRaster = null;
let onMapClickHandler = null;

function init() {
    console.log('[INFO] Initializing Leaflet map...');

    map = L.map('map').setView(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM);

    // Create custom panes for controlled layer ordering
    map.createPane('tilePane');     // default base tile pane
    map.createPane('forestPane');   // GeoTIFF raster layer pane
    map.createPane('overlayPane');  // vector polygons (default)
    map.createPane('markerPane');   // markers on top

    // Set z-index order (lower = below)
    map.getPane('tilePane').style.zIndex = 200;
    map.getPane('forestPane').style.zIndex = 300;
    map.getPane('overlayPane').style.zIndex = 400;
    map.getPane('markerPane').style.zIndex = 600;

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

const defaultCountyStyle = { color: '#333', weight: 1, opacity: 0.6, fillOpacity: 0 };
const highlightCountyStyle = { color: '#111', weight: 3, opacity: 0.95, fillOpacity: 0.08 };
const dimCountyStyle = { color: '#999', weight: 0.5, opacity: 0.2, fillOpacity: 0 };

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

        updateButtonStates();
    });
}


async function handleCountySelectionForGEE(feature) {
    try {
        const countyName = feature.properties.NAME || 'Unknown';
        let stateAbbr = '';
        if (feature.properties.STATE) {
            const fipsCode = feature.properties.STATE.toString().padStart(2, '0');
            stateAbbr = fipsToState[fipsCode] || fipsCode;
        }

        if (countyName === 'Unknown' || !stateAbbr) {
            showToast('Cannot identify selected county. Please try again.', true);
            return;
        }

        console.log(`[INFO] Initiating forest layer load for: ${countyName}, ${stateAbbr}`);
        setCurrentCountyNameAndStateAbbr(countyName, stateAbbr);

        const countyKey = getCurrentCountyKey();
        const geotiffUrl = `${CONFIG.API_BASE_URL}${CONFIG.GEOTIFF_URL}ForestCover_${countyKey}_2024.tif`;
        console.log(`[INFO] Checking for local GeoTIFF at: ${geotiffUrl}`);
        // Try to load local GeoTIFF first
        let geotiffLoaded = false;
        try {
            const headResponse = await fetch(geotiffUrl, { method: 'HEAD' });
            if (headResponse.ok) {
                console.log(`[INFO] Found local GeoTIFF for ${countyKey}: ${geotiffUrl}`);
                const response = await fetch(geotiffUrl);
                if (!response.ok) {
                    throw new Error(`GeoTIFF not found: ${response.statusText}`);
                }
                const contentType = response.headers.get('content-type');
                if (!contentType.includes('tiff')) {
                    console.warn('[WARN] Response is not a TIFF file:', contentType);
                    const text = await response.text();
                    console.log('Response preview:', text.slice(0, 200));
                }
                const arrayBuffer = await response.arrayBuffer();
                geoRaster = await parseGeoraster(arrayBuffer);

                // Remove old layer if present
                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                // Create a mask polygon from the current county geometry
                const countyMask = L.geoJSON(feature.geometry, {
                    style: { color: '#00FF00', weight: 2, opacity: 0.6, fillOpacity: 0 }
                });

                // Create the GeoTIFF layer clipped to county boundary
                forestLayer = new GeoRasterLayer({
                    georaster: geoRaster,
                    pane: 'forestPane', // draw below county borders
                    opacity: 1.0,
                    resolution: 128,
                    pixelValuesToColorFn: function(values) {
                        const val = values[0];
                        if (val === 1) return 'rgba(0, 150, 0, 0.9)'; // forest = green
                        return 'rgba(0, 0, 0, 0)'; // transparent
                    },
                    mask: feature.geometry
                }).addTo(map);

                // Re-apply border styling to ensure black outline stays on top
                countyLayer.eachLayer((l) => {
                    if (l === selectedCounty) {
                        l.bringToFront();
                        l.setStyle(highlightCountyStyle); // Black bold border
                    } else {
                        l.setStyle(dimCountyStyle);
                    }
                });

                // forestLayer.addTo(map);
                // countyMask.addTo(map);
                showToast('Forest GeoTIFF loaded successfully.');
                geotiffLoaded = true;
            } else {
                console.warn(`[WARN] No local GeoTIFF found for ${countyKey}, falling back to GEE.`);
            }
        } catch (err) {
            console.warn(`[WARN] Error loading local GeoTIFF for ${countyKey}:`, err);
        }

        // If GeoTIFF not found, fallback to GEE Tile URL
        if (!geotiffLoaded) {
            await Promise.all([
                loadGEEClippedLayer(feature.geometry),
                startForestDataExport(feature.geometry)
            ]);

            const tileUrl = getGEEUrl();
            if (tileUrl) {
                console.log(`[INFO] Using GEE tile URL for ${countyKey}: ${tileUrl}`);
                const tileLayer = L.tileLayer(tileUrl, {
                    opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                    attribution: 'GEE Forest Cover'
                });

                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = tileLayer.addTo(map);
                showToast('Loaded GEE forest layer (fallback).');
            } else {
                console.warn('[WARN] No valid GEE URL returned.');
                showToast('Failed to load any forest layer.', true);
            }
        }
    } catch (error) {
        console.error('[GEE ERROR] Failed to load forest layer:', error);
        showToast('Failed to load forest layer.', true);
    }
}

function setupButtons() {
    const focusBtn = document.getElementById('focus-on-county');
    const resetBtn = document.getElementById('reset-focus');
    const setIgnitionPointBtn = document.getElementById('set-ignition-point');
    const startWildfireSimBtn = document.getElementById('start-wildfire-sim');

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

            countyLayer.eachLayer((l) => {
                if (l === selectedCounty) l.setStyle(highlightCountyStyle);
                else l.setStyle(dimCountyStyle);
            });

            const forestCheckbox = document.getElementById('toggle-forest');
            if (forestCheckbox && forestCheckbox.checked) {
                await handleCountySelectionForGEE(selectedCounty.feature);
            }

            isFocused = true;
            updateButtonStates();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map.flyTo(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM, {
                duration: CONFIG.MAP_FLY_DURATION
            });

            selectedCounty = null;
            isFocused = false;
            updateButtonStates();

            countyLayer.eachLayer((l) => l.setStyle(defaultCountyStyle));
            updateCountyLabel('No county selected');
            showToast('Reset to default view.');

            if (forestLayer) {
                try { map.removeLayer(forestLayer); } catch { }
                forestLayer = null;
            }

            if (ignitionMarker) {
                try { map.removeLayer(ignitionMarker); } catch { }
                ignitionMarker = null;
            }

            localStorage.removeItem('ignitionPoint');
        });
    }

    if (setIgnitionPointBtn) {
        setIgnitionPointBtn.addEventListener('click', () => {
            if (!isFocused) {
                showToast('Focus on a county first.', true);
                return;
            }

            if (!isSettingIgnitionPoint) {
                isSettingIgnitionPoint = true;
                setIgnitionPointBtn.textContent = 'Cancel set point of ignition';
                showToast('Click on a forest pixel in the selected/focused county.');

                onMapClickHandler = async (e) => {
                    if (!isSettingIgnitionPoint) return;

                    const { lat, lng } = e.latlng;
                    const point = turf.point([lng, lat]);
                    const inside = turf.booleanPointInPolygon(point, selectedCounty.feature);

                    if (!inside) {
                        showToast('Please click inside the focused county.', true);
                        return;
                    }

                    if (!geoRaster) {
                        showToast('Forest GeoTIFF not loaded yet.', true);
                        return;
                    }

                    try {
                        const x = Math.floor((lng - geoRaster.xmin) / geoRaster.pixelWidth);
                        const y = Math.floor((geoRaster.ymax - lat) / Math.abs(geoRaster.pixelHeight));

                        if (y >= 0 && y < geoRaster.height && x >= 0 && x < geoRaster.width) {
                            const forestVal = geoRaster.values[0][y][x]; // 1 = forest, 0 = other

                            // might be something wrong with logic of focsuing and enabling buttons
                            // TODO: patch
                            if (forestVal === 1) {
                                // Remove old marker if present
                                if (ignitionMarker) map.removeLayer(ignitionMarker);

                                // Add new ignition marker
                                ignitionMarker = L.marker([lat, lng], { pane: 'markerPane' }).addTo(map);

                                // Save locally
                                localStorage.setItem('ignitionPoint', JSON.stringify({ lat, lng }));

                                showToast(`Ignition point set at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`);
                                
                                document.getElementById('set-ignition-point').disabled = false;
                                document.getElementById('start-wildfire-sim').disabled = false;

                                // Exit selection mode
                                isSettingIgnitionPoint = false;
                                setIgnitionPointBtn.textContent = 'Set point of ignition';
                                map.off('click', onMapClickHandler);
                            } else {
                                showToast('That point is not on a forest pixel.', true);
                            }
                        } else {
                            showToast('Clicked point outside GeoTIFF bounds.', true);
                        }
                    } catch (err) {
                        console.error('[IGNITION ERROR] Failed to read pixel value:', err);
                        showToast('Error reading GeoTIFF pixel value.', true);
                    }
                };


                map.on('click', onMapClickHandler);
            } else {
                // Cancel placing point
                isSettingIgnitionPoint = false;
                setIgnitionPointBtn.textContent = 'Set point of ignition';
                showToast('Cancelled ignition point selection.');
                if (onMapClickHandler) map.off('click', onMapClickHandler);
            }
        });
    }

    if (startWildfireSimBtn) {
        startWildfireSimBtn.addEventListener('click', async () => {
            if (startWildfireSimBtn.disabled) return;

            console.log('[INFO] "Start Simulation" clicked. Checking forest data status...');
            const status = await checkForestDataStatus();

            switch (status) {
                case 'COMPLETED':
                    const filePath = getCurrentGEEForestGeoJSON();
                    console.log(`[INFO] Forest data is ready at: ${filePath}. Starting simulation...`);
                    showToast('Forest data is ready. Starting simulation...', false);
                    const response = runWildfireSimulation(getCurrentCountyKey());
                    if (response) console.log('[INFO] Wildfire simulation response:', response);
                    break;
                case 'PROCESSING':
                    showToast('Forest data is still being processed. Please wait.', true);
                    break;
                case 'FAILED':
                    showToast('Forest data export failed. Please try again.', true);
                    break;
                case 'NONE':
                    showToast('Please select and focus on a county to prepare data first.', true);
                    break;
                default:
                    showToast('An unknown error occurred. Check console.', true);
            }
        });
    }

    updateButtonStates();
}

function updateButtonStates() {
    const setIgnitionPointBtn = document.getElementById('set-ignition-point');
    const startWildfireSimBtn = document.getElementById('start-wildfire-sim');

    const disabled = !isFocused;

    if (setIgnitionPointBtn) setIgnitionPointBtn.disabled = disabled;
    if (startWildfireSimBtn) startWildfireSimBtn.disabled = disabled;
}

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
                    showToast('Select a county first.', true);
                    return;
                }
                if (!isFocused) {
                    showToast('Focus on the county first to load forest cover.', true);
                    return;
                }
                await handleCountySelectionForGEE(selectedCounty.feature);
            } else if (forestLayer) {
                try { map.removeLayer(forestLayer); } catch { }
            }
        });
    }
}

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
