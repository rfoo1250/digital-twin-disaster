// js/modules/ui/Wildfire.js
// Wildfire canvas UI: load simulation data and render timesteps to a canvas.
// - Exports: default { init } — wires UI inside '#wildfire-sim-container'.
// - Depends on DataManager: loadWildfireSimulation(), getWildfireData(), getForestFeature().
// - Expected data shape (wildfire): { timesteps: [ { timestep, burning, burnt, total, nodes: [{id,state,color,row,col},...] }, ... ], gridSize }
// - Rendering: computes cellSize = min(canvas.width/gridSize, canvas.height/gridSize).
//   maps node.row/node.col → canvas with inverted Y: y = (gridSize-1-row)*cellSize.
// - Behavior notes: empty cells (state==='empty') are skipped (transparent).
// - Disabled features: forest clipping and tooltips a  qre intentionally left commented out.
// - TODOs: add legend drawing, make playback speed configurable, use requestAnimationFrame for smooth anim, optimize large-grid redraws.

import { loadWildfireSimulation, getWildfireData, getForestFeature } from "../services/DataManager.js";
import { appState } from "../state.js";
import { computeBoundingBox, loadMapBackground } from './WildfireMapLayer1.js';

async function startSimulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Load wildfire sim data
    await loadWildfireSimulation();
    const wildfire = getWildfireData();
    
    const timesteps = wildfire.timesteps;
    const gridSize = wildfire.gridSize;
    const cellSize = Math.min(canvas.width / gridSize, canvas.height / gridSize);
    // Disabled forest clipping: rely on grid-based node 'empty' state to hide cells.
    // const forestFeature = getForestFeature();
    // let forestClip = null;
    // if (forestFeature) {
    //     const projection = d3.geoAlbersUsa()
    //         .fitSize([canvas.width, canvas.height], forestFeature);
    //     const pathGen = d3.geoPath().projection(projection);
    //     const pathString = pathGen(forestFeature);
    //     forestClip = new Path2D(pathString);
    // }

    let stepIndex = 0;
    const finalStepIndex = timesteps.length - 1;
    // Tooltip disabled: UI tooltips are commented out to reduce DOM interactions
    // addTooltip(canvas, gridSize, cellSize, timesteps, () => (stepIndex <= finalStepIndex ? stepIndex : finalStepIndex));

    function drawStep() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ts = timesteps[stepIndex];

        ts.nodes.forEach(node => {
            const x = node.col * cellSize;
            const y = (gridSize - 1 - node.row) * cellSize;
            const centerX = x + cellSize / 2;
            const centerY = y + cellSize / 2;
            // forest clipping disabled; skip drawing cells marked 'empty' so they stay transparent
            // if (forestClip && !ctx.isPointInPath(forestClip, centerX, centerY)) return;

            if (node.state === "empty") {
                // leave transparent (do not draw); legend remains intact elsewhere
                return;
            }

            // draw occupied / burning / burnt cells
            ctx.fillStyle = node.color || "gray";
            ctx.fillRect(x, y, cellSize, cellSize);
        });

        // Optional: forest outline drawing disabled
        // if (forestClip) {
        //     ctx.save();
        //     ctx.globalAlpha = 0.3;
        //     ctx.strokeStyle = "darkgreen";
        //     ctx.lineWidth = 2;
        //     ctx.stroke(forestClip);
        //     ctx.restore();
        // }

        stepIndex++;
        if (stepIndex < timesteps.length) {
            setTimeout(drawStep, 500);
        }
    }

    drawStep();
}

/*
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
*/

async function init() {
    // loads container and alll those
    const container = document.getElementById('wildfire-sim-container');
    if (!container) {
        console.error('Could not find wildfire-sim-container');
        return;
    }

    // Ensure container is positioned for overlay
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '100%';

    // Create or get canvas
    let canvas = container.querySelector('#wildfire-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'wildfire-canvas';
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        container.appendChild(canvas);
    }

    // Create or get run button
    let runBtn = container.querySelector('#run-wildfire-sim');
    if (!runBtn) {
        runBtn = document.createElement('button');
        runBtn.id = 'run-wildfire-sim';
        runBtn.textContent = 'Run Simulation';
        runBtn.style.position = 'absolute';
        runBtn.style.bottom = '10px';
        runBtn.style.right = '10px';
        container.appendChild(runBtn);
    }

    // Set canvas size to match container
    const updateCanvasSize = () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    };
    console.log("[DEBUG] canvas.width:", canvas.width, "[DEBUG] canvas.height:", canvas.height);
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    let backgroundLayer = null;
    
    const setupWildfireMap = async () => {
        // Load initial forest feature and set up map
        const forestFeature = getForestFeature();
        if (!forestFeature) return;
        // console.log("[DEBUG] forestFeature:", forestFeature); // works
        const bbox = computeBoundingBox(forestFeature, 0.15); // 15% padding
        
        // console.log("[DEBUG] bbox:", bbox); // works
        // Load map background (now expects apiKey to be handled internally)
        backgroundLayer = await loadMapBackground({
            container,
            canvas,
            bbox
        });
    }

    if (appState.isDataLoaded) {
        setupWildfireMap();
    } else {
        document.addEventListener('state:changed', (e) => {
            if (e.detail.key === 'isDataLoaded' && e.detail.value === true) {
                setupWildfireMap();
            }
        });
    }
    // Background toggle setup
    const bgToggle = document.getElementById('toggle-background');
    if (bgToggle) {
    bgToggle.addEventListener('change', () => {
        if (!backgroundLayer || !backgroundLayer.mapDiv) return;
        backgroundLayer.mapDiv.style.display = bgToggle.checked ? 'block' : 'none';
    });
    }
    // Run button click handler
    runBtn.addEventListener('click', () => {
        startSimulation(canvas);
    });

}

export default {
    init
};
