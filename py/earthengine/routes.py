"""
earthengine/routes.py
---------------------------------------------
API routes for GEE-related operations.
"""

from flask import Blueprint, request, jsonify, current_app
import os
import logging
import re

from config import (
    GCS_BUCKET_NAME,
    GCS_FOREST_EXPORTS_FOLDER,
    GEE_PROJECT_NAME,
    GEOTIFF_EXPORT_SCALE,
    GEOTIFF_EXPORT_CRS,
    GEOTIFF_DIR,
)

from earthengine.service import (
    get_clipped_layer_url,
    export_forest_raster_async,
    get_task_status,
    download_gcs_file_to_local,
)

logger = logging.getLogger(__name__)

# Create a 'Blueprint'
# This is a module of routes that can be 'registered'
# with your main Flask app in app.py
gee_bp = Blueprint('gee_bp', __name__)


@gee_bp.route('/get_layer', methods=['POST'])
def get_dynamic_gee_layer():
    """
    This endpoint receives a GeoJSON geometry and returns a
    dynamic, clipped GEE tile URL. (For visualization)
    """
    try:
        data = request.json
        if not data or 'geometry' not in data:
            logger.warning("API Call: /get_layer missing 'geometry'")
            return jsonify({"error": "Missing 'geometry' in request body"}), 400
        
        # Call the service function to do the GEE work
        url = get_clipped_layer_url(data['geometry'])
        
        return jsonify({ 'url': url })

    except Exception as e:
        logger.error(f"API Error: /get_layer failed: {e}")
        return jsonify({ 'error': 'Failed to process GEE request' }), 500

def sanitize_filename(name):
    """Utility to create a safe filename"""
    name = name.replace(' ', '_') # Replace spaces
    name = re.sub(r'[^a-zA-Z0-9_-]', '', name) # Remove special chars
    return name


@gee_bp.route('/start-export', methods=['POST'])
def start_export():
    data = request.get_json()
    geometry = data.get('geometry')
    countyName = data.get('countyName')
    stateAbbr = data.get('stateAbbr')
    if not (geometry and countyName and stateAbbr):
        return jsonify(status='ERROR', error='Missing required params'), 400

    # sanitize function: implement or reuse your sanitizer
    def sanitize(s):
        return "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in s).strip('_').lower()

    filename_key = f"{sanitize(countyName)}_{sanitize(stateAbbr)}"
    local_tif_path = os.path.join(GEOTIFF_DIR, f"{filename_key}.tif")

    # If file already exists locally, return immediately
    if os.path.exists(local_tif_path):
        return jsonify(status='COMPLETED', local_path=local_tif_path, filename_key=filename_key)

    # Start raster export via Earth Engine -> GCS
    try:
        task_id = export_forest_raster_async(geometry, GCS_BUCKET_NAME, filename_key,
                                             scale=GEOTIFF_EXPORT_SCALE, crs=GEOTIFF_EXPORT_CRS)
    except Exception as e:
        current_app.logger.exception("Failed to start raster export")
        return jsonify(status='ERROR', error=str(e)), 500

    return jsonify(status='PROCESSING', task_id=task_id, filename_key=filename_key)

@gee_bp.route('/check-status/<task_id>', methods=['GET'])
def check_export_status(task_id):
    filename_key = request.args.get('filename_key')
    if not filename_key:
        return jsonify(status='ERROR', error='missing filename_key param'), 400

    # get_task_status should map EE states to 'PROCESSING'/'DONE'/'FAILED'
    try:
        status_info = get_task_status(task_id)
    except Exception as e:
        current_app.logger.exception("Failed to get task status")
        return jsonify(status='ERROR', error=str(e)), 500

    status = status_info.get('status')
    if status == 'PROCESSING':
        return jsonify(status='PROCESSING')

    if status == 'FAILED':
        return jsonify(status='FAILED', error=status_info.get('error')), 500

    # status == 'DONE' (or equivalent)
    blob_prefix = f"{GCS_FOREST_EXPORTS_FOLDER.rstrip('/')}/{filename_key}"
    local_path = os.path.join(GEOTIFF_DIR, f"{filename_key}.tif")
    try:
        downloaded_path = download_gcs_file_to_local(GCS_BUCKET_NAME, blob_prefix, local_path, project=GEE_PROJECT_NAME)
        return jsonify(status='COMPLETED', local_path=downloaded_path)
    except FileNotFoundError:
        # GCS object not yet available — let the frontend poll again
        current_app.logger.info("Export task DONE but GCS object not yet found. Will let frontend poll again.")
        return jsonify(status='PROCESSING'), 202
    except Exception as e:
        current_app.logger.exception("Error downloading exported file from GCS")
        return jsonify(status='ERROR', error=str(e)), 500
