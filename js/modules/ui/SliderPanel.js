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
 * 2. Set the maximum value for each slider based on the entire dataset, using a logarithmic scale.
 * 3. Update the values of all sliders when a new FIPS county is selected.
 * 4. Listen for user input on any slider and update the central application state.
 * 5. Format slider values for user-friendly display (e.g., 1.2K, 5.3M).
 */

// imports
import { appState, setState } from '../state.js';
import { getDataFeatures, getDataForFips } from '../services/DataManager.js';
import { columnDefinitions } from '../services/data.js';

// --- Helper Functions ---

/**
 * Converts a linear value to a logarithmic scale for the slider.
 * We use log10(value + 1) to gracefully handle input values of 0.
 * @param {number} value The original, linear data value.
 * @returns {number} The corresponding value on a log10 scale.
 */
function linearToLog(value) {
    return Math.log10(value + 1);
}

/**
 * Converts a logarithmic slider value back to a linear scale.
 * This is the inverse of the linearToLog function.
 * @param {number} logValue The value from the slider's log scale.
 * @returns {number} The original, linear data value.
 */
function logToLinear(logValue) {
    return Math.pow(10, logValue) - 1;
}

/**
 * Formats a number into a user-friendly string (e.g., 987, 1.2K, 5.3M).
 * This function only affects the display and not the underlying data value.
 * @param {number} num The number to format.
 * @returns {string} The formatted string.
 */
function formatNumberForDisplay(num) {
    if (num < 1000) {
        // For numbers less than 1000, show up to 1 decimal place if not an integer.
        return num.toFixed(num % 1 === 0 ? 0 : 1);
    } else if (num < 1000000) {
        // For thousands, show as "K"
        return (num / 1000).toFixed(1) + 'K';
    } else {
        // For millions, show as "M"
        return (num / 1000000).toFixed(1) + 'M';
    }
}


/**
 * Initializes the SliderPanel module.
 * Sets up listeners for central state changes to react accordingly.
 */
function init() {
    const sliderTemplate = document.getElementById('slider-template');

    if (!sliderTemplate) {
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
}

/**
 * Generates the HTML for all sliders by cloning a template.
 */
function generateAllSliders() {
    const containers = {
        transition: document.getElementById('feature_modal_transitions_'),
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
            container.querySelectorAll('.slider-container').forEach(el => el.remove());

            columns.forEach(columnName => {
                const sliderClone = sliderTemplate.content.cloneNode(true);
                const labelSpan = sliderClone.querySelector('.slider-name');
                const valueSpan = sliderClone.querySelector('.slider-value');
                const sliderInput = sliderClone.querySelector('.slider');

                labelSpan.textContent = columnName;
                valueSpan.id = `${columnName}-value`;
                sliderInput.id = `${columnName}-slider`;
                sliderInput.dataset.column = columnName; 

                sliderInput.addEventListener('input', handleSliderInput);
                container.appendChild(sliderClone);
            });
        }
    }
}

/**
 * Handles input on any slider, updating the central state and the UI display.
 * The display is formatted, but the state stores the raw linear value.
 * @param {Event} event - The input event from the slider.
 */
function handleSliderInput(event) {
    const slider = event.target;
    const column = slider.dataset.column;
    const logValue = parseFloat(slider.value); 
    const linearValue = logToLinear(logValue);

    // Update the visual display with the user-friendly formatted number
    const valueDisplay = document.getElementById(`${column}-value`);
    if (valueDisplay) {
        valueDisplay.textContent = formatNumberForDisplay(linearValue);
    }

    // The central state always stores the precise, unformatted linear value
    const newInterventions = {
        ...appState.interventions,
        [column]: linearValue,
    };

    setState('interventions', newInterventions);
}


/**
 * Updates all slider values for a specific FIPS code.
 * The slider's position is set on a log scale, and the display is formatted.
 * @param {string} fipsCode - The FIPS code of the selected county.
 */
function updateAllSlidersForFips(fipsCode) {
    const data = getDataForFips(fipsCode);
    if (!data) {
        console.warn(`[SliderPanel] No data found for FIPS ${fipsCode}. Cannot update sliders.`);
        return;
    }

    setState('interventions', {});

    for (const category in columnDefinitions) {
        columnDefinitions[category].forEach(columnName => {
            const slider = document.getElementById(`${columnName}-slider`);
            const valueDisplay = document.getElementById(`${columnName}-value`);
            const linearValue = data[columnName];

            if (slider && linearValue !== undefined && linearValue !== null) {
                slider.value = linearToLog(linearValue);

                // Update the display with the user-friendly formatted number
                if (valueDisplay) {
                    valueDisplay.textContent = formatNumberForDisplay(linearValue);
                }
            }
        });
    }
}

/**
 * Calculates and sets the slider maximums using a logarithmic scale.
 */
function calculateAndSetSliderMaximums() {
    const fullDataset = getDataFeatures();
    if (!fullDataset || fullDataset.length === 0) {
        console.warn('[SliderPanel] Full dataset not available. Cannot set slider maximums.');
        return;
    }

    const padding = 1.1; 

    for (const category in columnDefinitions) {
        columnDefinitions[category].forEach(columnName => {
            const values = fullDataset
                .map(row => parseFloat(row[columnName]))
                .filter(val => !isNaN(val));

            if (values.length > 0) {
                const maxValue = Math.max(...values);
                const paddedMax = maxValue * padding;
                const sliderLogMax = linearToLog(paddedMax);
                const slider = document.getElementById(`${columnName}-slider`);

                if (slider) {
                    slider.max = sliderLogMax;
                    slider.step = 'any'; 
                }
            } else {
                console.warn(`No valid numeric data found for column: '${columnName}'. Max not set.`);
            }
        });
    }
}

// Export the init function as the public interface for this module.
export default {
    init
};