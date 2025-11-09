/**
 * state.js
 * ---------------------------------------------
 * Centralized reactive store for the Wildfire Simulation app.
 * Tracks high-level data and application status.
 */

const appState = {
    isDataLoaded: false,
    allData: null,
    wildfireData: null,   // stores the active wildfire simulation result
};

/**
 * Updates a value in the global app state and dispatches a change event.
 * @param {string} key - The state key to update
 * @param {*} value - The new value
 */
function setState(key, value) {
    appState[key] = value;
    document.dispatchEvent(new CustomEvent('state:changed', { detail: { key, value } }));
    console.log(`[STATE] ${key} updated:`, value);
}

export { appState, setState };
