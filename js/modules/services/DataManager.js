/**
 * DataManager.js — Leaflet version (no D3)
 * ---------------------------------------------
 * Loads GeoJSON county/state boundaries for use in the wildfire map.
 */

import { appState, setState } from '../state.js';
import { runWildfireSimulation } from './ApiClient.js';

/**
 * Loads U.S. county/state boundaries as GeoJSON (from public CDN)
 */
async function loadAllData() {
    try {
        // Use pre-converted GeoJSON instead of TopoJSON
        const countiesUrl = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";
        const response = await fetch(countiesUrl);
        const countiesGeo = await response.json();

        const allData = { countiesGeo };
        setState('allData', allData);
        setState('isDataLoaded', true);

        console.log('[INFO] DataManager: County GeoJSON loaded successfully.');
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load base data.', error);
    }
}

/**
 * Fetch wildfire simulation data from backend and store it in state.
 */
async function loadWildfireSimulation(params) {
    try {
        const response = await runWildfireSimulation(params);
        if (!response) {
            console.warn('[WARN] No wildfire simulation response received.');
            return;
        }

        setState('wildfireData', response);
        console.log('[INFO] Wildfire simulation data stored in state.');
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load wildfire simulation.', error);
    }
}

/**
 * Getter utilities
 */
function getCountyGeoData() {
    return appState.allData?.countiesGeo || null;
}

function getWildfireData() {
    return appState.wildfireData || null;
}

export { loadAllData, loadWildfireSimulation, getCountyGeoData, getWildfireData };
