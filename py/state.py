"""Application single-source-of-truth (SSOT) for small runtime state.
Provides a tiny thread-safe store for values used across Python modules.
Currently used to store/retrieve `forest_shape` for the wildfire simulation.
"""
from threading import Lock

_store = {}
_lock = Lock()

def set_value(key, value):
    """Set a value in the shared store."""
    with _lock:
        _store[key] = value

def get_value(key, default=None):
    """Get a value from the shared store."""
    with _lock:
        return _store.get(key, default)

def clear_value(key):
    """Remove a key from the store if present."""
    with _lock:
        if key in _store:
            del _store[key]

def set_forest_shape(shape):
    """Store the forest_shape (GeoJSON or list of coords)."""
    print("[DEBUG] forestShape param:", shape)

    set_value('forest_shape', shape)

def get_forest_shape(default=None):
    """Return the stored forest_shape or default."""
    return get_value('forest_shape', default)

def clear_forest_shape():
    """Clear stored forest_shape."""
    clear_value('forest_shape')


def snapshot():
    """Return a shallow copy of the internal store."""
    with _lock:
        return dict(_store)
