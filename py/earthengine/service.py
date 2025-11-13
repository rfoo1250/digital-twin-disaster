"""
earthengine/service.py
---------------------------------------------
Handles all Google Earth Engine (GEE) authentication,
initialization, and data processing.

This file contains two main workflows:
1.  Tile Generation: (get_clipped_layer_url)
    - Generates a map tile URL for visualizing data in a web map.
    - Fast, asynchronous, and handled by GEE servers.
2.  Data Export: (export_forest_geometry_async, get_task_status, download_gcs_file_to_local)
    - Exports the actual GeoJSON data for use in analysis.
    - A 3-step asynchronous process: Start -> Poll -> Download.
"""

import ee
import logging
import uuid  # For unique export filenames
import os    # For creating local directories

# This library is required for the GCS download function.
# Install with: pip install google-cloud-storage
from google.cloud import storage

logger = logging.getLogger(__name__)

# --- 1. GEE INITIALIZATION ---

def initialize_gee():
    """
    Authenticates (if needed) and initializes the GEE API.
    This should be called once on application startup.
    """
    try:
        # 1. AUTHENTICATE
        # Prompts for authentication in the terminal on first run.
        # Uses saved credentials on subsequent runs.
        ee.Authenticate() 
        
        # 2. INITIALIZE
        # You MUST replace this with your Google Cloud Project ID.
        PROJECT_ID = 'dmml-volunteering' 
        
        ee.Initialize(project=PROJECT_ID)
        logger.info(f"GEE Initialized successfully for project: {PROJECT_ID}")
        
    except Exception as e:
        logger.error(f"FATAL: Could not initialize GEE: {e}")
        # This is a critical failure. The app may need to exit
        # if GEE is essential for all operations.
        raise e 

# --- 2. WORKFLOW 1: TILE GENERATION (For Web Map Visualization) ---

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

        # 2. --- GEE SCRIPT ---
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .median()
        
        # Isolate the 'trees' class (label '1')
        forestMask = recentImage.select('label').eq(1)
        forestLayer = recentImage.updateMask(forestMask)
        
        # 3. --- DYNAMIC CLIP ---
        clippedLayer = forestLayer.clip(ee_geometry)

        # 4. Define visualization parameters
        visParams = {
          'bands': ['trees'],
          'min': 0.0,
          'max': 1.0,
          'palette': ['#FFFFFF00', 'green'] # Transparent to green
        }

        # 5. Get the map ID using the ee.data.getMapId() function.
        map_id_object = ee.data.getMapId({
            'image': clippedLayer,
            'visParams': visParams
        })
        
        logger.info(f"GEE getMapId() response object: {map_id_object}")

        # 7. Check for the 'mapid' key.
        if 'mapid' in map_id_object:
            # 8. Success! Manually construct the URL.
            mapid = map_id_object['mapid']
            # {z}, {x}, {y} are placeholders for Leaflet/map clients
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


# --- 3. WORKFLOW 2: ASYNC DATA EXPORT (For Analysis/Simulation) ---
# 
# This is a 3-step process:
# 1. export_forest_geometry_async
# 2. get_task_status (polling)
# 3. download_gcs_file_to_local

def export_forest_geometry_async(geometry, bucket_name):
    """
    STEP 1: Starts an asynchronous GEE task to export forest geometry
    to a Google Cloud Storage (GCS) bucket.

    :param geometry: A GeoJSON geometry (as a Python dict)
    :param bucket_name: The name of your GCS bucket (e.g., 'dmml-gee-exports')
    :return: A dictionary containing the 'task_id' of the started job.
    """
    if not geometry:
        logger.warning("export_forest_geometry_async called with no geometry.")
        raise ValueError("No geometry provided for export.")
    if not bucket_name:
        logger.error("No GCS_BUCKET_NAME provided for export.")
        raise ValueError("GCS bucket name is not configured.")

    try:
        # --- (GEE Script: Get Forest Vectors) ---
        ee_geometry = ee.Geometry(geometry)
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .median()
        forestMask = recentImage.select('label').eq(1).selfMask()

        forestVectors = forestMask.reduceToVectors(
            geometry=ee_geometry,
            scale=10,  # 10m scale for DynamicWorld
            crs=recentImage.projection(),
            maxPixels=1e10
        )

        # --- (Configure and Start the Export Task) ---
        
        # Create a unique file name to prevent collisions
        file_prefix = f"forest_exports/export_{uuid.uuid4()}"

        logger.info(f"Starting GEE export task. File will be at: gs://{bucket_name}/{file_prefix}.geojson")

        task = ee.Export.table.toCloudStorage(
            collection=forestVectors,
            description='ForestGeometryExport',
            bucket=bucket_name,
            fileNamePrefix=file_prefix,
            fileFormat='GeoJSON'
        )

        # Start the task on GEE's servers
        task.start()
        
        logger.info(f"Task {task.id} successfully started.")
        return {'task_id': task.id}

    except Exception as e:
        logger.error(f"Error starting GEE export task: {e}")
        raise

def get_task_status(task_id):
    """
    STEP 2: Checks the status of a running GEE task (polled by your app).
    Returns the GCS path when complete.
    
    :param task_id: The ID of the task (from export_forest_geometry_async)
    :return: A dictionary with the task status and (if complete) the gcs_uri.
    """
    if not task_id:
        logger.warning("get_task_status called with no task_id.")
        raise ValueError("No task_id provided to check status.")
    
    try:
        status = ee.data.getTaskStatus(task_id)
        
        # 'state' can be: 'RUNNING', 'READY', 'COMPLETED', 'FAILED', 'CANCELLED'
        task_state = status.get('state')
        
        if task_state == 'RUNNING' or task_state == 'READY':
            logger.info(f"Task {task_id} is still {task_state}.")
            return {
                'status': 'PROCESSING',
                'task_id': task_id
            }
        
        elif task_state == 'COMPLETED':
            # --- SUCCESS ---
            # The 'destination_uris' key holds the full path to the GCS file(s)
            gcs_uri = status.get('destination_uris', [None])[0]
            
            if not gcs_uri:
                logger.error(f"Task {task_id} COMPLETED but no destination_uris found.")
                return {'status': 'FAILED', 'error': 'Completed but no file path found.'}

            logger.info(f"Task {task_id} is COMPLETED. File at: {gcs_uri}")
            return {
                'status': 'DONE',
                'task_id': task_id,
                'gcs_uri': gcs_uri  # This is the path to download from
            }

        elif task_state == 'FAILED':
            error_msg = status.get('error_message', 'Unknown error')
            logger.error(f"Task {task_id} FAILED: {error_msg}")
            return {
                'status': 'FAILED',
                'task_id': task_id,
                'error': error_msg
            }
        
        else:
            # e.g., 'CANCELLED' or other states
            logger.warning(f"Task {task_id} has unhandled state: {task_state}")
            return {'status': task_state}

    except Exception as e:
        logger.error(f"Error checking status for task {task_id}: {e}")
        raise

def download_gcs_file_to_local(gs_uri, local_file_path):
    """
    STEP 3: Downloads a file from a GCS URI to a specified local path.
    Assumes the server is authenticated to GCS (e.g., via env var).

    :param gs_uri: The GCS path (e.g., 'gs://bucket-name/file.geojson')
    :param local_file_path: The local path to save to (e.g., 'downloads/forest.geojson')
    :return: The local_file_path on success
    """
    if not gs_uri.startswith('gs://'):
        raise ValueError("Invalid GCS URI, must start with 'gs://'")

    try:
        # Assumes your server is authenticated, e.g., via
        # GOOGLE_APPLICATION_CREDENTIALS env var.
        # Uses the project_id from initialize_gee() context.
        storage_client = storage.Client(project='dmml-volunteering')

        # Parse the gs:// URI
        parts = gs_uri.replace('gs://', '').split('/', 1)
        bucket_name = parts[0]
        blob_name = parts[1]

        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        # Ensure the local directory exists before downloading
        local_dir = os.path.dirname(local_file_path)
        if local_dir: # Check if it's not just a filename
            os.makedirs(local_dir, exist_ok=True)

        # Download the file
        blob.download_to_filename(local_file_path)
        
        logger.info(f"Successfully downloaded {gs_uri} to {local_file_path}")
        return local_file_path

    except Exception as e:
        logger.error(f"Failed to download {gs_uri} to {local_file_path}: {e}")
        # This could be a GCS permissions error or file-not-found.
        raise