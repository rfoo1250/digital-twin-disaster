/**
 * SliderPanel.js
 *
 * This module is responsible for all UI and logic related to the intervention sliders.
 * It consolidates functionality from the original files:
 * - `create_sliders.js`: Slider generation and event listener attachment.
 * - `modal_logic.js`: Updating slider values based on the selected FIPS.
 * - `simulation.html.js`: Handling slider input and sending data.
 *
 * Responsibilities:
 * 1. Generate all sliders in the modal after the main data is loaded.
 * 2. Set the maximum value for each slider based on the entire dataset.
 * 3. Update the values of all sliders when a new FIPS county is selected.
 * 4. Listen for user input on any slider and update the central application state.
 */

// imports
import { appState, setState } from '../state.js';
import { getDataFeatures, getDataForFips, columnDefinitions } from '../services/DataManager.js';

/**
 * Initializes the SliderPanel module.
 * Sets up listeners for central state changes to react accordingly.
 */
function init() {
    const sliderTemplate = document.getElementById('slider-template');

    if (!sliderTemplate) {
        // If it doesn't exist, this page doesn't use the slider panel.
        // Do nothing and exit the function immediately.
        return;
    }
    
    document.addEventListener('state:changed', (e) => {
        const { key, value } = e.detail;

        if (key === 'isDataLoaded' && value === true) {
            console.log('SliderPanel detected data has loaded. Generating sliders.');
            generateAllSliders();
            calculateAndSetSliderMaximums();
        }

        if (key === 'selectedFips' && value !== null) {
            console.log(`SliderPanel detected FIPS change to ${value}. Updating sliders.`);
            updateAllSlidersForFips(value);
        }
    });
    console.log('SliderPanel initialized and waiting for state changes.');
}

/**
 * Generates the HTML for all sliders by cloning a template.
 * This replaces the string-based generation from create_sliders.js.
 */
function generateAllSliders() {
    const containers = {
        transitions: document.getElementById('feature_modal_transitions_'),
        news: document.getElementById('feature_modal_news_'),
        reddit: document.getElementById('feature_modal_reddit_'),
    };

    const sliderTemplate = document.getElementById('slider-template');
    if (!sliderTemplate) {
        console.error('Fatal: Slider template with id="slider-template" not found in HTML.');
        return;
    }

    // Generate sliders for each category
    for (const category in columnDefinitions) {
        const container = containers[category];
        const columns = columnDefinitions[category];

        if (container && columns) {
            // Clear any existing sliders
            container.querySelectorAll('.slider-container').forEach(el => el.remove());

            columns.forEach(columnName => {
                const sliderClone = sliderTemplate.content.cloneNode(true);
                const containerDiv = sliderClone.querySelector('.slider-container');
                const labelSpan = sliderClone.querySelector('.slider-name');
                const valueSpan = sliderClone.querySelector('.slider-value');
                const sliderInput = sliderClone.querySelector('.slider');

                // Configure the new slider element from the template
                const readableName = columnName.replace(/_/g, ' ');
                labelSpan.textContent = readableName;
                valueSpan.id = `${columnName}-value`;

                sliderInput.id = `${columnName}-slider`;
                sliderInput.dataset.column = columnName; // Store original column name

                // Attach the event listener for this specific slider
                sliderInput.addEventListener('input', handleSliderInput);

                container.appendChild(sliderClone);
            });
        }
    }
}

/**
 * Handles input on any slider, updating the central state.
 * This replaces sendSliderData() and the listener logic from simulation.html.js.
 * @param {Event} event - The input event from the slider.
 */
function handleSliderInput(event) {
    const slider = event.target;
    const column = slider.dataset.column;
    const value = parseFloat(slider.value);

    // Update the visual display for this slider
    const valueDisplay = document.getElementById(`${column}-value`);
    if (valueDisplay) {
        valueDisplay.textContent = value.toFixed(4); // Format for better readability
    }

    // Create a new interventions object to avoid direct mutation
    const newInterventions = {
        ...state.interventions,
        [column]: value,
    };

    // Update the central state. This is the only "side effect".
    updateState('interventions', newInterventions);
}


/**
 * Updates all slider values to reflect the data for a specific FIPS code.
 * This logic is consolidated from modal_logic.js.
 * @param {string} fipsCode - The FIPS code of the selected county.
 */
function updateAllSlidersForFips(fipsCode) {
    const data = getDataForFips(fipsCode);
    if (!data) {
        console.warn(`[SliderPanel] No data found for FIPS ${fipsCode}. Cannot update sliders.`);
        return;
    }

    // Reset interventions when a new county is selected
    updateState('interventions', {});

    // Iterate over all known columns and update their corresponding sliders
    for (const category in columnDefinitions) {
        columnDefinitions[category].forEach(columnName => {
            const slider = document.getElementById(`${columnName}-slider`);
            const valueDisplay = document.getElementById(`${columnName}-value`);
            const value = data[columnName];

            if (slider && value !== undefined && value !== null) {
                slider.value = value;
                if (valueDisplay) {
                    valueDisplay.textContent = value.toFixed(4);
                }
            }
        });
    }
}

/**
 * Calculates the maximum value for each column across the entire dataset
 * and sets the 'max' attribute on the corresponding slider.
 * This logic is consolidated from modal_logic.js.
 */
function calculateAndSetSliderMaximums() {
    const fullDataset = getDataFeatures();
    if (!fullDataset || fullDataset.length === 0) {
        console.warn('[SliderPanel] Full dataset not available. Cannot set slider maximums.');
        return;
    }

    const padding = 1.1; // Add 10% padding to the max value

    for (const category in columnDefinitions) {
        columnDefinitions[category].forEach(columnName => {
            // Extract all valid, numeric values for this column
            const values = fullDataset
                .map(row => parseFloat(row[columnName]))
                .filter(val => !isNaN(val));

            if (values.length > 0) {
                const maxValue = Math.max(...values);
                const sliderMax = maxValue * padding;
                const slider = document.getElementById(`${columnName}-slider`);
                if (slider) {
                    slider.max = sliderMax;
                }
            }
        });
    }
}

// Export the init function as the public interface for this module.
export default {
    init
};
