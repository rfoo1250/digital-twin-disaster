from flask import Flask
from flask_cors import CORS
import logging

from api.routes import register_routes
from api.errors import register_error_handlers
from utils.logger import configure_logging


def create_app():
    """Application factory for the disaster simulation backend."""
    app = Flask(__name__)

    # Enable CORS
    CORS(app)

    # Configure logging
    configure_logging()
    logger = logging.getLogger(__name__)
    logger.info("Initializing Disaster Simulation Backend API")

    # Register routes and error handlers
    register_routes(app)
    register_error_handlers(app)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, host="0.0.0.0", port=5000)
