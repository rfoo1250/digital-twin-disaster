/**
 * DataManager.js
 *
 * This module is the single source for all data loading and access in the
 * application. It fetches all necessary CSV and JSON files, stores them
 * in the central state, and provides getter functions for other modules
 * to consume the data.
 */
import { appState, setState } from '../state.js';
import { runWildfireSimulation } from './ApiClient.js';


// Column definitions, consolidated from create_sliders.js
const columnDefinitions = {
    news: [
        'Num_News', 'News_Trees', 'News_Power Lines', 'News_Roofs',
        'News_Buildings', 'News_Vehicles', 'News_Agriculture', 'News_Infrastructure'
    ],
    reddit: [
        'Num_Reddit', 'Reddit_Trees', 'Reddit_Power Lines', 'Reddit_Roofs',
        'Reddit_Buildings', 'Reddit_Vehicles', 'Reddit_Agriculture', 'Reddit_Infrastructure'
    ],
    transition: [
        'transition_0_0', 'transition_0_1', 'transition_0_2', 'transition_0_3', 'transition_0_4',
        'transition_0_5', 'transition_0_6', 'transition_0_7', 'transition_0_8', 'transition_1_0',
        'transition_1_1', 'transition_1_2', 'transition_1_3', 'transition_1_4', 'transition_1_5',
        'transition_1_6', 'transition_1_7', 'transition_1_8', 'transition_2_0', 'transition_2_1',
        'transition_2_2', 'transition_2_3', 'transition_2_4', 'transition_2_5', 'transition_2_6',
        'transition_2_7', 'transition_2_8', 'transition_3_0', 'transition_3_1', 'transition_3_2',
        'transition_3_3', 'transition_3_4', 'transition_3_5', 'transition_3_6', 'transition_3_7',
        'transition_3_8', 'transition_4_0', 'transition_4_1', 'transition_4_2', 'transition_4_3',
        'transition_4_4', 'transition_4_5', 'transition_4_6', 'transition_4_7', 'transition_4_8',
        'transition_5_0', 'transition_5_1', 'transition_5_2', 'transition_5_3', 'transition_5_4',
        'transition_5_5', 'transition_5_6', 'transition_5_7', 'transition_5_8', 'transition_6_0',
        'transition_6_1', 'transition_6_2', 'transition_6_3', 'transition_6_4', 'transition_6_5',
        'transition_6_6', 'transition_6_7', 'transition_6_8', 'transition_7_0', 'transition_7_1',
        'transition_7_2', 'transition_7_3', 'transition_7_4', 'transition_7_5', 'transition_7_6',
        'transition_7_7', 'transition_7_8', 'transition_8_0', 'transition_8_1', 'transition_8_2',
        'transition_8_3', 'transition_8_4', 'transition_8_5', 'transition_8_6', 'transition_8_7',
        'transition_8_8'
    ]
};

/**
 * Loads all necessary data files for the application.
 * This is the only place where data fetching occurs.
 */
async function loadAllData() {
    try {
        const [
            usTopo,
            dataFeatures,
            instanceNecessity,
            nriData,
            sourceNecessity,
            groupNecessity,
            recourseResults,
        ] = await Promise.all([
            d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
            d3.csv("../../../data_features.csv", d3.autoType),
            d3.csv("../../../enriched_instance_necessity_scores.csv", d3.autoType),
            d3.csv("../../../nri_county_level.csv", d3.autoType),
            d3.csv("../../../enriched_source_necessity_scores.csv", d3.autoType),
            d3.csv("../../../enriched_group_necessity_scores.csv", d3.autoType),
            d3.json("../../../enriched_your_json_file.json")
        ]);

        const allData = {
            dataFeatures,
            countiesTopo: topojson.feature(usTopo, usTopo.objects.counties).features,
            instanceNecessity,
            nriData,
            sourceNecessity,
            recourseResults,
            groupNecessity,
            fipsToInstanceMap: new Map(instanceNecessity.map(r => [String(r.FIPS).padStart(5, "0"), r.Instance_Index || r.FIPS]))
        };

        setState('allData', allData);
        setState('isDataLoaded', true);
        console.log('[INFO] DataManager: All data loaded successfully.');

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load data.', error);
        alert('A critical error occurred while loading application data. Please check the console and refresh the page.');
    }
}

/**
 * Retrieves all data for a specific FIPS code from the main features dataset.
 * @param {string} fipsCode The 5-digit FIPS code.
 * @returns {Object|null} The data row for the FIPS code, or null if not found.
 */
function getDataForFips(fipsCode) {
    if (!appState.allData?.dataFeatures) {
        console.warn('Data not loaded yet, cannot get FIPS data.');
        return null;
    }
    const targetFips = parseInt(fipsCode, 10);
    return appState.allData.dataFeatures.find(row => parseInt(row.FIPS, 10) === targetFips) || null;
}

/**
 * Parses the wildfire simulation response returned from the backend into a normalized structure.
 * Ensures consistent access to timesteps and overall simulation metadata.
 * @param {Object} response - Raw wildfire simulation response from API
 * @returns {Object} Parsed response with timesteps and metadata
 */
function parseWildfireResponse(response) {
  if (!response || !response.success) {
    return { success: false, timesteps: [], message: response?.error || "Invalid response" };
  }
  return {
    success: true,
    finalTimestep: response.final_timestep,
    timesteps: response.timesteps || [],
    gridSize: response.grid_size
  };
}

/**
 * Retrieves the node states for a given timestep.
 * @param {Array} timesteps - Array of timesteps from wildfire response
 * @param {number} step - The timestep number to retrieve
 * @returns {Array} Array of node objects at the given timestep
 */
function getNodesAtTimestep(timesteps, step) {
  const ts = timesteps.find(t => t.timestep === step);
  return ts ? ts.nodes : [];
}

/**
 * Creates a progression summary (burning vs burnt counts over time).
 * @param {Array} timesteps - Array of timesteps from wildfire response
 * @returns {Array} Array of progression objects: [{ timestep, burning, burnt, total }]
 */
function getFireProgression(timesteps) {
  return timesteps.map(ts => ({
    timestep: ts.timestep,
    burning: ts.burning,
    burnt: ts.burnt,
    total: ts.total
  }));
}

/**
 * Groups nodes by their color (state) for visualization purposes.
 * @param {Array} nodes - Array of node objects
 * @returns {Object} Object keyed by color with arrays of nodes as values
 */
function groupNodesByColor(nodes) {
  return nodes.reduce((acc, node) => {
    if (!acc[node.color]) acc[node.color] = [];
    acc[node.color].push(node);
    return acc;
  }, {});
}

/**
 * Get nodes at a specific timestep, grouped into a grid by row/col given from backend.
 * Useful for rendering a 2D grid in the UI.
 * @param {Array} timesteps - Array of timesteps from wildfire response
 * @param {number} step - The timestep number to retrieve
 * @returns {Array<Array>} 2D array grid[row][col] = node
 */
function getWildfireGrid(timesteps, step) {
  const nodes = getNodesAtTimestep(timesteps, step);
  if (!nodes || nodes.length === 0) return [];

  const maxRow = Math.max(...nodes.map(n => n.row));
  const maxCol = Math.max(...nodes.map(n => n.col));

  const grid = Array.from({ length: maxRow + 1 }, () =>
    Array(maxCol + 1).fill(null)
  );

  nodes.forEach(n => {
    grid[n.row][n.col] = n;
  });

  return grid;
}


/**
 * Count nodes by state at a specific timestep.
 * @param {Array} timesteps - Array of timesteps
 * @param {number} step - The timestep number to summarize
 * @returns {Object} { burning: X, burnt: Y, not_burnt: Z, empty: W }
 */
function countStatesAtTimestep(timesteps, step) {
  const nodes = getNodesAtTimestep(timesteps, step);
  return nodes.reduce((acc, node) => {
    acc[node.state] = (acc[node.state] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Loads the wildfire simulation results from the backend.
 * Stores parsed results in application state for later access.
 */
async function loadWildfireSimulation() {
  try {
    const rawResponse = await runWildfireSimulation();
    const parsed = parseWildfireResponse(rawResponse);
    setState('wildfireData', parsed);
    console.log('[INFO] DataManager: Wildfire simulation loaded.');
  } catch (error) {
    console.error('[ERROR] DataManager: Failed to load wildfire simulation.', error);
  }
}


// --- Specific Data Getter Functions ---
// These provide a clean API for UI modules to get the data they need
// without knowing the internal structure of the `allData` object.

function getCountyTopoData() {
    return appState.allData?.countiesTopo || [];
}

function getDataFeatures() {
    return appState.allData?.dataFeatures || [];
}

function getNriData() {
    return appState.allData?.nriData || [];
}

function getInstanceNecessityData() {
    return appState.allData?.instanceNecessity || [];
}

function getGroupNecessityData() {
    return appState.allData?.groupNecessity || [];
}

function getSourceNecessityData() {
    return appState.allData?.sourceNecessity || [];
}

function getRecourseData() {
    return appState.allData?.recourseResults || [];
}

function getFipsToInstanceMap() {
    return appState.allData?.fipsToInstanceMap || new Map();
}

function getWildfireData() {
  return appState.wildfireData || { success: false, timesteps: [] };
}

function getWildfireNodes(step) {
  return getNodesAtTimestep(getWildfireData().timesteps, step);
}

function getWildfireProgression() {
  return getFireProgression(getWildfireData().timesteps);
}

// TODO: import the geojson file and extract natioanl forest when it comes to it
// for now, hardcoding the exact coord format in geojson
const forestFeature = { 
    type: "Feature",
    properties: { FORESTNAME: "Arapaho and Roosevelt NF" },
    geometry: { type: "Polygon", coordinates: 
        [
            [-105.82718737, 40.245806079069496],
            [-105.83644831, 40.250272879069456],
            [-105.86210778, 40.214520559069619],
            [-105.84483853, 40.205599019069709],
            [-105.82718737, 40.245806079069496]
        ]
    }
}; // MultiPolygon


export {
    loadAllData,
    getDataForFips,
    columnDefinitions,
    getCountyTopoData,
    getDataFeatures,
    getNriData,
    getInstanceNecessityData,
    getGroupNecessityData,
    getSourceNecessityData,
    getRecourseData,
    getFipsToInstanceMap,
    loadWildfireSimulation,
    getWildfireData,
    getWildfireNodes,
    getWildfireProgression,
    groupNodesByColor,
    getWildfireGrid,
    countStatesAtTimestep,
    forestFeature
};
