// js/modules/ui/Wildfire.js
// THIS CODE IS NOT TESTED, run sim!
// import * as d3 from "d3";
import { loadWildfireSimulation, getWildfireData, getForestFeature } from "../services/DataManager.js";

async function startSimulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Load wildfire sim data
    await loadWildfireSimulation();
    const wildfire = getWildfireData();
    const timesteps = wildfire.timesteps;
    const gridSize = wildfire.gridSize;
    const cellSize = Math.min(canvas.width / gridSize, canvas.height / gridSize);
    const forestFeature = getForestFeature();
    let forestClip = null;
    if (forestFeature) {
        const projection = d3.geoAlbersUsa()
            .fitSize([canvas.width, canvas.height], forestFeature);
        const pathGen = d3.geoPath().projection(projection);
        const pathString = pathGen(forestFeature);
        forestClip = new Path2D(pathString);
    }

    let stepIndex = 0;
    const finalStepIndex = timesteps.length - 1;
    addTooltip(canvas, gridSize, cellSize, timesteps, () => (stepIndex <= finalStepIndex ? stepIndex : finalStepIndex));

    function drawStep() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ts = timesteps[stepIndex];

        ts.nodes.forEach(node => {
            const x = node.col * cellSize;
            const y = (gridSize - 1 - node.row) * cellSize;
            const centerX = x + cellSize / 2;
            const centerY = y + cellSize / 2;

            // only draw inside forest polygon if present
            if (forestClip && !ctx.isPointInPath(forestClip, centerX, centerY)) return;

            if (node.state === "empty") {
                ctx.fillStyle = "white";
                ctx.strokeStyle = "#ccc";
                ctx.fillRect(x, y, cellSize, cellSize);
                ctx.strokeRect(x, y, cellSize, cellSize);
            } else {
                ctx.fillStyle = node.color || "gray";
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        });

        // Optional: draw forest outline for context
        if (forestClip) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = "darkgreen";
            ctx.lineWidth = 2;
            ctx.stroke(forestClip);
            ctx.restore();
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

        // Adjust for inverted Y-axis
        const col = Math.floor(x / cellSize);
        const invertedRow = Math.floor(y / cellSize);
        const row = gridSize - 1 - invertedRow; // invert mapping back

        const stepIndex = getStepIndex();
        const ts = timesteps[stepIndex];
        const node = ts.nodes.find(n => n.row === row && n.col === col);

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
    const container = document.getElementById('wildfire-sim-container');
    const canvas = container.querySelector('#wildfire-canvas');
    const runBtn = container.querySelector('#run-wildfire-sim');

    runBtn.addEventListener('click', () => {
        startSimulation(canvas);
    });

}

export default {
    init
};