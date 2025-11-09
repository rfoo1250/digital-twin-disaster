import { runWildfireSimulation } from '../services/ApiClient.js';
import { getCountyGeoData } from '../services/DataManager.js';

let map, simulationLayer, countyLayer;

function init() {
    console.log('[INFO] Initializing Leaflet wildfire map...');

    // 1. Initialize map
    map = L.map('map').setView([37.8, -96], 4); // USA view

    // 2. Basemap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // 3. Add county boundaries
    const countyData = getCountyGeoData();
    if (countyData) {
        countyLayer = L.geoJSON(countyData, {
            style: {
                color: '#333',
                weight: 1,
                opacity: 0.6,
                fillOpacity: 0
            }
        }).addTo(map);

        console.log(`[INFO] Loaded ${countyData.features.length} county borders.`);
    }

    // 4. Click event to run wildfire simulation
    map.on('click', async (e) => {
        const latlng = e.latlng;
        console.log('Ignition point:', latlng);

        if (simulationLayer) map.removeLayer(simulationLayer);
        L.marker(latlng).addTo(map);

        await runWildfire(latlng);
    });
}

async function runWildfire(latlng) {
    try {
        const result = await runWildfireSimulation(latlng);
        if (!result) {
            alert('No wildfire data returned');
            return;
        }

        // Render GeoJSON result
        if (result.type === 'FeatureCollection') {
            simulationLayer = L.geoJSON(result, {
                style: { color: 'red', weight: 2, opacity: 0.7 }
            }).addTo(map);
        }
    } catch (err) {
        console.error('Wildfire simulation error:', err);
    }
}

export default { init };
