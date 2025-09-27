/**
 * app.js
 * * Main entry point for the application. This file initializes all modules,
 * loads the necessary data, and orchestrates the primary user interactions,
 * such as the "Compute" button click.
 */
import { appState, setState } from './modules/state.js';
import { loadAllData, getDataForFips } from './modules/services/DataManager.js';
import { runSimulation } from './modules/services/ApiClient.js';
import SliderPanel from './modules/ui/SliderPanel.js';
import SnapshotPanel from './modules/ui/SnapshotPanel.js';
import Map from './modules/ui/Map.js';
import Charts from './modules/ui/Charts.js';
import Modal from './modules/ui/Modal.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('[INFO] Application Initializing...');

    // Initialize all UI components
    Map.init();
    SliderPanel.init();
    SnapshotPanel.init();
    Charts.init();
    Modal.init();

    // Listen for FIPS changes to update the original data dictionary
    document.addEventListener('state:changed', (e) => {
        if (e.detail.key === 'selectedFips' && e.detail.value) {
            const fipsData = getDataForFips(e.detail.value);
            setState('originalDataForFips', fipsData);
        }
    });

    // Load the data, which will trigger other modules to render
    loadAllData();

    // Setup the "Compute" button logic
    const computeBtn = document.getElementById('compute_result_button');
    if (computeBtn) {
        computeBtn.addEventListener('click', async () => {
            const dagKey = document.getElementById('dagSelect').value;

            if (!appState.selectedFips) {
                return alert('Please select a county on the map first.');
            }
            if (!dagKey) {
                return alert('Please choose a causal model (DAG) from the dropdown.');
            }
            
            const payload = {
                original_dict: appState.originalDataForFips,
                interventions_dict: appState.interventions,
                dag_key: dagKey,
            };

            const response = await runSimulation(payload);

            // Update the UI with the results from the simulation
            if (response && response.results) {
                const { original_label, counterfactual_label } = response.results;
                const originalPredictionEl = document.getElementById('value');
                const counterfactualPredictionEl = document.getElementById('resValue');

                if (originalPredictionEl) {
                    originalPredictionEl.textContent = `Original Prediction: ${original_label}`;
                }
                if (counterfactualPredictionEl) {
                    counterfactualPredictionEl.textContent = `Counterfactual Prediction: ${counterfactual_label}`;
                }
            } else {
                console.error("API response did not contain valid results.", response);
                alert("Could not retrieve simulation results. See console for details.");
            }
        });
    }
});
