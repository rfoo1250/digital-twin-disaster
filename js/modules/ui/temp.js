import GeoRasterLayer from "georaster-layer-for-leaflet";
import parseGeoraster from "georaster";

const GEE_TIFF_BASE_URL = '/data/geotiffs/'; // public or shared folder path

async function handleCountySelectionForGEE(feature) {
    try {
        await loadGEEClippedLayer(feature.geometry);
        const geeUrlOrFile = getGEEUrl();

        if (!geeUrlOrFile) {
            console.warn('[GEE WARN] No URL or GeoTIFF file info available.');
            showToast('No layer information found.');
            return;
        }

        // Remove any existing layer
        if (forestLayer) {
            try { map.removeLayer(forestLayer); } catch { }
            forestLayer = null;
        }

        // Build expected GeoTIFF file path (e.g., /data/geotiffs/county_06037.tif)
        let tiffPath = geeUrlOrFile.endsWith('.tif')
            ? `${GEE_TIFF_BASE_URL}${geeUrlOrFile}`
            : `${GEE_TIFF_BASE_URL}${geeUrlOrFile}.tif`;

        console.log(`[GEE INFO] Checking for GeoTIFF at: ${tiffPath}`);

        // ✅ Try loading GeoTIFF first
        let tiffLoaded = false;
        try {
            const headResp = await fetch(tiffPath, { method: 'HEAD' });
            if (headResp.ok) {
                console.log('[GEE INFO] GeoTIFF file found, loading...');
                const resp = await fetch(tiffPath);
                const buffer = await resp.arrayBuffer();
                const georaster = await parseGeoraster(buffer);

                forestLayer = new GeoRasterLayer({
                    georaster,
                    opacity: 0.8,
                    pixelValuesToColorFn: (values) => {
                        const val = values[0];
                        if (val === null) return null;
                        // simple palette mapping: low values -> brown, high -> green
                        const g = Math.min(255, Math.max(0, val));
                        return `rgb(${255 - g}, ${g}, 80)`;
                    },
                });

                forestLayer.addTo(map);
                showToast('GeoTIFF layer loaded locally.');
                tiffLoaded = true;
            } else {
                console.log('[GEE INFO] GeoTIFF not found, falling back to GEE tile URL.');
            }
        } catch (err) {
            console.warn('[GEE WARN] GeoTIFF fetch failed, falling back to GEE tile.', err);
        }

        // 🌀 Fallback: load the GEE tile URL if GeoTIFF unavailable
        if (!tiffLoaded) {
            console.log('[GEE INFO] Loading dynamic GEE layer...');
            const tileUrl = geeUrlOrFile.startsWith('http')
                ? geeUrlOrFile
                : await getGEEUrl();

            if (!tileUrl) {
                console.warn('[GEE WARN] No GEE tile URL found.');
                showToast('No layer available.');
                return;
            }

            forestLayer = L.tileLayer(tileUrl, {
                attribution: 'Google Earth Engine — dynamic tiles',
                opacity: 0.8,
            });

            if (isFocused) {
                forestLayer.addTo(map);
                showToast('Dynamic GEE layer loaded.');
            } else {
                console.log('[GEE DEBUG] Layer cached but not added (not focused).');
            }
        }

    } catch (error) {
        console.error('[GEE ERROR] Failed to load GEE/GeoTIFF layer:', error);
        showToast('Error loading map layer.');
    }
}
