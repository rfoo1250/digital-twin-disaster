// js/modules/services/ApiClient.js

const API_BASE_URL = 'http://127.0.0.1:5000';

// --- Counterfactual SCM Simulation ---
async function runSCMSimulation(payload) {
    try {
        const response = await fetch(`${API_BASE_URL}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Client Error (SCM):', error);
        alert("Error computing SCM simulation. See console for details.");
        return null;
    }
}

// --- Batch SCM Simulation ---
async function runBatchSCMSimulation(payload) {
    try {
        const response = await fetch(`${API_BASE_URL}/simulate/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Client Error (Batch SCM):', error);
        alert("Error computing batch SCM simulation. See console for details.");
        return null;
    }
}

// --- Wildfire Simulation ---
async function runWildfireSimulation() {
    try {
        const response = await fetch(`${API_BASE_URL}/simulate_wildfire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) // no payload needed, uses defaults
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Client Error (Wildfire):', error);
        alert("Error running wildfire simulation. See console for details.");
        return null;
    }
}

export { runSCMSimulation, runBatchSCMSimulation, runWildfireSimulation };