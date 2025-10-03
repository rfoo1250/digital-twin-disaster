// js/modules/ui/Wildfire.js
import { loadWildfireSimulation, getWildfireProgression, getWildfireGrid } from '../services/DataManager.js';

async function startSimulation(log) {
    log.innerHTML = ""; // clear log before new run

    // Fetch and store wildfire simulation
    await loadWildfireSimulation();
    const progression = getWildfireProgression();

    // Render each timestep
    progression.forEach(ts => {
        const entry = document.createElement('div');
        entry.textContent = `Timestep ${ts.timestep}: burning=${ts.burning}, burnt=${ts.burnt}, total=${ts.total}`;
        log.appendChild(entry);
    });

    // Final summary
    if (progression.length > 0) {
        const last = progression[progression.length - 1];
        const entry = document.createElement('div');
        entry.style.fontWeight = 'bold';
        entry.textContent = `Simulation complete at timestep ${last.timestep}`;
        log.appendChild(entry);
    }
}

// Container for simulation overlay
function init() {
    let container = document.getElementById('wildfire-sim-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'wildfire-sim-container';
        container.style.position = 'absolute';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.padding = '10px';
        container.style.background = 'rgba(255,255,255,0.9)';
        container.style.border = '1px solid #ccc';
        container.style.fontFamily = 'monospace';
        container.style.maxHeight = '300px';
        container.style.overflowY = 'auto';
        document.body.appendChild(container);
    }

    container.innerHTML = `
        <h3>Wildfire Simulation</h3>
        <div id='wildfire-log' style='margin-bottom:8px;'></div>
        <button id='restart-wildfire'>Run Simulation</button>
    `;

    const log = container.querySelector('#wildfire-log');
    const restartBtn = container.querySelector('#restart-wildfire');

    restartBtn.addEventListener('click', () => {
        startSimulation(log);
    });

    // auto-start simulation first time
    startSimulation(log);
}

export default {
    init
};
