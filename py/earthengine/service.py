import ee
import logging
from config import (
    PROJECT_ID,
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEBUG_MODE,
    API_PREFIX,
    CUR_COUNTY_GEOTIFF_FOLDER,
    OUTPUT_BASE,
    ROOSEVELT_FOREST_COVER_CSV
)

logger = logging.getLogger(__name__)

def initialize_gee():
    """
    Authenticates (if needed) and initializes the GEE API.
    Includes configuration-based project management.
    """
    try:
        ee.Authenticate()
        ee.Initialize(project=PROJECT_ID)
        logger.info(f"GEE Initialized successfully for project: {PROJECT_ID}")
    except Exception as e:
        logger.error(f"FATAL: Could not initialize GEE: {e}")
        raise e
    

def get_clipped_layer_url(geometry):
    """
    Generates a dynamic GEE tile URL for the 'trees' layer,
    clipped to the provided GeoJSON geometry.
    """
    if not geometry:
        logger.warning("get_clipped_layer_url called with no geometry.")
        raise ValueError("No geometry provided for clipping.")

    try:
        logger.info("Generating clipped GEE layer URL...")
        ee_geometry = ee.Geometry(geometry)
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .sort('system:time_start', False) \
            .first()
        logger.info("Fetched most recent Dynamic World image.")

        # Approach 3: Weighted blend based on probabilities
        landCoverLayer = ee.Image(0)  # Start with base value
        
        classes = [
            ('water', 0), 
            ('trees', 1), 
            ('grass', 2), 
            ('flooded_vegetation', 3), 
            ('crops', 4),
            ('shrub_and_scrub', 5), 
            ('built', 6), 
            ('bare', 7), 
            ('snow_and_ice', 8)
        ]
        
        for band_name, class_value in classes:
            prob = recentImage.select(band_name)
            landCoverLayer = landCoverLayer.where(prob.gte(0.4), class_value)
        
        logger.info("Created weighted land cover layer from probability bands.")

        # Clip to geometry
        clippedLayer = landCoverLayer.clip(ee_geometry)

        # Define visualization parameters
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
        
        map_id_object = ee.data.getMapId({
            'image': clippedLayer,
            'visParams': visParams
        })

        logger.info(f"GEE getMapId() response object: {map_id_object}")

        if 'mapid' in map_id_object:
            mapid = map_id_object['mapid']
            tile_url = f"https://earthengine.googleapis.com/v1/{mapid}/tiles/{{z}}/{{x}}/{{y}}"
            logger.info(f"Generated new GEE tile URL: {tile_url}")
            return tile_url
        else:
            error_msg = map_id_object.get('error', {}).get('message', 'Unknown GEE error')
            logger.error(f"GEE failed to generate MapId. Response: {error_msg}")
            raise Exception(f"GEE Error: {error_msg}")

    except Exception as e:
        logger.error(f"Error during GEE processing in get_clipped_layer_url: {e}")
        raise


# def get_config_summary():
#     """Returns a summary of key config settings for debugging/logging purposes."""
#     return {
#         'HOST': DEFAULT_HOST,
#         'PORT': DEFAULT_PORT,
#         'DEBUG_MODE': DEBUG_MODE,
#         'API_PREFIX': API_PREFIX,
#         'CUR_COUNTY_GEOTIFF': CUR_COUNTY_GEOTIFF_FOLDER,
#         'OUTPUT_BASE': OUTPUT_BASE,
#         'FOREST_CSV': ROOSEVELT_FOREST_COVER_CSV
#     }


# if __name__ == "__main__":
#     logger.basicConfig(level=logging.INFO)
#     logger.info("Launching GEE service with configuration:")
#     for k, v in get_config_summary().items():
#         logger.info(f"{k}: {v}")

#     initialize_gee()
