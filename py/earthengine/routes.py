"""
earthengine/routes.py
---------------------------------------------
API routes for GEE-related operations.
"""

from flask import Blueprint, request, jsonify
import logging
import os  # Added for accessing environment variables

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


# --- New Asynchronous Export Workflow ---

@gee_bp.route('/start-export', methods=['POST'])
def start_export_task():
    """
    STEP 1: Starts an asynchronous GEE export task.
    Returns a task_id to poll.
    """
    logger.info("API Call: /start-export")
    try:
        data = request.json
        if not data or 'geometry' not in data:
            logger.warning("API Call: /start-export missing 'geometry'")
            return jsonify({"error": "Missing 'geometry' in request body"}), 400
        
        # Get GCS bucket name from environment variable
        # YOU MUST SET THIS VARIABLE ON YOUR SERVER
        bucket_name = os.environ.get('GCS_BUCKET_NAME')
        if not bucket_name:
            logger.error("FATAL: GCS_BUCKET_NAME environment variable is not set.")
            return jsonify({"error": "Server configuration error: GCS bucket not specified."}), 500

        geometry = data['geometry']
        
        # Call the service function to START the task
        task_info = export_forest_geometry_async(geometry, bucket_name)
        
        logger.info(f"API Call: /start-export success. Task {task_info['task_id']} started.")
        # 202 Accepted: The request is accepted for processing, but is not complete.
        return jsonify(task_info), 202
    
    except Exception as e:
        logger.error(f"API Error: /start-export failed: {e}")
        return jsonify({ 'error': f'Failed to start export task: {e}' }), 500


@gee_bp.route('/check-status/<string:task_id>', methods=['GET'])
def check_export_status(task_id):
    """
    STEP 2: Checks the status of a GEE export task.
    If 'DONE', it triggers the GCS download to a local server path
    and returns the path.
    """
    logger.info(f"API Call: /check-status/{task_id}")
    if not task_id:
        return jsonify({"error": "task_id is required"}), 400
    
    try:
        # 1. Check GEE task status
        status_result = get_task_status(task_id)
        
        task_status = status_result.get('status')
        
        if task_status == 'PROCESSING':
            # Task is still running, tell client to poll again
            logger.info(f"Task {task_id} is still PROCESSING.")
            return jsonify({'status': 'PROCESSING'}), 200
        
        elif task_status == 'DONE':
            # --- Task is complete on GEE! ---
            # 2. Now, download the file from GCS to local server
            gcs_uri = status_result.get('gcs_uri')
            # Define a local path. 'local_data/exports/' is a good practice.
            local_path = f"local_data/exports/{task_id}.geojson"
            
            logger.info(f"Task {task_id} is DONE. Downloading {gcs_uri} to {local_path}...")
            
            try:
                # Call the download service function
                download_gcs_file_to_local(gcs_uri, local_path)
                
                logger.info(f"Task {task_id} successfully downloaded. Returning local path.")
                # Success! Return the final local path to the client.
                return jsonify({
                    'status': 'COMPLETED',
                    'local_path': local_path
                }), 200 # 200 OK, and the process is finished.
                
            except Exception as e:
                logger.error(f"Task {task_id} COMPLETED but local download FAILED: {e}")
                return jsonify({'status': 'FAILED', 'error': f'File download from GCS failed: {e}'}), 500

        elif task_status == 'FAILED':
            # GEE task itself failed
            logger.warning(f"Task {task_id} FAILED on GEE: {status_result.get('error')}")
            return jsonify(status_result), 200
        
        else:
            # e.g., 'CANCELLED' or unknown
            logger.warning(f"Task {task_id} has unhandled status: {task_status}")
            return jsonify(status_result), 200

    except Exception as e:
        logger.error(f"API Error: /check-status/{task_id} failed: {e}")
        return jsonify({ 'error': f'Failed to check task status: {e}' }), 500