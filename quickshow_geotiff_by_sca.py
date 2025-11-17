import os
import glob
import rasterio
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
import argparse # <--- NEW IMPORT for command-line arguments

# --- 1. CONFIGURATION ---
FILE_PATTERN = "wildfire_t_*.tif"
# The RASTER_DIR constant is removed, it will come from a CLI argument

# --- 2. DEFINE STATES & COLORS ---
# These constants MUST match the states from the simulation script
# NO_FOREST = 0
# FOREST = 1
# BURNING = 2
# BURNT = 3

# Define the colors for each state
# 
colors = [
    '#cccccc',  # 0: NO_FOREST (light gray)
    '#27a73f',  # 1: FOREST (green)
    '#ffa500',  # 2: BURNING (orange)  <--- UPDATED
    '#ff0000'   # 3: BURNT (red)        <--- UPDATED
]
labels = ['No Forest', 'Forest', 'Burning', 'Burnt']

# Create the custom colormap and normalization
# This ensures that 0 maps to the first color, 1 to the second, etc.
cmap = ListedColormap(colors)
norm = BoundaryNorm([-0.5, 0.5, 1.5, 2.5, 3.5], cmap.N)


# --- 3. LOAD FILES ---
def load_raster_files(raster_dir, file_pattern):
    """Finds and sorts all raster files in the directory."""
    search_path = os.path.join(raster_dir, file_pattern)
    sorted_files = sorted(glob.glob(search_path))
    
    if not sorted_files:
        print(f"--- Error ---")
        print(f"No files matching '{file_pattern}' found in '{raster_dir}'.")
        print("Please check the path or run the 'sca_geotiff.py' script first.")
        return None
        
    print(f"Found {len(sorted_files)} raster steps in '{raster_dir}'.")
    return sorted_files

# --- 4. SET UP THE INTERACTIVE PLOT ---
class RasterViewer:
    def __init__(self, raster_files):
        self.raster_files = raster_files
        self.current_index = 0
        
        # Create the figure and axis
        self.fig, self.ax = plt.subplots(figsize=(10, 8))
        plt.subplots_adjust(bottom=0.15) # Make space for text
        
        # Add instructions text
        self.fig.text(0.5, 0.05, "Use LEFT/RIGHT arrow keys to navigate steps", 
                      ha='center', fontsize=12)
        
        # Add a colorbar
        self.add_colorbar()
        
        # Connect the event handler
        self.fig.canvas.mpl_connect('key_press_event', self.on_key_press)
        
        # Draw the first plot
        self.update_plot()
        
    def add_colorbar(self):
        """Adds a discrete colorbar to the plot."""
        # We need to create a "dummy" ScalarMappable to pass to the colorbar
        sm = plt.cm.ScalarMappable(cmap=cmap, norm=norm)
        sm.set_array([]) # You don't need to pass data to this
        
        # Create the colorbar
        cbar = self.fig.colorbar(sm, ax=self.ax, 
                                 ticks=[0, 1, 2, 3],          # Set tick locations
                                 orientation='horizontal',    # Place it horizontally
                                 fraction=0.04,             # Adjust size
                                 pad=0.04)
        cbar.set_ticklabels(labels) # Set the text labels
        
    def update_plot(self):
        """Reads and draws the raster at the current index."""
        filepath = self.raster_files[self.current_index]
        filename = os.path.basename(filepath)
        
        try:
            with rasterio.open(filepath) as src:
                data = src.read(1)
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
            return
            
        # Clear the old plot
        self.ax.clear()
        
        # Draw the new raster
        self.ax.imshow(data, cmap=cmap, norm=norm)
        
        # Add a title and hide axes
        self.ax.set_title(f"Wildfire Simulation: {filename}", fontsize=14)
        self.ax.set_axis_off() # Hide pixel x/y coordinates
        
        # Redraw the canvas
        self.fig.canvas.draw_idle()

    def on_key_press(self, event):
        """Callback for keyboard events."""
        if event.key == 'right':
            # Move to the next step
            if self.current_index < len(self.raster_files) - 1:
                self.current_index += 1
                self.update_plot()
        elif event.key == 'left':
            # Move to the previous step
            if self.current_index > 0:
                self.current_index -= 1
                self.update_plot()

    def show(self):
        """Display the interactive plot window."""
        print("--- Interactive Viewer ---")
        print("Press LEFT and RIGHT arrow keys to change timestep.")
        print("Close the plot window to exit.")
        plt.show()

# --- 5. RUN THE SCRIPT ---
def main():
    # --- NEW: Set up the argument parser ---
    parser = argparse.ArgumentParser(
        description="Interactive viewer for wildfire simulation rasters."
    )
    # Add the '--input' argument
    # We use '-i' as a shorthand
    # 'required=True' means the script will exit if this flag is not provided
    parser.add_argument(
        '--input', '-i', 
        type=str, 
        required=True, 
        help="Path to the simulation output directory (e.g., 'wildfire_output/sim_run_...') "
             "containing the 'wildfire_t_*.tif' files."
    )
    
    # --- NEW: Parse the arguments ---
    args = parser.parse_args()
    
    # Get the directory path provided by the user
    raster_dir = args.input 
    
    # --- Load files from the user-provided directory ---
    raster_files = load_raster_files(raster_dir, FILE_PATTERN)
    
    # --- Launch the viewer if files were found ---
    if raster_files:
        viewer = RasterViewer(raster_files)
        viewer.show()

if __name__ == "__main__":
    main()