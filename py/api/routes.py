"""
routes.py
---------------------------------------------
Defines API endpoints for the Wildfire Simulation backend.
"""

from flask import Blueprint, request, jsonify
import logging
import traceback

from wildfire_sim.incinerate import run_wildfire_simulation

logger = logging.getLogger(__name__)
api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'message': 'Wildfire API is running'})

@api_bp.route('/api/simulate', methods=['POST'])
def simulate_wildfire():
    """Run the wildfire simulation using the ignition point (lat/lng)."""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400

        data = request.get_json()
        lat = data.get('lat')
        lng = data.get('lng')

        if lat is None or lng is None:
            return jsonify({'error': 'Missing required parameters: lat and lng'}), 400

        logger.info(f"Running wildfire simulation for point: ({lat}, {lng})")
        result = run_wildfire_simulation(lat, lng)

        return jsonify(result)

    except Exception as e:
        logger.error("Wildfire simulation failed", exc_info=True)
        return jsonify({
            'error': 'Internal server error during wildfire simulation',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500


def register_routes(app):
    """Registers all API blueprints with the Flask app."""
    app.register_blueprint(api_bp)
