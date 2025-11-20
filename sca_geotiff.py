import os
import rasterio
import numpy as np
from scipy.signal import convolve2d
from datetime import datetime
from rasterio.windows import Window # <--- NEW IMPORT
from rasterio.windows import transform as window_transform # <--- NEW IMPORT

# --- 1. DEFINE CELL STATES ---
NO_FOREST = 0  # Non-burnable land (from your binary mask)
FOREST = 1     # Burnable forest (from your binary mask)
BURNING = 2    # Actively on fire
BURNT = 3      # Burnt out, non-burnable

# --- 2. CONFIGURATION PARAMETERS ---
# --- File & Directory Settings ---
INPUT_FILE = r"data\shared\geotiff\ForestCover_Arlington_VA_2024.tif"  # <--- SET THIS
OUTPUT_DIR = r"wildfire_output"      # Base directory for all simulation runs

# --- Simulation Settings ---
TIMESTEPS = 20                                # Total number of steps to simulate

# --- NEW: Output Cropping Settings ---
ENABLE_CROP = True  # Set to True to save only a window around the ignition point
CROP_BUFFER = 100   # Pixels to include around the ignition point (e.g., 500px buffer)

# --- Ignition Settings  ---
IGNITION_MODE = "random"  # "random" or "user_set"
USER_SET_COORDS = (100, 150) # (y, x) pixel coordinate. Only used if mode is "user_set"

# --- Stochastic (Probability) Parameters ---
P_IGNITION = 0.40   # Probability (0.0 to 1.0)
P_SPONTANEOUS = 0 # Probability (0.0 to 1.0)

# --- 3. HELPER FUNCTION: SAVE RASTER ---
def save_raster(data, meta, timestep, output_dir, crop_window=None):
    """Saves a numpy array as a GeoTIFF."""
    
    # --- NEW: Slicing Logic ---
    if crop_window:
        # 1. Calculate the new geotransform for the window
        # This keeps the output raster correctly georeferenced
        new_transform = window_transform(crop_window, meta['transform'])
        
        # 2. Slice the data array to the window
        data_to_save = data[crop_window.row_off:crop_window.row_off + crop_window.height,
                            crop_window.col_off:crop_window.col_off + crop_window.width]
        
        # 3. Update the metadata for the sliced raster
        meta.update(
            transform=new_transform,
            height=crop_window.height,
            width=crop_window.width
        )
    else:
        # If no crop_window is provided, save the full array
        data_to_save = data
    # --- End of Slicing Logic ---

    # Ensure data type is appropriate for our states (e.g., integer)
    data_to_save = data_to_save.astype(np.uint8) 
    
    # Update the rest of the metadata for the output file
    meta.update(
        dtype=rasterio.uint8,
        count=1,
        compress='lzw'  # Use compression to save space
    )
    
    # Format filename with leading zeros for proper sorting
    filename = os.path.join(output_dir, f"wildfire_t_{timestep:03d}.tif")
    
    print(f"  Saving {filename} (Size: {data_to_save.shape})...")
    with rasterio.open(filename, 'w', **meta) as dst:
        dst.write(data_to_save, 1)

# --- 4. CORE FUNCTION: CELLULAR AUTOMATA STEP (VECTORIZED) ---
def run_ca_step(grid, p_ignite, p_spontaneous):
    """
    Performs one step of the stochastic cellular automaton.
    This version is "vectorized" using NumPy and SciPy for speed.
    """
    
    # Create a copy to store the next state.
    # We must read from the original `grid` and write to `next_grid`.
    next_grid = grid.copy()

    # --- Rule 1: Burning cells become burnt-out cells ---
    next_grid[grid == BURNING] = BURNT

    # --- Rule 2: Forest cells can catch fire ---
    
    # Define the "Moore neighborhood" kernel (8 surrounding cells)
    # 
    # 1 1 1
    # 1 0 1
    # 1 1 1
    kernel = np.array([[1, 1, 1],
                       [1, 0, 1],
                       [1, 1, 1]], dtype=np.uint8)

    # Find all cells that are currently burning
    is_burning = (grid == BURNING).astype(np.uint8)
    
    # Use 2D convolution to find cells with burning neighbors.
    burning_neighbors = convolve2d(is_burning, kernel, mode='same', boundary='fill', fillvalue=0)

    # Find all cells that are currently forest
    is_forest = (grid == FOREST)
    
    # Find forest cells that have at least one burning neighbor
    has_burning_neighbor = (burning_neighbors > 0)
    
    # --- Apply stochastic rules ---
    random_neighbor = np.random.rand(*grid.shape)
    random_spontaneous = np.random.rand(*grid.shape)
    
    # Case 2a: Forest ignites from a neighbor
    ignites_from_neighbor = (
        is_forest &
        has_burning_neighbor &
        (random_neighbor < p_ignite)
    )
    
    # Case 2b: Forest ignites spontaneously (e.g., lightning)
    ignites_spontaneously = (
        is_forest &
        ~has_burning_neighbor &
        (random_spontaneous < p_spontaneous)
    )
    
    # Apply the new fires to the next_grid
    next_grid[ignites_from_neighbor] = BURNING
    next_grid[ignites_spontaneously] = BURNING

    return next_grid

# --- 5. MAIN SIMULATION FUNCTION ---
def main():
    print(f"Starting wildfire simulation...")
    
    # --- Step 1: Read the input raster ---
    try:
        with rasterio.open(INPUT_FILE) as src:
            # Read the first band as a numpy array
            current_state = src.read(1).astype(np.uint8)
            
            # Save the file's metadata (CRS, transform, etc.)
            meta = src.meta.copy()
            
    except Exception as e:
        print(f"Error reading {INPUT_FILE}: {e}")
        return

    # --- Step 2: Prepare the simulation output directory ---
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sim_run_name = f"sim_run_{timestamp}"
    current_sim_output_dir = os.path.join(OUTPUT_DIR, sim_run_name)
    
    print(f"Creating output subfolder: {current_sim_output_dir}")
    os.makedirs(current_sim_output_dir, exist_ok=True)
    
    # --- Step 3: Start the fire (t=0) based on IGNITION_MODE ---
    
    start_y, start_x = -1, -1 # Initialize with invalid values

    if IGNITION_MODE == "random":
        print("Ignition Mode: 'random'")
        forest_cells_y, forest_cells_x = np.where(current_state == FOREST)
        
        if len(forest_cells_y) == 0:
            print("Error: No forest cells (value 1) found in the input raster.")
            return
            
        start_index = np.random.choice(len(forest_cells_y))
        start_y = forest_cells_y[start_index]
        start_x = forest_cells_x[start_index]
        # print(f"  Chosen random ignition point at (y={start_y}, x={start_x})")
        
    elif IGNITION_MODE == "user_set":
        print(f"Ignition Mode: 'user_set' at {USER_SET_COORDS}")
        y, x = USER_SET_COORDS
        
        if (y >= 0 and y < current_state.shape[0] and
            x >= 0 and x < current_state.shape[1]):
            
            if current_state[y, x] == FOREST:
                start_y, start_x = y, x
            else:
                print(f"Error: Chosen coordinate {USER_SET_COORDS} is not a forest pixel.")
                return
        else:
            print(f"Error: Chosen coordinate {USER_SET_COORDS} is outside the raster bounds.")
            return

    else:
        print(f"Error: Unknown IGNITION_MODE '{IGNITION_MODE}'")
        return

    print(f"Starting fire at coordinate: (y={start_y}, x={start_x})")
    
    # --- NEW: Calculate the cropping window ---
    # 
    crop_window = None
    if ENABLE_CROP:
        print(f"Cropping enabled with a {CROP_BUFFER}px buffer.")
        full_height, full_width = current_state.shape
        
        # Calculate window boundaries, clipping to the raster edges
        y_min = max(0, start_y - CROP_BUFFER)
        y_max = min(full_height, start_y + CROP_BUFFER)
        x_min = max(0, start_x - CROP_BUFFER)
        x_max = min(full_width, start_x + CROP_BUFFER)
        
        # Create the rasterio Window object
        crop_window = Window(col_off=x_min, 
                             row_off=y_min, 
                             width=x_max - x_min, 
                             height=y_max - y_min)
        
        print(f"  ...Full raster size: {(full_height, full_width)}")
        print(f"  ...Calculated crop window: {crop_window}")

    # --- End of Ignition & Crop Logic ---

    current_state[start_y, start_x] = BURNING
    
    # Save the initial state (t=0)
    # Pass a COPY of meta so the original is not modified
    # Pass the new crop_window object
    save_raster(current_state, meta.copy(), 0, current_sim_output_dir, crop_window=crop_window)

    # --- Step 4: Run the simulation loop ---
    for t in range(1, TIMESTEPS + 1):
        print(f"--- Running Timestep {t} ---")
        
        # --- IMPORTANT ---
        # We run the step on the FULL `current_state` array
        # This allows the fire to simulate correctly *outside* the
        # crop window, so the spread feels natural.
        next_state = run_ca_step(current_state, P_IGNITION, P_SPONTANEOUS)
        
        # Check if the fire has burned out
        if np.sum(next_state == BURNING) == 0:
            print(f"  Fire has burned out at timestep {t}.")
            save_raster(next_state, meta.copy(), t, current_sim_output_dir, crop_window=crop_window)
            break
            
        # Save the raster for this timestep
        # We pass the full `next_state` but also the `crop_window`.
        # The `save_raster` function will handle the slicing.
        save_raster(next_state, meta.copy(), t, current_sim_output_dir, crop_window=crop_window)
        
        # The new state becomes the current state for the next loop
        current_state = next_state

    print("--- Simulation complete ---")
    print(f"Output files are saved in the '{current_sim_output_dir}' directory.")

# --- 6. RUN THE SCRIPT ---
if __name__ == "__main__":
    main()