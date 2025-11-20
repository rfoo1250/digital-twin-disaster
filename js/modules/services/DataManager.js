import CONFIG from '../../config.js';
import { appState, setState } from '../state.js';
import {
    runWildfireSimulation,
    getGEEClippedLayer,
    startForestExport,
    checkExportStatus
} from './ApiClient.js';
import { showToast } from '../../utils/toast.js';

async function loadAllData() {
    try {
        const response = await fetch(CONFIG.COUNTY_GEOJSON_URL);
        const countiesGeo = await response.json();

        setState('allData', { countiesGeo });
        setState('isDataLoaded', true);

        console.log('[INFO] DataManager: County GeoJSON loaded successfully.');
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load base data.', error);
    }
}

async function loadWildfireSimulation({ countyKey, igniPointLat, igniPointLon }) {
    try {
        const response = await runWildfireSimulation(countyKey, igniPointLat, igniPointLon);
        if (!response) {
            console.warn('[WARN] No wildfire simulation response received.');
            return;
        }


        if (response.success && response.output_dir) {
            setState('wildfireOutputDir', response.output_dir);
            console.log(`[INFO] Wildfire simulation completed for ${countyKey}. Output directory: ${response.output_dir}`);
            showToast(`Wildfire simulation complete. Output saved to ${response.output_dir}`, false);
        } else {
            console.warn('[WARN] Wildfire simulation returned an error or missing output_dir:', response.message);
            showToast(`Wildfire simulation error: ${response.message}`, true);
        }
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load wildfire simulation.', error);
        showToast('Failed to run wildfire simulation. See console for details.', true);
    }
}

async function loadGEEClippedLayer(geometry) {
    try {
        const url = await getGEEClippedLayer(geometry);
        if (!url) {
            console.warn('[WARN] No GEE URL received.');
            return;
        }

        setState('geeLayerUrl', url);
        console.log('[INFO] GEE layer URL stored in state:', url);
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load GEE layer.', error);
    }
}

/**
 * STEP 1: Starts the asynchronous GEE export task.
 * @param {Object} geometry - GeoJSON geometry for the export
 * @param {string} countyName - Name of the county (e.g., "Maricopa")
 * @param {string} stateAbbr - State abbreviation (e.g., "AZ")
 */
async function startForestDataExport(geometry) {
    try {
        const countyName = getCurrrentCountyName();
        const stateAbbr = getCurrentStateAbbr();
        const countyKey = getCurrentCountyKey();
        if (!countyKey) {
            // need fixing
            throw new Error("County key is undefined. Cannot start export.");
        }
        // Optimistically set a pending state
        setState('currentExportTask', { id: null, countyKey: countyKey, status: 'PENDING', localPath: null });

        const taskResponse = await startForestExport(geometry, countyName, stateAbbr);

        if (!taskResponse || !taskResponse.status) {
            throw new Error("Invalid response from start-export API.");
        }

        if (taskResponse.status === 'COMPLETED') {
            // CACHE HIT!
            console.log('[INFO] DataManager: Cache hit. File already exists at:', taskResponse.local_path);
            setState('currentGEEForestGeoJSON', taskResponse.local_path);
            setState('currentExportTask', {
                id: null, // No GEE task ID needed
                countyKey: taskResponse.filename_key,
                status: 'COMPLETED',
                localPath: taskResponse.local_path
            });
            showToast("Cached forest data loaded.", false);

        } else if (taskResponse.status === 'PROCESSING') {
            // CACHE MISS. Task is running.
            // This is where we link the GEE ID to our county key
            setState('currentExportTask', {
                id: taskResponse.task_id, // <-- GEE's ID (e.g., P7NDW...)
                countyKey: taskResponse.filename_key, // <-- Our key (e.g., Maricopa_AZ)
                status: 'PROCESSING',
                localPath: null
            });
            console.log(`[INFO] DataManager: Forest export started. Task ID: ${taskResponse.task_id} for ${taskResponse.filename_key}`);
            alert("Starting forest data export. This may take several minutes.");
        }

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to start forest export.', error);
        setState('currentExportTask', { id: null, countyKey: null, status: 'FAILED', localPath: null });
        alert("Failed to start the export task. See console for details.");
    }
}

/**
 * STEP 2: Checks the status of the ongoing export task (On-Demand).
 */
async function checkForestDataStatus() {
    const task = appState.currentExportTask;
    // TODO: should change this to current selected county
    // get countyKey, check if it matches, run

    if (!task || !task.status || task.status === 'NONE') {
        console.warn('[WARN] No export task is active. Cannot check status.');
        return 'NONE';
    }

    // If it's already done, just return
    if (task.status === 'COMPLETED') {
        return 'COMPLETED';
    }

    // If it's pending but has no GEE ID, it can't be checked
    if (task.status === 'PROCESSING' && !task.id) {
        console.error('[ERROR] Task is processing but has no GEE task ID to poll.');
        return 'FAILED';
    }

    console.log(`[INFO] DataManager: Checking status for task ${task.id} (${task.countyKey})`);

    try {
        const statusResponse = await checkExportStatus(task.id, task.countyKey); // Poll using GEE's ID

        if (!statusResponse) throw new Error("No response from status check API.");

        switch (statusResponse.status) {
            case 'COMPLETED':
                console.log('[INFO] DataManager: Export complete. Local path:', statusResponse.local_path);
                // Save the final file path
                setState('currentGEEForestGeoJSON', statusResponse.local_path);
                // Update the task state to COMPLETED
                setState('currentExportTask', {
                    ...task,
                    status: 'COMPLETED',
                    localPath: statusResponse.local_path
                });
                return 'COMPLETED';

            case 'PROCESSING':
                console.log('[INFO] DataManager: Export is still processing.');
                setState('currentExportTask', { ...task, status: 'PROCESSING' });
                return 'PROCESSING';

            case 'FAILED':
                console.error('[ERROR] DataManager: Forest export task failed:', statusResponse.error);
                setState('currentExportTask', { ...task, status: 'FAILED' });
                return 'FAILED';

            default:
                console.warn('[WARN] DataManager: Unknown task status:', statusResponse.status);
                return 'UNKNOWN';
        }

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to check export status.', error);
        setState('currentExportTask', { ...task, status: 'FAILED' });
        return 'FAILED';
    }
}

function setCurrentCountyNameAndStateAbbr(countyName, stateAbbr) {
    setState('currentCountyName', countyName);
    setState('currentStateAbbr', stateAbbr);
}

function getCurrrentCountyName() {
    return appState.currentCountyName || null;
}

function getCurrentStateAbbr() {
    return appState.currentStateAbbr || null;
}

function getCurrentCountyKey() {
    if (!getCurrrentCountyName() || !getCurrentStateAbbr()) return null;
    return `${getCurrrentCountyName()}_${getCurrentStateAbbr()}`;
}

function getCountyGeoData() {
    return appState.allData?.countiesGeo || null;
}

function getWildfireData() {
    return appState.wildfireData || null;
}

function getGEEUrl() {
    return appState.geeLayerUrl || null;
}

function getCurrentGEEForestGeoJSON() {
    return appState.currentGEEForestGeoJSON || null;
}

function getForestExportStatus() {
    return appState.currentExportTask || { id: null, status: 'NONE', localPath: null };
}

export {
    loadAllData,
    loadWildfireSimulation,
    loadGEEClippedLayer,
    startForestDataExport,
    checkForestDataStatus,
    getCountyGeoData,
    getWildfireData,
    getGEEUrl,
    getCurrentGEEForestGeoJSON,
    getForestExportStatus,
    setCurrentCountyNameAndStateAbbr,
    getCurrrentCountyName,
    getCurrentStateAbbr,
    getCurrentCountyKey
};
