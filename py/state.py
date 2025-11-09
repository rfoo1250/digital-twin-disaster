"""
state.py
---------------------------------------------
Thread-safe runtime key-value store for wildfire simulation.
Use only if you need to persist small shared data across modules.
"""

from threading import Lock

_store = {}
_lock = Lock()

def set_value(key, value):
    """Set a value in the store."""
    with _lock:
        _store[key] = value

def get_value(key, default=None):
    """Get a value from the store."""
    with _lock:
        return _store.get(key, default)

def clear_value(key):
    """Delete a key from the store."""
    with _lock:
        if key in _store:
            del _store[key]

def snapshot():
    """Return a shallow copy of the store (for debugging)."""
    with _lock:
        return dict(_store)
