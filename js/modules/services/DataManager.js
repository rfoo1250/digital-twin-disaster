import CONFIG from '../../config.js';
import { appState, setState } from '../state.js';
import {
    runWildfireSimulation,
    getGEEClippedLayer,
    startForestExport,
    checkExportStatus
} from './ApiClient.js';
import { showToast } from '../../utils/toast.js';
import { showLoader, hideLoader } from "../../utils/loader.js";


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
            return { success: false };
        }

        if (response.success && response.output_dir) {
            setState('wildfireOutputDir', response.output_dir);
            console.log(`[INFO] Wildfire simulation completed for ${countyKey}. Output directory: ${response.output_dir}`);

            return response;
        } else {
            console.warn('[WARN] Wildfire simulation returned an error:', response.message);
            showToast(`Wildfire simulation error.`, true); // errors only
            return { success: false };
        }

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load wildfire simulation.', error);
        showToast('Failed to run wildfire simulation.', true);
        return { success: false };
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
        return url;
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
            throw new Error("County key is undefined. Cannot start export.");
        }

        setState('currentExportTask', { id: null, countyKey: countyKey, status: 'PENDING', localUrl: null });

        const taskResponse = await startForestExport(geometry, countyName, stateAbbr);

        if (!taskResponse || !taskResponse.status) {
            throw new Error("Invalid response from start-export API.");
        }

        // If backend says the file already exists, prefer a returned public URL (data.url)
        if (taskResponse.status === 'COMPLETED') {
            const fileUrl = taskResponse.url || taskResponse.local_path || `/exports/${taskResponse.filename_key}.tif`;

            console.log('[INFO] DataManager: Cache hit. File available at:', fileUrl);
            setState('currentGEEForestFileUrl', fileUrl);
            // Backwards compat (if other parts of code still expect this key)
            setState('currentGEEForestGeoJSON', fileUrl);

            setState('currentExportTask', {
                id: null,
                countyKey: taskResponse.filename_key,
                status: 'COMPLETED',
                localUrl: fileUrl
            });
            console.log("[INFO] Cached forest data loaded.");
            return;
        }

        // Processing started: record task id and key for polling
        if (taskResponse.status === 'PROCESSING') {
            setState('currentExportTask', {
                id: taskResponse.task_id,
                countyKey: taskResponse.filename_key,
                status: 'PROCESSING',
                localUrl: null
            });
            console.log(`[INFO] DataManager: Forest export started. Task ID: ${taskResponse.task_id} for ${taskResponse.filename_key}`);
            alert("Starting forest data export. This may take several minutes.");
            return;
        }

        // Any other status treat as error
        console.error('[ERROR] startForestDataExport unexpected status:', taskResponse.status);
        setState('currentExportTask', { id: null, countyKey: null, status: 'FAILED', localUrl: null });
        alert("Failed to start the export task. See console for details.");

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to start forest export.', error);
        setState('currentExportTask', { id: null, countyKey: null, status: 'FAILED', localUrl: null });
        alert("Failed to start the export task. See console for details.");
    }
}

/**
 * STEP 2: Checks the status of the ongoing export task (On-Demand).
 */
async function checkForestDataStatus() {
    const task = appState.currentExportTask;
    if (!task || !task.status || task.status === 'NONE') {
        console.warn('[WARN] No export task is active. Cannot check status.');
        return 'NONE';
    }

    if (task.status === 'COMPLETED') return 'COMPLETED';
    if (task.status === 'PROCESSING' && !task.id) {
        console.error('[ERROR] Task is processing but has no GEE task ID to poll.');
        return 'FAILED';
    }

    console.log(`[INFO] DataManager: Checking status for task ${task.id} (${task.countyKey})`);

    try {
        const statusResponse = await checkExportStatus(task.id, task.countyKey);

        if (!statusResponse) throw new Error("No response from status check API.");

        switch (statusResponse.status) {
            case 'COMPLETED': {
                // Prefer a served URL in the `url` field; fallback to local_path or a constructed exports URL
                const fileUrl = statusResponse.url || statusResponse.local_path || `/exports/${task.countyKey}.tif`;

                console.log('[INFO] DataManager: Export complete. File URL:', fileUrl);
                setState('currentGEEForestFileUrl', fileUrl);
                setState('currentGEEForestGeoJSON', fileUrl); // compat

                setState('currentExportTask', {
                    ...task,
                    status: 'COMPLETED',
                    localUrl: fileUrl
                });
                return 'COMPLETED';
            }

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

function getCurrentGEEForestFileUrl() {
    return appState.currentGEEForestFileUrl || null;
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
    getCurrentGEEForestFileUrl,
    getCurrentGEEForestGeoJSON,
    getForestExportStatus,
    setCurrentCountyNameAndStateAbbr,
    getCurrrentCountyName,
    getCurrentStateAbbr,
    getCurrentCountyKey
};
