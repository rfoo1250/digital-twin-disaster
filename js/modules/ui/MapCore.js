// MapCore.js
// Core map initialization, county layers, styling, and UI helpers

import CONFIG from "../../config.js";
import { getCountyGeoData } from "../services/DataManager.js";
import { fipsToState } from "../../utils/constants.js";
import { showToast } from "../../utils/toast.js";

// Shared map reference
let map = null;
let countyLayer = null;
let selectedCounty = null;

// Styles
const defaultCountyStyle = { color: "#333", weight: 1, opacity: 0.6, fillOpacity: 0 };
const highlightCountyStyle = { color: "#111", weight: 3, opacity: 0.95, fillOpacity: 0.08 };
const dimCountyStyle = { color: "#999", weight: 0.5, opacity: 0.2, fillOpacity: 0 };

function init() {
    console.log("[INFO] Initializing Leaflet map (MapCore)...");
    
    // dont work
    // const _oldSetPos = L.DomUtil.setPosition;
    // L.DomUtil.setPosition = function (el, point, round) {
    //     // force rounding
    //     _oldSetPos(el, point.round(), true);
    // };

    // map = L.map("map").setView(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM);
    // dont work
    map = L.map("map", {
        zoomAnimation: false,
        zoomSnap: 1,        // force integer zooms
        zoomDelta: 1
    }).setView(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM);

    // Create custom panes for layer ordering
    map.createPane("tilePane");
    map.createPane("forestPane");
    map.createPane("wildfireSimPane");
    map.createPane("overlayPane");
    map.createPane("markerPane");

    map.getPane("tilePane").style.zIndex = 200;
    map.getPane("forestPane").style.zIndex = 300;
    map.getPane("wildfireSimPane").style.zIndex = 400;
    map.getPane("overlayPane").style.zIndex = 500;
    map.getPane("markerPane").style.zIndex = 600;

    // Base tile
    L.tileLayer(CONFIG.TILE_LAYER_URL, {
        attribution: CONFIG.TILE_LAYER_ATTRIBUTION,
    }).addTo(map);

    // Load county boundaries
    const countyData = getCountyGeoData();
    if (countyData) {
        countyLayer = L.geoJSON(countyData, {
            style: defaultCountyStyle,
            onEachFeature: onEachCountyFeature,
            pane: "overlayPane"
        }).addTo(map);
    }

    console.log("[INFO] MapCore initialization complete.");
}

function onEachCountyFeature(feature, layer) {
    layer.on("click", () => {
        selectedCounty = layer;

        const name = feature.properties.NAME || "Unknown";
        let stateCode = "";
        if (feature.properties.STATE) {
            const code = feature.properties.STATE.toString().padStart(2, "0");
            stateCode = fipsToState[code] || code;
        }

        updateCountyLabel(`Selected: ${name}${stateCode ? ", " + stateCode : ""}`);

        countyLayer.eachLayer((l) => {
            if (l === layer) l.setStyle(highlightCountyStyle);
            else l.setStyle(defaultCountyStyle);
        });
    });
}

function updateCountyLabel(text) {
    const container = document.getElementById("county_selected_text");
    if (!container) return;

    container.textContent = text;
    container.classList.add("label-flash");

    setTimeout(() => {
        container.classList.remove("label-flash");
    }, CONFIG.COUNTY_LABEL_FLASH_DURATION);
}

function getMap() {
    return map;
}

function getCountyLayer() {
    return countyLayer;
}

function getSelectedCounty() {
    return selectedCounty;
}

function setSelectedCounty(c) {
    selectedCounty = c;
}

export default {
    init,
    getMap,
    getCountyLayer,
    getSelectedCounty,
    setSelectedCounty,
    defaultCountyStyle,
    highlightCountyStyle,
    dimCountyStyle
};