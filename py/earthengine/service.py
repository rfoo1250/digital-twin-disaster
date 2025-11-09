"""
earthengine/service.py
---------------------------------------------
Handles all Google Earth Engine (GEE) authentication,
initialization, and data processing.
"""

import ee
import logging

logger = logging.getLogger(__name__)

def initialize_gee():
    """
    Authenticates (if needed) and initializes the GEE API.
    This should be called once on application startup.
    """
    try:
        # 1. AUTHENTICATE
        # As you requested, this will prompt for authentication
        # in your terminal the first time you run the app.
        # After the first run, it will use your saved credentials.
        ee.Authenticate() 
        
        # 2. INITIALIZE
        # You MUST replace this with your Google Cloud Project ID.
        # You can find this in your GEE Code Editor (Assets tab).
        PROJECT_ID = 'dmml-volunteering' 
        
        ee.Initialize(project=PROJECT_ID)
        logger.info(f"GEE Initialized successfully for project: {PROJECT_ID}")
        
    except Exception as e:
        logger.error(f"FATAL: Could not initialize GEE: {e}")
        # This is a critical failure. You might want to exit the app
        # if GEE is essential for all operations.
        raise e 

def get_clipped_layer_url(geometry):
    """
    Generates a dynamic GEE tile URL for the 'trees' layer,
    clipped to the provided GeoJSON geometry.
    
    :param geometry: A GeoJSON geometry (as a Python dict)
    :return: A string containing the tile URL
    """
    if not geometry:
        logger.warning("get_clipped_layer_url called with no geometry.")
        raise ValueError("No geometry provided for clipping.")

    try:
        # 1. Convert the standard GeoJSON dict to an ee.Geometry object
        ee_geometry = ee.Geometry(geometry)

        # 2. --- GEE SCRIPT (from plan.pdf [cite: 22-31] & our chat) ---
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .median()
        
        # Isolate the 'trees' class (label '1')
        forestMask = recentImage.select('label').eq(1)
        forestLayer = recentImage.updateMask(forestMask)
        
        # 3. --- DYNAMIC CLIP ---
        #    This is the key part: clip the global layer to the user's geometry
        clippedLayer = forestLayer.clip(ee_geometry)

        # 4. Define visualization parameters (using the corrected 'trees' band)
        visParams = {
          'bands': ['trees'],
          'min': 0.0,
          'max': 1.0,
          'palette': ['#FFFFFF00', 'green'] # Transparent to green
        }

        # 5. Get the map ID and URL for the *clipped* layer
        # 5. Get the map ID using the ee.data.getMapId() function.
        #    This function *will* return the 'urlFormat' key.
        map_id_object = ee.data.getMapId({
            'image': clippedLayer,
            'visParams': visParams
        })
        
        # 6. Log the *entire object* for debugging.
        # This will show us the REAL error (e.g., timeout)
        logger.info(f"GEE getMapId() response object: {map_id_object}")

        # 7. Check for the 'mapid' key. Its presence means success.
        if 'mapid' in map_id_object:
            # 8. Success! Manually construct the URL.
            mapid = map_id_object['mapid']
            # We use {z}, {x}, {y} which Leaflet will replace.
            tile_url = f"https://earthengine.googleapis.com/v1/{mapid}/tiles/{{z}}/{{x}}/{{y}}"
            
            logger.info(f"Generated new GEE tile URL: {tile_url}")
            return tile_url
        else:
            # 9. Failure. Log the actual error from GEE.
            error_msg = map_id_object.get('error', {}).get('message', 'Unknown GEE error')
            logger.error(f"GEE failed to generate MapId. Response: {error_msg}")
            raise Exception(f"GEE Error: {error_msg}")

    except Exception as e:
        logger.error(f"Error during GEE processing in get_clipped_layer_url: {e}")
        raise