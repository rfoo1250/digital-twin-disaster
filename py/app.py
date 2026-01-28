"""
app.py
---------------------------------------------
Entry point for the Wildfire Simulation backend API.

This lightweight Flask app exposes a single route:
    POST /api/simulate  → runs wildfire simulation based on ignition point.
"""

from flask import Flask
from flask_cors import CORS
import logging

from api.routes import register_routes
from api.errors import register_error_handlers
from utils.logger import configure_logging
from config import DEFAULT_HOST, DEFAULT_PORT, DEBUG_MODE, GEE_PROJECT_NAME, SERVICE_ACCOUNT_JSON_PATH

from earthengine.service import initialize_gee


def create_app():
    """Application factory for the wildfire simulation backend."""
    app = Flask(__name__)

    # Enable CORS for local frontend communication
    CORS(app, resources={
        r"/earthengine/*": {"origins": "http://localhost:5656"},
        r"/exports/*": {"origins": "http://localhost:5656"}
    })
    # Configure structured logging
    configure_logging()
    logger = logging.getLogger(__name__)
    logger.info("Starting Backend...")
    
    # Authenticate and initialize GEE on startup
    logger.info("Initializing Google Earth Engine...")
    try:
        initialize_gee(project=GEE_PROJECT_NAME, service_account_json_path=SERVICE_ACCOUNT_JSON_PATH)
        logger.info("Google Earth Engine initialized.")
    except Exception as e:
        logger.exception("GEE initialization failed.")
        raise e
    
    # Register route blueprints and error handlers
    logger.info("Registering API routes...")
    register_routes(app)
    register_error_handlers(app)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host=DEFAULT_HOST, port=DEFAULT_PORT, debug=DEBUG_MODE)