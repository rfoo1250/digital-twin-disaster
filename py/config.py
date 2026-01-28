"""
config.py
---------------------------------------------
Configuration constants for the Wildfire Simulation backend.
"""

import os

# ------------------ SERVER CONFIG ------------------ #
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 5000
DEBUG_MODE = False

# ------------------ GOOGLE CONFIG ------------------ #
GEE_PROJECT_NAME = "dmml-volunteering"

GCS_BUCKET_NAME = "dmml-gee-exports"
GCS_FOREST_EXPORTS_FOLDER = "forest_exports"

GEOTIFF_EXPORT_SCALE = 30  # in meters
GEOTIFF_EXPORT_CRS = "EPSG:3857"  # standard

# ------------------ API CONFIG ------------------ #
# Central prefix for all API routes
API_PREFIX = "/api"
GEE_PREFIX = "/earthengine"

# ------------------ PATHS ------------------ #
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, os.pardir))

# Directory where wildfire outputs (GeoJSON / GeoTIFFs) can be saved
WILDFIRE_OUTPUT_BASE = os.path.join(PROJECT_ROOT, "wildfire_output")

# Directory to store GEE GeoJSON exports
GEOJSON_DIR = os.path.join(PROJECT_ROOT, "data", "shared", "geojson")

# Directory to store GEE inputs (e.g., downloaded GeoTIFFs)
GEOTIFF_DIR = os.path.join(PROJECT_ROOT, "data", "shared", "geotiff")

# Directory to saved service-account JSON (as secret)
SERVICE_ACCOUNT_JSON_PATH = os.path.join(PROJECT_ROOT, "secrets", "dmml-volunteering-4b1d82bffdc0.json")

# Primary dataset for wildfire simulation (forest cover CSV) (old)
ROOSEVELT_FOREST_COVER_CSV = os.path.join(PROJECT_ROOT, "covtype.csv")

# Create the output directory if it doesn’t exist
os.makedirs(WILDFIRE_OUTPUT_BASE, exist_ok=True)
os.makedirs(GEOJSON_DIR, exist_ok=True)
os.makedirs(GEOTIFF_DIR, exist_ok=True)
