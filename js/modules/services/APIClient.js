/**
 * APIClient.js
 * ---------------------------------------------
 * Handles communication between the frontend and backend Flask API
 * for the Wildfire Simulation app.
 */

const LOCAL_API_BASE_URL = 'http://127.0.0.1:5000';

/**
 * Run wildfire simulation.
 * Sends ignition coordinates to the backend and returns simulation results.
 * @param {{ lat: number, lng: number }} params - Ignition point coordinates
 * @returns {Promise<Object|null>} - Parsed wildfire simulation response
 */
async function runWildfireSimulation(params) {
    try {
        const response = await fetch(`${LOCAL_API_BASE_URL}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('[API Error] Wildfire Simulation:', error);
        alert('Error running wildfire simulation. See console for details.');
        return null;
    }
}

export { runWildfireSimulation };
