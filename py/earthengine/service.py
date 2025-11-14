"""
earthengine/service.py
---------------------------------------------
Handles all Google Earth Engine (GEE) authentication,
initialization, and data processing.
"""

import ee
import logging
# import uuid
import os
from google.cloud import storage
# from datetime import datetime, timedelta

from config import GCS_FOREST_EXPORTS_FOLDER

logger = logging.getLogger(__name__)

# --- GEE Initialization ---

def initialize_gee():
    """
    Authenticates (if needed) and initializes the GEE API.
    This should be called once on application startup.
    """
    try:
        ee.Authenticate() 
        
        # Use the project ID from your original file
        PROJECT_ID = 'dmml-volunteering'
        
        ee.Initialize(project=PROJECT_ID)
        logger.info(f"GEE Initialized successfully for project: {PROJECT_ID}")
        
    except Exception as e:
        logger.error(f"FATAL: Could not initialize GEE: {e}")
        raise e 

# --- GEE TILE LAYER (Visualization) ---

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
        ee_geometry = ee.Geometry(geometry)
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .median()
        
        forestMask = recentImage.select('label').eq(1)
        forestLayer = recentImage.updateMask(forestMask)
        clippedLayer = forestLayer.clip(ee_geometry)

        # FIXME: still does not show green only pixels, gradient still there
        visParams = {
          'bands': ['trees'],
          'palette': ['green']
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

# --- ASYNC EXPORT (To GCS) ---

def export_forest_geometry_async(geometry, bucket_name, filename_key):
    """
    Starts an asynchronous GEE task to export forest geometry.
    Uses filename_key for the GCS filename.
    Returns the GEE-generated task.id.
    
    :param geometry: A GeoJSON geometry (as a Python dict)
    :param bucket_name: The name of your GCS bucket
    :param filename_key: The unique, sanitized key (e.g., "Maricopa_AZ")
    :return: A dictionary containing the GEE-generated 'task_id'
    """
    if not geometry: raise ValueError("No geometry")
    if not bucket_name: raise ValueError("GCS bucket name not configured")
    if not filename_key: raise ValueError("filename_key is required")

    try:
        # Use the human-readable key for the GCS file path
        file_prefix = f"{GCS_FOREST_EXPORTS_FOLDER}/{filename_key}"

        ee_geometry = ee.Geometry(geometry)
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection.filter(ee.Filter.date('2024-01-01', '2024-12-31')).median()
        forestMask = recentImage.select('label').eq(1).selfMask()
        forestVectors = forestMask.reduceToVectors(
            geometry=ee_geometry,
            scale=10,
            crs=recentImage.projection(),
            maxPixels=1e10
        )

        logger.info(f"Configuring GEE export. File will be at: gs://{bucket_name}/{file_prefix}.geojson")

        task = ee.batch.Export.table.toCloudStorage(
            collection=forestVectors,
            description=filename_key,    # <-- Use key as a human-readable label
            bucket=bucket_name,
            fileNamePrefix=file_prefix,  # <-- Use key for the filename
            fileFormat='GeoJSON'
            # We do NOT provide 'taskId' here
        )
        
        # Call start() with no arguments. This is the correct syntax.
        task.start()
        
        # task.id is now the GEE-generated ID (e.g., "P7NDW...")
        logger.info(f"Task {task.id} (for {filename_key}) successfully started.")
        return {'task_id': task.id}

    except Exception as e:
        logger.error(f"Error starting GEE export task: {e}")
        raise

# --- ASYNC EXPORT (To Google Drive - Alternative) ---

def export_forest_geometry_to_drive(geometry, file_name="forest_geometry"):
    """
    Starts an asynchronous GEE task to export forest geometry
    to your Google Drive root folder.
    """
    if not geometry:
        logger.warning("export_forest_geometry_to_drive called with no geometry.")
        raise ValueError("No geometry provided for export.")

    try:
        ee_geometry = ee.Geometry(geometry)
        dwCollection = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        recentImage = dwCollection \
            .filter(ee.Filter.date('2024-01-01', '2024-12-31')) \
            .median()
        forestMask = recentImage.select('label').eq(1).selfMask()
        forestVectors = forestMask.reduceToVectors(
            geometry=ee_geometry,
            scale=10,
            crs=recentImage.projection(),
            maxPixels=1e10
        )

        logger.info(f"Starting GEE export task to Google Drive. File: {file_name}.geojson")

        # --- FIX IS HERE ---
        # Changed ee.Export to ee.batch.Export
        task = ee.batch.Export.table.toDrive(
            collection=forestVectors,
            description='ForestGeometryExport_to_Drive',
            fileNamePrefix=file_name,
            fileFormat='GeoJSON'
        )
        # --- END FIX ---
        
        task.start()
        
        logger.info(f"Task {task.id} successfully started (exporting to Drive).")
        return {'task_id': task.id}

    except Exception as e:
        logger.error(f"Error starting GEE export-to-Drive task: {e}")
        raise

# --- TASK STATUS & DOWNLOAD ---

def get_task_status(task_id):
    """
    Checks the status of a running GEE task.
    Returns the GCS path when complete.
    """
    if not task_id:
        raise ValueError("No task_id provided to check status.")
    
    try:
        # ee.data.getTaskStatus returns a list of tasks.
        # We need to get the first (and only) item from that list.
        status_list = ee.data.getTaskStatus(task_id)
        
        if not status_list:
            logger.error(f"No task found with ID {task_id}")
            return {'status': 'FAILED', 'error': 'Task ID not found.'}

        status = status_list[0]
        task_state = status.get('state')
        
        if task_state == 'RUNNING' or task_state == 'READY':
            logger.info(f"Task {task_id} is still {task_state}.")
            return { 'status': 'PROCESSING', 'task_id': task_id }
        
        elif task_state == 'COMPLETED':
            gcs_uri = status.get('destination_uris', [None])[0]
            if not gcs_uri:
                logger.error(f"Task {task_id} COMPLETED but no destination_uris found.")
                return {'status': 'FAILED', 'error': 'Completed but no file path found.'}
            logger.info(f"Task {task_id} is COMPLETED. File at: {gcs_uri}")
            return { 'status': 'DONE', 'task_id': task_id, 'gcs_uri': gcs_uri }

        elif task_state == 'FAILED':
            error_msg = status.get('error_message', 'Unknown error')
            logger.error(f"Task {task_id} FAILED: {error_msg}")
            return { 'status': 'FAILED', 'task_id': task_id, 'error': error_msg }
        
        else:
            logger.warning(f"Task {task_id} has unhandled state: {task_state}")
            return {'status': task_state}

    except Exception as e:
        logger.error(f"Error checking status for task {task_id}: {e}")
        raise

def download_gcs_file_to_local(gs_uri, local_file_path):
    """
    Downloads a file from a GCS URI to a specified local path.
    Assumes the server is authenticated to GCS.
    """
    if not gs_uri.startswith('gs://'):
        raise ValueError("Invalid GCS URI, must start with 'gs://'")

    try:
        # Use the project ID from your original file
        storage_client = storage.Client(project='dmml-volunteering')

        parts = gs_uri.replace('gs://', '').split('/', 1)
        bucket_name = parts[0]
        blob_name = parts[1]

        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        local_dir = os.path.dirname(local_file_path)
        if local_dir:
            os.makedirs(local_dir, exist_ok=True)

        blob.download_to_filename(local_file_path)
        
        logger.info(f"Successfully downloaded {gs_uri} to {local_file_path}")
        return local_file_path

    except Exception as e:
        logger.error(f"Failed to download {gs_uri} to {local_file_path}: {e}")
        raise