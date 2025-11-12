"""
earthengine/service.py
---------------------------------------------
Handles all Google Earth Engine (GEE) authentication,
initialization, and data processing.
"""

import ee
import logging
import os
import uuid
import requests
import rasterio # for debugging downloaded GeoTIFFs

# from config import CUR_COUNTY_GEOTIFF
# from state import set_value, get_value

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
    Generates a GEE tile URL for the 'trees' layer,
    AND downloads the corresponding GeoTIFF for simulation.
    
    Stores the tile URL and data file path in the global state.
    
    :param geometry: A GeoJSON geometry (as a Python dict)
    :return: A string containing the tile URL (for the frontend)
    """
    if not geometry:
        logger.warning("get_clipped_layer_url called with no geometry.")
        raise ValueError("No geometry provided for clipping.")

    try:
        # 1. Convert the standard GeoJSON dict to an ee.Geometry object
        ee_geometry = ee.Geometry(geometry)

        # 2. --- GEE SCRIPT (from plan.pdf & our chat) ---
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .median()
        
        # Isolate the 'trees' class (label '1')
        # forestMask = recentImage.select('label').eq(1)
        # We'll use a binary image (1=forest, 0=not) for the simulation
        # .selfMask() makes non-forest areas transparent for visualization
        # forestLayer = forestMask.selfMask() 
        
        # Get all bands
        landCoverLayer = recentImage.select('label')

        # 3. --- DYNAMIC CLIP ---
        #    Clip the global layer to the user's geometry
        clippedLayer = landCoverLayer.clip(ee_geometry)
        # clippedLayer = forestLayer.clip(ee_geometry)

        # 4. Define visualization parameters
        # visParams = {
        #   'min': 1, # '1' is the only value (forest)
        #   'max': 1,
        #   'palette': ['green']
        # }
        visParams = {
            'min': 0,  # Class 0 (Water)
            'max': 8,  # Class 8 (Snow/Ice)
            'palette': [
                '#419BDF',  # 0: Water
                '#397D49',  # 1: Trees
                '#88B053',  # 2: Grass
                '#7A87C6',  # 3: Flooded Vegetation
                '#E49635',  # 4: Crops
                '#DFC35A',  # 5: Shrub and Scrub
                '#C4281B',  # 6: Built
                '#A59B8F',  # 7: Bare
                '#B39FE1'   # 8: Snow and Ice
            ]
        }

        # --- PART 1: GET TILE URL (for Frontend Visualization) ---
        
        logger.info("Generating GEE tile URL...")
        map_id_object = ee.data.getMapId({
            'image': clippedLayer,
            'visParams': visParams
        })
        
        logger.debug(f"GEE getMapId() response object: {map_id_object}")

        if 'mapid' not in map_id_object:
            error_msg = map_id_object.get('error', {}).get('message', 'Unknown GEE error')
            logger.error(f"GEE failed to generate MapId. Response: {error_msg}")
            raise Exception(f"GEE Error: {error_msg}")

        # Success! Construct the URL and store it in the state.
        mapid = map_id_object['mapid']
        tile_url = f"https://earthengine.googleapis.com/v1/{mapid}/tiles/{{z}}/{{x}}/{{y}}"
        
        set_value('current_tile_url', tile_url) # <-- Store in state
        logger.info(f"Stored new GEE tile URL in state.")

        # --- PART 2: GET RASTER DATA (for Backend Simulation) ---
        
        logger.info("Downloading GeoTIFF for simulation...")
        
        # Get a download URL for the clipped image as a GeoTIFF
        # We re-clip (redundant but safe) and specify scale.
        # 30 meters is a good balance. 10m (native) may be too large.
        download_url = clippedLayer.getDownloadUrl({
            'name': 'forest_cover',
            'scale': 30,  # 30 meters per pixel. Adjust as needed.
            'crs': 'EPSG:4326', # Standard lat/lon
            'region': ee_geometry,
            'filePerBand': False,
            'format': 'GEO_TIFF'
        })
        
        logger.debug(f"GeoTIFF download URL: {download_url}")

        # Download the file
        response = requests.get(download_url)
        response.raise_for_status() # Will raise an error if download failed

        # Clean up the *old* simulation file, if one exists
        old_file_path = get_value('current_simulation_file')
        if old_file_path and os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
                logger.info(f"Removed old simulation file: {old_file_path}")
            except Exception as e:
                logger.warning(f"Could not remove old file: {e}")

        # Save the new file to our input directory
        file_name = f"forest_cover_input_{uuid.uuid4()}.tif"
        new_file_path = os.path.join(CUR_COUNTY_GEOTIFF, file_name)
        # new_file_path = os.path.join(SIM_INPUT_DIR, file_name)
        
        with open(new_file_path, 'wb') as f:
            f.write(response.content)
        
        # --- DEBUG: Print a sample of the GeoTIFF ---
        try:
            with rasterio.open(new_file_path) as dataset:
                # Read the first band
                band1 = dataset.read(1)
                # Get a sample (e.g., top-left 10x10 pixels)
                sample = band1[0:10, 0:10]
                logger.info(f"DEBUG: GeoTIFF data sample (top-left 10x10):\n{sample}")
                logger.info(f"DEBUG: GeoTIFF stats -> Dtype: {band1.dtype}, Min: {band1.min()}, Max: {band1.max()}, Shape: {band1.shape}")
        except Exception as e:
            logger.error(f"DEBUG: Could not read GeoTIFF sample: {e}")
            
        # Store the NEW file path in the state
        set_value('current_simulation_file', new_file_path) # <-- Store in state
        logger.info(f"New simulation file stored in state: {new_file_path}")
        # Return the tile_url, as the frontend needs it
        return tile_url

    except Exception as e:
        logger.error(f"Error during GEE processing in get_clipped_layer_url: {e}")
        raise