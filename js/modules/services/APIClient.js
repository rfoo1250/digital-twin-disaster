/**
 * APIClient.js
 * ---------------------------------------------
 * Handles communication between the frontend and backend Flask API
 * for the Wildfire Simulation and GEE operations.
 */

import CONFIG from '../../config.js';
// const LOCAL_API_BASE_URL = 'http://127.0.0.1:5000';

/**
* Run wildfire simulation based on a local GeoTIFF file.
* Expects countyKey, igniPointLat, and igniPointLon as query params.
* @param {string} countyKey - County key identifier
* @param {number} igniPointLat - Ignition latitude
* @param {number} igniPointLon - Ignition longitude
* @returns {Promise<Object|null>} - Parsed wildfire simulation response
*/
async function runWildfireSimulation(countyKey, igniPointLat, igniPointLon) {
    const query = new URLSearchParams({ countyKey, igniPointLat, igniPointLon }).toString();
    const wildfireSimEndpoint = `${CONFIG.API_BASE_URL}/simulate_wildfire?${query}`;


    try {
        console.log(`[INFO] Starting wildfire sim for countyKey=${countyKey}, lat=${igniPointLat}, lon=${igniPointLon}`);
        const response = await fetch(wildfireSimEndpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });


        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);


        const data = await response.json();
        if (data.success) {
            console.log(`[INFO] Simulation complete for ${countyKey}:`, data.output_dir);
        } else {
            console.warn('[WARN] Simulation returned with errors:', data.message);
        }
        return data;
    } catch (error) {
        console.error('[API Error] Wildfire Simulation:', error);
        alert('Error running wildfire simulation. See console for details.');
        return null;
    }
}

/**
 * Get a dynamic GEE layer URL.
 * Sends a GeoJSON geometry (e.g., a county) to the backend, which returns
 * a clipped Google Earth Engine tile URL for visualization.
 * @param {Object} geometry - GeoJSON geometry object (e.g., county)
 * @returns {Promise<string|null>} - Tile URL string
 */
async function getGEEClippedLayer(geometry) {
    const GEELayerEndpoint = `${CONFIG.API_BASE_URL}/get_layer`;
    try {
        const response = await fetch(GEELayerEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geometry }),
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (data.url) {
            console.log('[INFO] GEE tile URL retrieved:', data.url);
            return data.url;
        } else {
            console.warn('[WARN] No "url" field returned from backend.');
            return null;
        }
    } catch (error) {
        console.error('[API Error] GEE Layer Fetch:', error);
        alert('Error fetching GEE layer. Check console for details.');
        return null;
    }
}

/**
 * STEP 1: Start the GEE forest geometry export task.
 * @param {Object} geometry - GeoJSON geometry
 * @param {string} countyName - Name of the county
 * @param {string} stateAbbr - State abbreviation
 * @returns {Promise<Object|null>} - Task response object (e.g., {status, task_id, filename_key, local_path})
 */
async function startForestExport(geometry, countyName, stateAbbr) {
    const startExportEndpoint = `${CONFIG.API_BASE_URL}/start-export`;
    try {
        const response = await fetch(startExportEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send all info needed for caching
            body: JSON.stringify({ geometry, countyName, stateAbbr }),
        });

        // A 200 (OK) means a cache hit.
        // A 202 (Accepted) means the task is processing.
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('[API Error] Start Forest Export:', error);
        alert('Error starting forest data export. See console for details.');
        return null;
    }
}

/**
 * STEP 2: Check the status of the export task.
 * @param {string} taskId - The GEE-generated ID for the task (e.g., "P7NDW...")
 * @returns {Promise<Object|null>} - Status response object
 */
async function checkExportStatus(taskId, countyKey) {
    // We add the countyKey as a URL query parameter.
    const checkStatusEndpoint = `${CONFIG.API_BASE_URL}/check-status/${taskId}?countyKey=${countyKey}`;
    try {
        const response = await fetch(checkStatusEndpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('[API Error] Check Export Status:', error);
        return null;
    }
}

export {
    runWildfireSimulation,
    getGEEClippedLayer,
    startForestExport,
    checkExportStatus
};