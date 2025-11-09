import { getCountyGeoData } from '../services/DataManager.js';
import { fipsToState } from '../../utils/constants.js';

let map, countyLayer, forestLayer;
let selectedCounty = null;

function init() {
    console.log('[INFO] Initializing Leaflet map...');

    map = L.map('map').setView([37.8, -96], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const countyData = getCountyGeoData();
    if (countyData) {
        countyLayer = L.geoJSON(countyData, {
            style: defaultCountyStyle,
            onEachFeature: onEachCountyFeature,
        }).addTo(map);
    }

    addForestLayer();
    setupLayerToggles();
    setupButtons();

    console.log('[INFO] Leaflet map initialized successfully.');
}

/* ---------- Styles ---------- */
const defaultCountyStyle = { color: '#333', weight: 1, opacity: 0.6, fillOpacity: 0 };
const highlightCountyStyle = { color: '#006dba', weight: 3, opacity: 0.95, fillOpacity: 0.08 };
const dimCountyStyle = { color: '#999', weight: 0.5, opacity: 0.2, fillOpacity: 0 };

/* ---------- County interactivity ---------- */
function onEachCountyFeature(feature, layer) {
    layer.on('click', () => {
        selectedCounty = layer;

        const name = feature.properties.NAME || 'Unknown';

        let stateCode = '';
        if (feature.properties.STATE) {
            const code = feature.properties.STATE.toString().padStart(2, '0');
            stateCode = fipsToState[code] || code;
        }

        updateCountyLabel(`Selected: ${name}${stateCode ? ', ' + stateCode : ''}`);

        console.log(`[COUNTY DEBUG] Selected: ${name}`);

        countyLayer.eachLayer((l) => {
            if (l === layer) l.setStyle(highlightCountyStyle);
            else l.setStyle(defaultCountyStyle);
        });
    });
}

/* ---------- Label control ---------- */
function updateCountyLabel(text) {
    const container = document.getElementById('county_selected_text');
    if (container) container.textContent = text;
}

/* ---------- Buttons for focus/reset ---------- */
function setupButtons() {
    const focusBtn = document.getElementById('focus-on-county');
    const resetBtn = document.getElementById('reset-focus');

    if (focusBtn) {
        focusBtn.addEventListener('click', () => {
            if (!selectedCounty) {
                alert('Please click a county first.');
                return;
            }
            const bounds = selectedCounty.getBounds();
            map.flyToBounds(bounds, { padding: [20, 20], duration: 0.8 });
            console.log('[COUNTY DEBUG] Focused on selected county.');

            countyLayer.eachLayer((l) => {
                if (l === selectedCounty) l.setStyle(highlightCountyStyle);
                else l.setStyle(dimCountyStyle);
            });
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map.flyTo([37.8, -96], 4, { duration: 0.8 });
            selectedCounty = null;
            countyLayer.eachLayer((l) => l.setStyle(defaultCountyStyle));
            updateCountyLabel('No county selected');
            console.log('[COUNTY DEBUG] Reset to default zoom.');
        });
    }
}

/* ---------- Forest layer ---------- */
function addForestLayer() {
    const geeTileUrl =
        'https://earthengine.googleapis.com/v1/projects/dmml-volunteering/maps/7fd2429d62691e59be73adb39854fc30-48503b5da13ae5a1f49b33cc93d6aff9/tiles/{z}/{x}/{y}';

    forestLayer = L.tileLayer(geeTileUrl, {
        attribution: 'Google Earth Engine — Dynamic World V1',
        opacity: 0.6,
    });

    forestLayer.on('tileloadstart', (e) => console.log(`[FOREST DEBUG] Request: ${e.tile.src}`));
    forestLayer.on('tileload', (e) => console.log(`[FOREST DEBUG] Loaded: ${e.tile.src}`));
    forestLayer.on('tileerror', (e) => console.error(`[FOREST DEBUG] Failed: ${e.tile.src}`, e));
}

/* ---------- Toggle checkboxes ---------- */
function setupLayerToggles() {
    const countyCheckbox = document.getElementById('toggle-counties');
    if (countyCheckbox) {
        countyCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) countyLayer.addTo(map);
            else map.removeLayer(countyLayer);
        });
    }

    const forestCheckbox = document.getElementById('toggle-forest');
    if (forestCheckbox) {
        forestCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) forestLayer.addTo(map);
            else map.removeLayer(forestLayer);
        });
    }
}

export default { init };
