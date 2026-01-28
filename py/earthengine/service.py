"""
earthengine/service.py
---------------------------------------------
Handles all Google Earth Engine (GEE) authentication,
initialization, and data processing.
"""

import ee
import json
import logging
import os
import gzip
import shutil
import zipfile

from google.cloud import storage

from config import (
    GEE_PROJECT_NAME,
    GCS_FOREST_EXPORTS_FOLDER,
    SERVICE_ACCOUNT_JSON_PATH,
)
from utils.constants import STATE_ABBR_TO_FIPS

logger = logging.getLogger(__name__)

# --- GEE Initialization ---
def initialize_gee(project=GEE_PROJECT_NAME, service_account_json_path=SERVICE_ACCOUNT_JSON_PATH):
    """
    Initialize Earth Engine using:
    1) Explicit SERVICE_ACCOUNT_JSON_PATH (config.py), or
    2) GOOGLE_APPLICATION_CREDENTIALS already set in environment.

    Raises a clear error if neither is available.
    """

    # Case 1: Explicit path provided via config.py
    if service_account_json_path:
        if not os.path.exists(service_account_json_path):
            raise RuntimeError(
                f"SERVICE_ACCOUNT_JSON_PATH does not exist: {service_account_json_path}"
            )

        # Override / set ADC explicitly
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = service_account_json_path
        logger.info(
            "Initializing Earth Engine using SERVICE_ACCOUNT_JSON_PATH:"
        )

    # Case 2: Rely on environment (user already set GOOGLE_APPLICATION_CREDENTIALS)
    elif os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
        logger.info(
            "Initializing Earth Engine using GOOGLE_APPLICATION_CREDENTIALS from environment: %s",
            os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
        )

    # Case 3: Nothing provided → fail early
    else:
        raise RuntimeError(
            "Earth Engine credentials not found. "
            "Set GOOGLE_APPLICATION_CREDENTIALS or define SERVICE_ACCOUNT_JSON_PATH in config.py."
        )

    # Initialize Earth Engine (ADC is now guaranteed)
    try:
        ee.Initialize(project=project)
        logger.info("Earth Engine initialized successfully (project=%s).", project)
    except Exception as e:
        logger.exception("Earth Engine initialization failed.")
        raise

# Helper for region aoi definition using TIGER dataCollection

def region_from_tiger(county_name: str, state_fips_or_abbr: str):
    if not county_name or not state_fips_or_abbr:
        raise ValueError("county_name and state_fips_or_abbr are required")

    st = str(state_fips_or_abbr).strip()
    if len(st) == 2 and st.isalpha():
        st = STATE_ABBR_TO_FIPS.get(st.upper(), st)
    st = str(st).zfill(2)

    counties = ee.FeatureCollection('TIGER/2018/Counties')
    fc = counties.filter(ee.Filter.And(
        ee.Filter.eq('STATEFP', st),
        ee.Filter.eq('NAME', county_name)
    ))


    feat = fc.first()
    if feat is None:
        raise ValueError(f"County not found: {county_name} ({state_fips_or_abbr})")

    geom = fc.geometry().bounds()

    try:
        geom_info = geom.getInfo()
    except Exception as e:
        raise RuntimeError("Failed to materialize county geometry") from e

    if "coordinates" not in geom_info:
        raise RuntimeError("Unexpected geometry format from TIGER")

    return geom_info["coordinates"]

# These should be defined in config
# GCS_BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')
# GCS_FOREST_EXPORTS_FOLDER = 'exports/forest'   # example
# EXPORT_SCALE = 30
# EXPORT_CRS = 'EPSG:3857'


def export_forest_raster_async(geometry_geojson=None, bucket_name=None, filename_key=None,
                               scale=30, crs=None, max_pixels=1e13, file_format='GeoTIFF',
                               county_name: str = None, state_fips_or_abbr: str = None):
    if bucket_name is None or filename_key is None:
        raise ValueError("bucket_name and filename_key are required")

    if county_name and state_fips_or_abbr:
        region = region_from_tiger(county_name, state_fips_or_abbr)
        geom_obj = ee.Geometry(region)
    else:
        if geometry_geojson is None:
            raise ValueError("Either county_name+state_fips_or_abbr or geometry_geojson must be provided")
        if isinstance(geometry_geojson, str):
            geom_obj = ee.Geometry(json.loads(geometry_geojson))
        else:
            geom_obj = ee.Geometry(geometry_geojson)
        try:
            region = geom_obj.getInfo()
        except Exception:
            # try bounds as a safer fallback
            try:
                region = geom_obj.bounds().getInfo()
            except Exception as e:
                raise RuntimeError("Failed to serialize AOI for export; provide a simpler geometry or use county_name/state") from e

    dw_image = (
        ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        .filter(ee.Filter.date('2024-01-01', '2024-12-31'))
        .filterBounds(geom_obj)
        .median()
    )

    trees_prob = dw_image.select('trees').clip(geom_obj)

    file_prefix = f"{GCS_FOREST_EXPORTS_FOLDER.rstrip('/')}/{filename_key}"

    task = ee.batch.Export.image.toCloudStorage(
        image=trees_prob,
        description=f"dynamicworld_trees_{filename_key}",
        bucket=bucket_name,
        fileNamePrefix=file_prefix,
        region=region,
        scale=scale,
        crs=crs,
        maxPixels=int(max_pixels),
        fileFormat=file_format
    )
    task.start()
    return task.id



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

        # build a binary mask image for visualization
        forestMaskVis = forestMask.selfMask()
        visParams = {
            'min': 0, 'max': 1, 'palette': ['000000','00ff00']
        }
        map_id_object = ee.data.getMapId({
            'image': forestMaskVis,
            'visParams': visParams,
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


def download_gcs_file_to_local(bucket_name, blob_prefix, local_path, project=None):
    """
    List blobs in bucket_name matching blob_prefix and download an appropriate GeoTIFF.
    - blob_prefix: prefix used when exporting (e.g., 'exports/forest/county_key')
    - local_path: final path on local disk (e.g., /data/tifs/county_key.tif)
    Returns: path to the downloaded local file.
    Raises FileNotFoundError if nothing found.
    """
    storage_client = storage.Client(project=project)
    blobs = list(storage_client.list_blobs(bucket_name, prefix=blob_prefix))

    if not blobs:
        raise FileNotFoundError(f"No GCS objects found for prefix: {blob_prefix}")

    # Prefer common TIFF-like objects
    preferred = []
    for b in blobs:
        name = b.name.lower()
        if name.endswith('.tif') or name.endswith('.tif.gz') or name.endswith('.tif.zip') or name.endswith('.zip'):
            preferred.append(b)

    if preferred:
        selected = preferred[0]
    else:
        # fallback to first blob if no preferred extension
        selected = blobs[0]

    tmp_download = local_path + '.download'
    os.makedirs(os.path.dirname(tmp_download), exist_ok=True)
    selected.download_to_filename(tmp_download)

    # If gzipped, ungzip
    if selected.name.lower().endswith('.gz'):
        with gzip.open(tmp_download, 'rb') as f_in:
            with open(local_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        os.remove(tmp_download)
        return local_path

    # If zip: extract first .tif inside
    if selected.name.lower().endswith('.zip'):
        with zipfile.ZipFile(tmp_download, 'r') as z:
            tif_names = [n for n in z.namelist() if n.lower().endswith('.tif')]
            if not tif_names:
                os.remove(tmp_download)
                raise FileNotFoundError("Zip did not contain any .tif files")
            # extract first tif to local_path
            with z.open(tif_names[0]) as zf, open(local_path, 'wb') as out_f:
                shutil.copyfileobj(zf, out_f)
        os.remove(tmp_download)
        return local_path

    # Otherwise move tmp to final
    os.replace(tmp_download, local_path)
    return local_path

# --- LEGACY ---

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
