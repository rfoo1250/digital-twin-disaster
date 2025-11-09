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
from config import DEFAULT_HOST, DEFAULT_PORT, DEBUG_MODE


def create_app():
    """Application factory for the wildfire simulation backend."""
    app = Flask(__name__)

    # Enable CORS for local frontend communication
    CORS(app)

    # Configure structured logging
    configure_logging()
    logger = logging.getLogger(__name__)
    logger.info("Starting Wildfire Simulation Backend API")

    # Register route blueprints and error handlers
    register_routes(app)
    register_error_handlers(app)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host=DEFAULT_HOST, port=DEFAULT_PORT, debug=DEBUG_MODE)
