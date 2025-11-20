"""
routes.py
---------------------------------------------
Defines and registers all API blueprints for the application.
"""

from flask import Blueprint, request, jsonify, send_from_directory, abort
import logging
import traceback
import os

from config import (
    API_PREFIX, 
    BASE_DIR,
    GEOTIFF_DIR
)
from wildfire_sim.sca import run_geotiff_simulation

logger = logging.getLogger(__name__)

# --- SIMULATION BLUEPRINT ---
api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'message': 'Wildfire API is running'})

@api_bp.route('/data/shared/geotiffs/<path:filename>', methods=['GET'])
def serve_geotiff(filename):
    """
    Serve static GeoTIFF files from the configured GEOTIFF_DIR.
    Allows the frontend to access shared forest rasters for demos.
    """
    try:
        full_path = os.path.join(GEOTIFF_DIR, filename)
        if not os.path.exists(full_path):
            logger.warning(f"GeoTIFF not found: {full_path}")
            abort(404)

        logger.info(f"Serving GeoTIFF file: {full_path}")
        return send_from_directory(GEOTIFF_DIR, filename)

    except Exception as e:
        logger.error(f"Failed to serve GeoTIFF {filename}: {e}")
        return jsonify({
            "error": "Failed to serve GeoTIFF",
            "message": str(e)
        }), 500
        
@api_bp.route('/simulate_wildfire', methods=['GET'])
def simulate_wildfire():
    """
    Run wildfire simulation based on a local GeoTIFF file.
    Expects query parameters: countyKey, igniPointLat, igniPointLon
    """
    try:
        # 1. Get arguments from the request
        county_key = request.args.get('countyKey')
        igni_lat_str = request.args.get('igniPointLat')
        igni_lon_str = request.args.get('igniPointLon')

        # 2. Validate arguments
        if not all([county_key, igni_lat_str, igni_lon_str]):
            missing_params = []
            if not county_key: missing_params.append('countyKey')
            if not igni_lat_str: missing_params.append('igniPointLat')
            if not igni_lon_str: missing_params.append('igniPointLon')
            return jsonify({'success': False, 'error': 'Missing query parameters', 'message': f'Missing required query parameters: {", ".join(missing_params)}'}), 400

        try:
            igni_lat = float(igni_lat_str)
            igni_lon = float(igni_lon_str)
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid parameter format', 'message': 'igniPointLat and igniPointLon must be valid numbers.'}), 400

        # 3. Run the simulation (defined in sca_geotiff.py)
        logger.info(f"Running GeoTIFF simulation for {county_key} at ({igni_lat}, {igni_lon})")
        
        # This function will return an absolute path to the output directory
        # Run sim function here
        output_dir_absolute = run_geotiff_simulation(county_key, igni_lat, igni_lon)

        # 4. Format the output path to be relative to the project's BASE_DIR
        #    This is what you requested, matching the 'incinerate.py' style.
        relative_output_dir = os.path.relpath(output_dir_absolute, BASE_DIR)
        
        # Clean up path (e.g., '..\wildfire_output\sim_run' -> 'wildfire_output/sim_run')
        final_output_path = os.path.normpath(relative_output_dir).replace(os.path.sep, '/')

        # 5. Return success response
        return jsonify({
            "success": True,
            "message": f"Simulation for {county_key} complete.",
            "output_dir": final_output_path
        })

    # --- Error Handling (matching incinerate.py) ---
    except FileNotFoundError as e:
        logger.error(f"GeoTIFF simulation failed: File not found. {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'File not found', 'message': str(e)}), 404
    except (IndexError, ValueError) as e:
        # IndexError: Coords are outside raster bounds
        # ValueError: Coords are not on a FOREST pixel
        logger.error(f"GeoTIFF simulation failed: Invalid ignition point. {e}", exc_info=True)
        return jsonify({'success': False, 'error': 'Invalid ignition point', 'message': str(e)}), 400
    except ImportError as e:
        logger.error(f"GeoTIFF simulation failed: Import error. {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Server configuration error',
            'message': 'The simulation module is not configured correctly.'
        }), 500
    except Exception as e:
        logger.error("GeoTIFF simulation failed", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error during GeoTIFF simulation',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

# --- CENTRAL REGISTRATION FUNCTION ---
def register_routes(app):
    """Registers all API blueprints with the Flask app."""
    
    # Register the main API blueprint
    app.register_blueprint(api_bp, url_prefix=API_PREFIX)