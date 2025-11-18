"""
earthengine/routes.py
---------------------------------------------
API routes for GEE-related operations.
"""

from flask import Blueprint, request, jsonify
import logging
import os
import re # For sanitizing
from config import (
    GEOJSON_DIR,
    GCS_FOREST_EXPORTS_FOLDER,
    GCS_BUCKET_NAME
)
# Import ALL the service functions we need
from earthengine.service import (
    get_clipped_layer_url,
    export_forest_geometry_async,
    get_task_status,
    download_gcs_file_to_local
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
def start_export_task():
    """
    STEP 1: Starts an async GEE export task *or* returns a cached file.
    Uses countyName and stateAbbr as the cache key / task_id.
    """
    logger.info("API Call: /start-export")
    try:
        data = request.json
        geometry = data.get('geometry')
        county_name = data.get('countyName')
        state_abbr = data.get('stateAbbr')

        if not all([geometry, county_name, state_abbr]):
            return jsonify({"error": "Missing 'geometry', 'countyName', or 'stateAbbr'"}), 400
        
        # Create the unique, predictable key
        filename_key = f"{sanitize_filename(county_name)}_{sanitize_filename(state_abbr)}"
        local_path = f"{GEOJSON_DIR}/{filename_key}.geojson"

        bucket_name = GCS_BUCKET_NAME
        if not bucket_name:
            logger.error("FATAL: GCS_BUCKET_NAME environment variable is not set.")
            return jsonify({"error": "Server configuration error"}), 500

        # --- CACHE CHECK ---
        if os.path.exists(local_path):
            logger.info(f"CACHE HIT: File {local_path} already exists.")
            return jsonify({
                'status': 'COMPLETED',
                'local_path': local_path,
                'filename_key': filename_key
            }), 200 # 200 OK (immediate success)
        
        logger.info(f"CACHE MISS: Starting new export task for {filename_key}")
        
        # Call the service, which will return the GEE-generated task_id
        task_info = export_forest_geometry_async(geometry, bucket_name, filename_key)
        
        # task_info is {'task_id': 'P7NDW...'}
        
        logger.info(f"API Call: /start-export success. Task {task_info['task_id']} started for {filename_key}.")
        # Return BOTH the task_id (for polling) and the key (for state)
        return jsonify({
            'status': 'PROCESSING',
            'task_id': task_info['task_id'],
            'filename_key': filename_key
        }), 202 # 202 Accepted (newly started)
    
    except Exception as e:
        logger.error(f"API Error: /start-export failed: {e}")
        return jsonify({ 'error': f'Failed to start export task: {e}' }), 500


@gee_bp.route('/check-status/<string:task_id>', methods=['GET'])
def check_export_status(task_id):
    """
    STEP 2: Checks the status of a GEE export task using its GEE-generated ID.
    """
    logger.info(f"API Call: /check-status/{task_id}")
    if not task_id:
        return jsonify({"error": "task_id is required"}), 400
    
    try:
        county_key = request.args.get('countyKey')
        if not county_key:
            return jsonify({'error': 'Missing required query parameter: countyKey'}), 400

        status_result = get_task_status(task_id) # Use GEE-generated task_id
        task_status = status_result.get('status')
        
        if task_status == 'PROCESSING':
            logger.info(f"Task {task_id} is still PROCESSING.")
            return jsonify({'status': 'PROCESSING'}), 200
        
        elif task_status == 'DONE':
            if not county_key:
                logger.error("Missing 'countyKey' parameter in request.")
                return jsonify({'status': 'FAILED', 'error': 'Missing countyKey parameter'}), 400

            gcs_uri = f"gs://{GCS_BUCKET_NAME}/{GCS_FOREST_EXPORTS_FOLDER}/{county_key}.geojson"
            logger.info(f"GCS URI for task {task_id}: {gcs_uri}")

            local_path = f"{GEOJSON_DIR}/{county_key}.geojson"
            logger.info(f"Task {task_id} is DONE. Downloading {gcs_uri} to {local_path}...")

            try:
                download_gcs_file_to_local(gcs_uri, local_path)
                logger.info(f"Task {task_id} successfully downloaded.")
                return jsonify({
                    'status': 'COMPLETED',
                    'local_path': local_path
                }), 200
            except Exception as e:
                logger.error(f"Task {task_id} COMPLETED but local download FAILED: {e}")
                return jsonify({'status': 'FAILED', 'error': f'File download from GCS failed: {e}'}), 500

        elif task_status == 'FAILED':
            logger.warning(f"Task {task_id} FAILED on GEE: {status_result.get('error')}")
            return jsonify(status_result), 200
        
        else:
            logger.warning(f"Task {task_id} has unhandled status: {task_status}")
            return jsonify(status_result), 200

    except Exception as e:
        logger.error(f"API Error: /check-status/{task_id} failed: {e}")
        return jsonify({ 'error': f'Failed to check task status: {e}' }), 500