/**
 * Map.js
 *
 * This module is responsible for rendering the main US choropleth map,
 * handling user interactions like clicks and tooltips, and managing the
 * map's legend and display modes (Data Features vs. NRI).
 */
import { appState, setState } from '../state.js';
import { getCountyTopoData, getDataFeatures, getDataForFips, getNriData } from '../services/DataManager.js';

// Module-level variables
const tooltip = d3.select("#tip");

/**
 * Initializes the Map module.
 */
function init() {
    // --- SOLUTION PART 1: GUARD THE EVENT LISTENER ---
    // Find the map mode dropdown element.
    const mapModeSelect = document.getElementById('map-mode');
    // Only add the event listener if the dropdown exists on the current page.
    if (mapModeSelect) {
        mapModeSelect.addEventListener('change', render);
    }

    // Listen for data loading to perform the initial render.
    document.addEventListener('state:changed', (e) => {
        if (e.detail.key === 'isDataLoaded' && e.detail.value === true) {
            render();
        }
    });

    // Handle window resizing to keep the map responsive.
    window.addEventListener('resize', render);
    console.log('Map module initialized.');
}

/**
 * Main render function, decides which map version to draw.
 */
function render() {
    if (!appState.isDataLoaded) return;

    // --- SOLUTION PART 2: PROVIDE A SAFE DEFAULT ---
    // Default to 'features' mode.
    let mode = 'features';
    const mapModeSelect = document.getElementById('map-mode');
    // If the dropdown exists, use its value. Otherwise, the default is used.
    if (mapModeSelect) {
        mode = mapModeSelect.value;
    }

    if (mode === 'nri') {
        drawMapNRI();
    } else {
        drawMapDefault();
    }
    updateLegend(mode);
}

/**
 * Draws the default map based on data_features.csv.
 */
function drawMapDefault() {
    const svg = d3.select("#map");
    svg.selectAll("*").remove();
    const W = svg.node().clientWidth, H = svg.node().clientHeight;
    const proj = d3.geoAlbersUsa().fitSize([W, H], { type: "FeatureCollection", features: getCountyTopoData() });
    const pathGen = d3.geoPath().projection(proj);

    const data = getDataFeatures();
    const countMap = new Map(d3.rollups(data, vs => vs.length, d => String(d.FIPS).padStart(5, '0')));

    const g = svg.append("g"); // container for other SVG elements.

    g.selectAll("path")
        .data(getCountyTopoData())
        .join("path")
        .attr("d", pathGen)
        .attr("fill", d => countMap.has(String(d.id).padStart(5, '0')) ? "#3182bd" : "#eee")
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .on("click", (e, d) => {
            const fips = String(d.id).padStart(5, "0");
            setState('selectedFips', fips); // Update central state

            const fipsData = getDataForFips(fips);
            const container = d3.select("#county-selected-text-container");
            const textElemt = d3.select("#county_selected_text");
            // set county name and state to top right
            if (fipsData) {
                // These properties might not exist, see note below
                const countyName = fipsData["County_Name"];
                const stateName = fipsData["State"];
                textElemt.text(`Selected: ${countyName}, ${stateName}`);
                container.style("display", "block");   // show box
            } else {
                // Provide a fallback for the user if no data exists
                textElemt.text(`No data available`);
                container.style("display", "block");   // still show box but with message
            }
        })
        .on("mouseover", (e, d) => {
            const fips = String(d.id).padStart(5, '0');
            const count = countMap.get(fips) || 0;
            
            // Show, position, and set content all in one step
            tooltip
                .style("opacity", 0.9)
                .html(`<strong>FIPS ${fips}</strong><br>${count} record(s)`)
                .style("left", (e.pageX + 10) + "px")
                .style("top",  (e.pageY - 28) + "px");

            d3.select(e.currentTarget).attr("stroke", "#000").attr("stroke-width", 2);
        })
        .on("mouseout", (e, d) => {
            tooltip.style("opacity", 0);
            d3.select(e.currentTarget).attr("stroke", "#999").attr("stroke-width", 1);
        });

    const zoom = d3.zoom()
        .scaleExtent([1, 8]) // zoom range
        .on("zoom", (event) => {
        g.attr("transform", event.transform);
        });

    svg.call(zoom);

    d3.select("#zoom_in").on("click", () => {
        svg.transition().call(zoom.scaleBy, 1.2);
    });

    d3.select("#zoom_out").on("click", () => {
        svg.transition().call(zoom.scaleBy, 0.8);
    });
}

/**
 * Draws the map colored by the National Risk Index (NRI).
 */
function drawMapNRI() {
    const svg = d3.select("#map");
    svg.selectAll("*").remove();
    const W = svg.node().clientWidth, H = svg.node().clientHeight;
    const proj = d3.geoAlbersUsa().fitSize([W, H], { type: "FeatureCollection", features: getCountyTopoData() });
    const pathGen = d3.geoPath().projection(proj);

    const nriMap = new Map(getNriData().map(r => [String(r.STCOFIPS).padStart(5, "0"), String(r.RISK_RATNG).toLowerCase()]));
    const ratings = ["very low", "relatively low", "relatively moderate", "moderate", "relatively high", "very high"];
    const colors = ["#ffffcc", "#ffeda0", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];
    const colorRamp = d3.scaleOrdinal().domain(ratings).range(colors);

    svg.selectAll("path")
        .data(getCountyTopoData())
        .join("path")
        .attr("d", pathGen)
        .attr("fill", d => {
            const fips = String(d.id).padStart(5, "0");
            const rating = nriMap.get(fips);
            return rating ? colorRamp(rating) : "#eee";
        })
        .attr("stroke", "#999")
        .on("click", (e, d) => {
            const fips = String(d.id).padStart(5, "0");
            setState('selectedFips', fips); // Update central state
        });
}

/**
 * Updates the map legend based on the current display mode.
 * @param {string} mode - The current map mode ('features' or 'nri').
 */
function updateLegend(mode) {
    const legendContainer = d3.select("#legend");
    if (legendContainer.empty()) return; // Guard clause for pages without a legend
    legendContainer.html("");

    // ... (legend drawing logic from main.js would go here) ...
}

export default {
    init
};

