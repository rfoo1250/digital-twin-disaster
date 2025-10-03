/**
 * DataManager.js
 *
 * This module is the single source for all data loading and access in the
 * application. It fetches all necessary CSV and JSON files, stores them
 * in the central state, and provides getter functions for other modules
 * to consume the data.
 */
import { appState, setState } from '../state.js';

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
            statesTopo: topojson.feature(usTopo, usTopo.objects.states).features,
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


// --- Specific Data Getter Functions ---
// These provide a clean API for UI modules to get the data they need
// without knowing the internal structure of the `allData` object.

function getCountyTopoData() {
    return appState.allData?.countiesTopo || [];
}

function getStateTopoData() {
    return appState.allData?.statesTopo || [];
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


// TODO: import the geojson file and extract natioanl forest when it comes to it
// for now, leaving this empty
const forestFeature = null;






export {
    loadAllData,
    getDataForFips,
    columnDefinitions,
    getCountyTopoData,
    getStateTopoData,
    getDataFeatures,
    getNriData,
    getInstanceNecessityData,
    getGroupNecessityData,
    getSourceNecessityData,
    getRecourseData,
    getFipsToInstanceMap,
    forestFeature
};
