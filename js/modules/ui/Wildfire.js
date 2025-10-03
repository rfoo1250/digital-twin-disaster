// js/modules/ui/Wildfire.js
import { loadWildfireSimulation, getWildfireProgression, getWildfireData, getWildfireGrid } from '../services/DataManager.js';

async function startSimulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fetch and store wildfire simulation
    await loadWildfireSimulation();

    const wildfire = getWildfireData();
    const timesteps = wildfire.timesteps;
    const gridSize = wildfire.gridSize;

    const cellSize = Math.min(canvas.width / gridSize, canvas.height / gridSize);

    let stepIndex = 0;
    const finalStepIndex = timesteps.length - 1;
    addTooltip(canvas, gridSize, cellSize, timesteps, () => (stepIndex <= finalStepIndex ? stepIndex : finalStepIndex));

    function drawStep() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ts = timesteps[stepIndex];
        const grid = getWildfireGrid(timesteps, ts.timestep);

        grid.forEach((row, r) => {
            row.forEach((node, c) => {
                if (!node) return;

                if (node.state === 'empty') {
                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = '#ccc';
                    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
                    ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
                } else {
                    ctx.fillStyle = node.color || 'gray';
                    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
                }
            });
        });

        // Draw border lines aligned with gridSize
        ctx.strokeStyle = '#ccc';
        for (let r = 0; r <= gridSize; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellSize);
            ctx.lineTo(gridSize * cellSize, r * cellSize);
            ctx.stroke();
        }
        for (let c = 0; c <= gridSize; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cellSize, 0);
            ctx.lineTo(c * cellSize, gridSize * cellSize);
            ctx.stroke();
        }

        stepIndex++;
        if (stepIndex < timesteps.length) {
            setTimeout(drawStep, 500);
        }
    }

    drawStep();
}

function addTooltip(canvas, gridSize, cellSize, timesteps, getStepIndex) {
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'rgba(0,0,0,0.75)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '4px 6px';
    tooltip.style.fontSize = '12px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);

        const stepIndex = getStepIndex();
        const ts = timesteps[stepIndex];
        const grid = getWildfireGrid(timesteps, ts.timestep);
        const node = grid[row]?.[col];

        if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.pageX + 10}px`;
            tooltip.style.top = `${e.pageY + 10}px`;

            if (node) {
                tooltip.innerHTML = `ID: ${node.id}<br>Row: ${row}, Col: ${col}<br>State: ${node.state}`;
            } else {
                tooltip.innerHTML = `Row: ${row}, Col: ${col}`;
            }
        } else {
            tooltip.style.display = 'none';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
}

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
        document.body.appendChild(container);
    }

    container.innerHTML = `
        <h3>Wildfire Simulation</h3>
        <canvas id='wildfire-canvas' width='300' height='300' style='border:1px solid #aaa; margin-bottom:8px;'></canvas>
        <div id='wildfire-legend' style='margin-bottom:8px; font-size: 12px;'></div>
        <button id='restart-wildfire'>Run Simulation</button>
    `;

    const canvas = container.querySelector('#wildfire-canvas');
    const legend = container.querySelector('#wildfire-legend');
    const restartBtn = container.querySelector('#restart-wildfire');

    legend.innerHTML = `
        <div><span style="display:inline-block;width:12px;height:12px;background:orange;margin-right:4px;"></span>Burning</div>
        <div><span style="display:inline-block;width:12px;height:12px;background:brown;margin-right:4px;"></span>Burnt</div>
        <div><span style="display:inline-block;width:12px;height:12px;background:green;margin-right:4px;"></span>Not burnt</div>
        <div><span style="display:inline-block;width:12px;height:12px;background:white;margin-right:4px;"></span>Empty</div>
    `;

    restartBtn.addEventListener('click', () => {
        startSimulation(canvas);
    });

    startSimulation(canvas);
}

export default {
    init
};