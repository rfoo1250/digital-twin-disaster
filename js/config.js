/**
 * config/config.js
 * ---------------------------------------------
 * Central configuration file for the Wildfire Simulation frontend.
 * Shared constants for API endpoints, map settings, and UI options.
 */

const CONFIG = {
    // ------------------ API ------------------ //
    API_BASE_URL: 'http://127.0.0.1:5000/api', // Flask backend root
    // GEE_LAYER_ENDPOINT: '/get_layer',
    // WILDFIRE_SIM_ENDPOINT: '/simulate',

    // ------------------ MAP ------------------ //
    MAP_DEFAULT_CENTER: [37.8, -96.0],  // U.S. center
    MAP_DEFAULT_ZOOM: 4,
    MAP_MIN_ZOOM: 3,
    MAP_MAX_ZOOM: 12,
    MAP_COUNTY_PADDING: [20, 20], // px padding when fitting county bounds

    // ------------------ MAP PROVIDERS ------------------ //
    TILE_LAYER_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    TILE_LAYER_ATTRIBUTION: '&copy; OpenStreetMap contributors',

    // MapTiler keys (used in WildfireMapLayer)
    MAPTILER_API_KEY: 'JpoaHlHUOI1nu8GvzUc0',
    MAPTILER_SATELLITE_URL: 'https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=JpoaHlHUOI1nu8GvzUc0',

    // ------------------ UI & SIMULATION ------------------ //
    DEBUG_MODE: true,
    MAP_FLY_DURATION: 0.8, // seconds
    COUNTY_LABEL_FLASH_DURATION: 2000, // ms
    DEFAULT_FOREST_OPACITY: 0.8,
    WILDFIRE_STEP_DELAY: 500, // ms between timesteps
    TOAST_SHOW_TIME: 3000, // ms

    // ------------------ DATA ------------------ //
    COUNTY_GEOJSON_URL: '/geojson-counties-fips.json',
    GEOTIFF_URL: '/data/shared/geotiffs/',

    // ------------------ ENVIRONMENTS ------------------ //
    // ENV: import.meta?.env?.MODE || 'development',
};

export default CONFIG;
