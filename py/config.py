"""
config.py
---------------------------------------------
Configuration constants for the Wildfire Simulation backend.
"""

import os

# ------------------ PROJECT CONFIG ------------------ #
PROJECT_ID = 'dmml-volunteering'

# ------------------ SERVER CONFIG ------------------ #
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 5000
DEBUG_MODE = True

# ------------------ API CONFIG ------------------ #
# Central prefix for all API routes
API_PREFIX = "/api"

# ------------------ PATHS ------------------ #
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, os.pardir))

# Directory to store temporary GEE inputs (e.g., downloaded GeoTIFFs)
CUR_COUNTY_GEOTIFF_FOLDER = os.path.join(BASE_DIR, "data", "shared", "geotiff")

# Directory where wildfire outputs (GeoJSON / GeoTIFFs) can be saved
OUTPUT_BASE = os.path.join(PROJECT_ROOT, "wildfire_output")

# Primary dataset for wildfire simulation (forest cover CSV)
ROOSEVELT_FOREST_COVER_CSV = os.path.join(PROJECT_ROOT, "covtype.csv")

# Create the output directory if it doesn’t exist
os.makedirs(OUTPUT_BASE, exist_ok=True)
