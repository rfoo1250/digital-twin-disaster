from flask_socketio import SocketIO
from wildfire_sim.incinerate import run_wildfire_simulation_websocket

socketio = SocketIO(cors_allowed_origins="*")


def register_websocket_handlers(app):
    """Attach WebSocket handlers to the Flask app."""
    socketio.init_app(app)

    @socketio.on('/simulate_wildfire')
    def handle_wildfire_simulation():
        print("Received request to run wildfire simulation via WebSocket")
        run_wildfire_simulation_websocket()

    return socketio