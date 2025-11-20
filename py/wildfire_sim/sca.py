import os
import re  # For regex file searching
import rasterio
import numpy as np
import traceback
import logging
from scipy.signal import convolve2d
from datetime import datetime
from rasterio.windows import Window
from rasterio.windows import transform as window_transform

# --- Import config from parent directory ---
try:
    from config import GEOTIFF_DIR, OUTPUT_BASE
except ImportError:
    # Fallback for running script directly
    print("Warning: Could not import config. Using relative paths.")
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, os.pardir))
    GEOTIFF_DIR = os.path.join(PROJECT_ROOT, "data", "shared", "geotiff")
    OUTPUT_BASE = os.path.join(PROJECT_ROOT, "wildfire_output")
    os.makedirs(GEOTIFF_DIR, exist_ok=True)
    os.makedirs(OUTPUT_BASE, exist_ok=True)

logger = logging.getLogger(__name__)

# --- 1. DEFINE CELL STATES ---
NO_FOREST = 0  # Non-burnable land
FOREST = 1     # Burnable forest
BURNING = 2    # Actively on fire
BURNT = 3      # Burnt out

# --- 2. CONFIGURATION PARAMETERS ---
TIMESTEPS = 20
ENABLE_CROP = True
CROP_BUFFER = 100 # Pixels to include around the ignition point
P_IGNITION = 0.40
P_SPONTANEOUS = 0

# --- 3. HELPER FUNCTIONS ---

def _coords_to_pixels(lat, lon, src):
    """Converts geographic (lat, lon) coordinates to (y, x) pixel coordinates."""
    logger.info(f"  Converting (lat={lat}, lon={lon}) to pixel coordinates...")
    row, col = src.index(lon, lat)
    logger.info(f"  ...Converted to (row={row}, col={col})")
    return (int(row), int(col))

def _save_raster(data, meta, timestep, output_dir, crop_window=None):
    """Saves a numpy array as a GeoTIFF."""
    
    if crop_window:
        new_transform = window_transform(crop_window, meta['transform'])
        data_to_save = data[crop_window.row_off:crop_window.row_off + crop_window.height,
                            crop_window.col_off:crop_window.col_off + crop_window.width]
        meta.update(
            transform=new_transform,
            height=crop_window.height,
            width=crop_window.width
        )
    else:
        data_to_save = data

    data_to_save = data_to_save.astype(np.uint8)
    meta.update(
        dtype=rasterio.uint8,
        count=1,
        compress='lzw'
    )
    
    filename = os.path.join(output_dir, f"wildfire_t_{timestep:03d}.tif")
    
    logger.info(f"  Saving {filename} (Size: {data_to_save.shape})...")
    with rasterio.open(filename, 'w', **meta) as dst:
        dst.write(data_to_save, 1)

def _run_ca_step(grid, p_ignite, p_spontaneous):
    """Performs one step of the stochastic cellular automaton."""
    
    next_grid = grid.copy()
    next_grid[grid == BURNING] = BURNT

    kernel = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], dtype=np.uint8)
    is_burning = (grid == BURNING).astype(np.uint8)
    burning_neighbors = convolve2d(is_burning, kernel, mode='same', boundary='fill', fillvalue=0)
    is_forest = (grid == FOREST)
    has_burning_neighbor = (burning_neighbors > 0)
    
    random_neighbor = np.random.rand(*grid.shape)
    random_spontaneous = np.random.rand(*grid.shape)
    
    ignites_from_neighbor = (is_forest & has_burning_neighbor & (random_neighbor < p_ignite))
    ignites_spontaneously = (is_forest & ~has_burning_neighbor & (random_spontaneous < p_spontaneous))
    
    next_grid[ignites_from_neighbor] = BURNING
    next_grid[ignites_spontaneously] = BURNING

    return next_grid

# --- 5. MAIN SIMULATION FUNCTION (CALLED BY ROUTES.PY) ---
def run_geotiff_simulation(county_key, igni_lat, igni_lon):
    """
    Main function to run the GeoTIFF wildfire simulation.
    
    Args:
        county_key (str): The county key (e.g., "Arlington_VA").
        igni_lat (float): Ignition point latitude.
        igni_lon (float): Ignition point longitude.
        
    Returns:
        str: The *absolute path* to the simulation output directory.
        
    Raises:
        FileNotFoundError: If the correct GeoTIFF file/directory cannot be found.
        IndexError: If the (lat, lon) is outside the raster bounds.
        ValueError: If the ignition point is not a valid forest pixel.
    """
    logger.info(f"Starting wildfire simulation for {county_key}...")
    
    # --- Step 1: Find the input raster ---
    file_pattern = re.compile(rf"ForestCover_{re.escape(county_key)}_2024\.tif", re.IGNORECASE)
    INPUT_FILE = None
    
    logger.info(f"Searching for file in: {GEOTIFF_DIR}")
    if not os.path.exists(GEOTIFF_DIR):
        raise FileNotFoundError(f"GeoTIFF directory not found at: {GEOTIFF_DIR}")
        
    for filename in os.listdir(GEOTIFF_DIR):
        if file_pattern.match(filename):
            INPUT_FILE = os.path.join(GEOTIFF_DIR, filename)
            logger.info(f"Found input file: {INPUT_FILE}")
            break
            
    if not INPUT_FILE:
        raise FileNotFoundError(f"No GeoTIFF file found for countyKey '{county_key}' in {GEOTIFF_DIR}. Searched for pattern: {file_pattern.pattern}")

    # --- Step 2: Read raster & get ignition point ---
    try:
        with rasterio.open(INPUT_FILE) as src:
            current_state = src.read(1).astype(np.uint8)
            meta = src.meta.copy()
            
            # This call will raise an IndexError if (lon, lat) is out of bounds
            start_y, start_x = _coords_to_pixels(igni_lat, igni_lon, src)
            
            if (start_y < 0 or start_y >= current_state.shape[0] or
                start_x < 0 or start_x >= current_state.shape[1]):
                raise IndexError(f"Calculated pixel ({start_y}, {start_x}) is outside raster bounds.")

            if current_state[start_y, start_x] != FOREST:
                raise ValueError(f"Ignition point {igni_lat, igni_lon} (pixel {start_y, start_x}) is not a forest pixel. Value is {current_state[start_y, start_x]}")
            
    except (IndexError, ValueError):
        # Re-raise for the route to handle
        raise
    except Exception as e:
        logger.error(f"Error reading {INPUT_FILE} or converting coords: {e}")
        # Wrap other rasterio errors
        raise IOError(f"Failed to read or process raster file: {e}")

    # --- Step 3: Prepare output directory ---
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sim_run_name = f"sim_run_{county_key}_{timestamp}"
    # OUTPUT_BASE comes from config
    current_sim_output_dir = os.path.join(OUTPUT_BASE, sim_run_name)
    
    logger.info(f"Creating output subfolder: {current_sim_output_dir}")
    os.makedirs(current_sim_output_dir, exist_ok=True)
    
    logger.info(f"Starting fire at coordinate: (y={start_y}, x={start_x})")
    
    # --- Step 4: Calculate cropping window ---
    crop_window = None
    if ENABLE_CROP:
        logger.info(f"Cropping enabled with a {CROP_BUFFER}px buffer.")
        full_height, full_width = current_state.shape
        y_min = max(0, start_y - CROP_BUFFER)
        y_max = min(full_height, start_y + CROP_BUFFER)
        x_min = max(0, start_x - CROP_BUFFER)
        x_max = min(full_width, start_x + CROP_BUFFER)
        crop_window = Window(col_off=x_min, row_off=y_min, width=x_max - x_min, height=y_max - y_min)
        logger.info(f"  ...Calculated crop window: {crop_window}")

    # --- Step 5: Start fire and save t=0 ---
    current_state[start_y, start_x] = BURNING
    _save_raster(current_state, meta.copy(), 0, current_sim_output_dir, crop_window=crop_window)

    # --- Step 6: Run simulation loop ---
    for t in range(1, TIMESTEPS + 1):
        logger.info(f"--- Running Timestep {t} ---")
        
        next_state = _run_ca_step(current_state, P_IGNITION, P_SPONTANEOUS)
        
        if np.sum(next_state == BURNING) == 0:
            logger.info(f"  Fire has burned out at timestep {t}.")
            _save_raster(next_state, meta.copy(), t, current_sim_output_dir, crop_window=crop_window)
            break
            
        _save_raster(next_state, meta.copy(), t, current_sim_output_dir, crop_window=crop_window)
        current_state = next_state

    logger.info("--- Simulation complete ---")
    
    # Return the *absolute path* to the route handler
    return current_sim_output_dir
