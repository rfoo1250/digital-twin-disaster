/**
 * app.js
 * ---------------------------------------------
 * Entry point for the Wildfire Simulation frontend.
 * Initializes the map UI and connects it to the backend API.
 */

import Map from './modules/ui/Map.js';
// import Wildfire from './modules/ui/Wildfire.js';
import { loadAllData } from './modules/services/DataManager.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[INFO] Wildfire Simulation App Initializing...');

    try {
        // Load required data (topo or any shared data used by wildfire)
        await loadAllData();
        console.log('[INFO] Data loaded successfully.');

        // Initialize the Leaflet map and interaction logic
        Map.init();
        // Wildfire.init();

        console.log('[INFO] Wildfire Simulation App Initialized Successfully.');

    } catch (err) {
        console.error('[ERROR] App initialization failed:', err);
        alert('Failed to initialize the wildfire simulation. See console for details.');
    }
});
