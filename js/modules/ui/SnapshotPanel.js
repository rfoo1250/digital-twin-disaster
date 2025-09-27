/**
 * SnapshotPanel.js
 *
 * This module is responsible for updating the content of the snapshot modal.
 * It listens for changes in the application state, specifically the 'interventions'
 * from the sliders, and dynamically generates a list of those changes for the user to see.
 *
 * Responsibilities:
 * 1. Listen for state changes related to slider interventions.
 * 2. Format the intervention data into a user-friendly list.
 * 3. Update the DOM of the snapshot modal with the list of changes.
 */

import { appState } from '../state.js';
// Import the function to get data for a specific FIPS code.
import { getDataForFips } from '../services/DataManager.js';

/**
 * Main initialization function for the SnapshotPanel module.
 * Sets up the necessary event listeners to keep the panel in sync with the app state.
 */
function init() {
    
    // Listen for state changes to update the snapshot modal content.
    document.addEventListener('state:changed', (e) => {
        if (e.detail.key === 'interventions') {
            updateSnapshotModalContent(e.detail.value);
        }
    });

    console.log('SnapshotPanel module initialized.');
}

/**
 * Formats a number into a user-friendly string (e.g., 987, 1.2K, 5.3M).
 * This is a local copy for display purposes within this modal.
 * @param {number} num The number to format.
 * @returns {string} The formatted string.
 */
function formatNumberForDisplay(num) {
    if (num === null || num === undefined) return 'N/A';
    if (num < 1000) {
        return num.toFixed(num % 1 === 0 ? 0 : 1);
    } else if (num < 1000000) {
        return (num / 1000).toFixed(1) + 'K';
    } else {
        return (num / 1000000).toFixed(1) + 'M';
    }
}

/**
 * Updates the content of the snapshot modal with the current slider interventions,
 * showing a comparison from the original value to the new value.
 * @param {object} interventions - The interventions object from the app state.
 */
function updateSnapshotModalContent(interventions) {
    const contentArea = document.getElementById('snapshot_modal_content_text');
    if (!contentArea) return;

    const { selectedFips } = appState;

    // If no county is selected, we can't show a comparison.
    if (!selectedFips) {
        contentArea.innerHTML = 'Please select a county on the map to begin.';
        return;
    }

    const originalData = getDataForFips(selectedFips);
    if (!originalData) {
        contentArea.innerHTML = 'Could not load original data for the selected county.';
        return;
    }

    if (!interventions || Object.keys(interventions).length === 0) {
        contentArea.innerHTML = 'No interventions have been set. Move a slider to see changes listed.';
        return;
    }

    let listHtml = '<ul class="list-disc pl-5 space-y-1">';
    let changesCount = 0;

    // Iterate through the changed values provided in the 'interventions' object.
    for (const [key, newValue] of Object.entries(interventions)) {
        const originalValue = originalData[key];

        // Only create a list item if the value has actually changed from the original.
        // Comparing with a fixed number of decimals avoids floating-point inaccuracies.
        if (newValue.toFixed(4) !== originalValue.toFixed(4)) {
            changesCount++;
            const formattedOriginal = formatNumberForDisplay(originalValue);
            const formattedNew = formatNumberForDisplay(newValue);

            // Construct the list item showing "Original → New".
            listHtml += `<li>
                            <strong>${key}:</strong> 
                            ${formattedOriginal} &rarr; <strong class="font-bold text-blue-600">${formattedNew}</strong>
                         </li>`;
        }
    }
    listHtml += '</ul>';

    // Only display the list if there are actual changes.
    if (changesCount > 0) {
        contentArea.innerHTML = listHtml;
    } else {
        contentArea.innerHTML = 'No interventions have been set, or values match the original configuration.';
    }
}

export default {
    init
};

