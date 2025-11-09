from flask import jsonify
import logging

def register_error_handlers(app):
    logger = logging.getLogger(__name__)

    @app.errorhandler(404)
    def not_found(error):
        logger.warning("404 - Endpoint not found")
        return jsonify({'error': 'Endpoint not found'}), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        logger.warning("405 - Method not allowed")
        return jsonify({'error': 'Method not allowed'}), 405

    @app.errorhandler(500)
    def internal_server_error(error):
        logger.error("500 - Internal server error", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500
