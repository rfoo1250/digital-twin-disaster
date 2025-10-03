import { connectWildfireSimulation } from '../services/ApiClient.js';

let socketInstance = null;

// Start simulation logic
function startSimulation(log) {
    if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }

    socketInstance = connectWildfireSimulation(
        (update) => {
            const entry = document.createElement('div');
            entry.textContent = `Timestep ${update.timestep}: burning=${update.burning}, burnt=${update.burnt}`;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;
        },
        (final) => {
            const entry = document.createElement('div');
            entry.style.fontWeight = 'bold';
            entry.textContent = `Simulation complete at timestep ${final.final_timestep}`;
            log.appendChild(entry);

            if (socketInstance) {
                socketInstance.disconnect();
                socketInstance = null;
                console.log("Wildfire simulation socket disconnected.");
            }
        },
        (error) => {
            const entry = document.createElement('div');
            entry.style.color = 'red';
            entry.textContent = `Error: ${error}`;
            log.appendChild(entry);

            if (socketInstance) {
                socketInstance.disconnect();
                socketInstance = null;
                console.log("Wildfire simulation socket disconnected due to error.");
            }
        }
    );
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
        <button id='restart-wildfire'>Restart Simulation</button>
    `;

    const log = container.querySelector('#wildfire-log');
    const restartBtn = container.querySelector('#restart-wildfire');

    restartBtn.addEventListener('click', () => {
        log.innerHTML = ""; // clear previous log
        startSimulation(log);
    });

    // auto-start simulation first time
    startSimulation(log);
}

export default {
    init
};