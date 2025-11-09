"""
earthengine/routes.py
---------------------------------------------
API routes for GEE-related operations.
"""

from flask import Blueprint, request, jsonify
from earthengine.service import get_clipped_layer_url
import logging

logger = logging.getLogger(__name__)

# Create a 'Blueprint'
# This is a module of routes that can be 'registered'
# with your main Flask app in app.py
gee_bp = Blueprint('gee_bp', __name__)


@gee_bp.route('/get_layer', methods=['POST'])
def get_dynamic_gee_layer():
    """
    This endpoint receives a GeoJSON geometry and returns a
    dynamic, clipped GEE tile URL.
    """
    try:
        data = request.json
        if not data or 'geometry' not in data:
            logger.warning("API Call: get_layer missing 'geometry'")
            return jsonify({"error": "Missing 'geometry' in request body"}), 400
        
        # Call the service function to do the GEE work
        url = get_clipped_layer_url(data['geometry'])
        
        return jsonify({ 'url': url })

    except Exception as e:
        logger.error(f"API Error: /get-layer failed: {e}")
        return jsonify({ 'error': 'Failed to process GEE request' }), 500