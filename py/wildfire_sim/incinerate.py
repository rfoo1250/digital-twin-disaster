import os
import time
import numpy as np
import matplotlib.pyplot as plt
from config import OUTPUT_BASE, ROOSEVELT_FOREST_COVER_CSV
import pandas as pd
import random as rnd
import networkx as nx
import logging
import matplotlib
matplotlib.use('Agg')
from matplotlib.path import Path
from matplotlib.colors import ListedColormap
# import create_forest
from wildfire_sim.create_forest import get_point_in_forest

# =========================================================================
# User-configurable Parameters
# =========================================================================
CSV_FILE = ROOSEVELT_FOREST_COVER_CSV
NODES = 50*50  # 2500
DENSITY_FACTOR = 0.95
MAX_WIND_SPEED = 40
THETA_FACTOR = 0.2
PP_FACTOR = 2
EMBER_PROB = 0.02           # per-burning-node chance to create an ember (long-range spark)
EMBER_RADIUS = 5            # radius in grid cells for ember target search
THRESHOLD_NOISE_LOW = 0.6   # multiplicative noise range for node thresholds
THRESHOLD_NOISE_HIGH = 1.4
EDGE_WEIGHT_NOISE_LOW = 0.6
EDGE_WEIGHT_NOISE_HIGH = 1.6
TIMESTEPS = 100             # Reduced for faster test runs; old file had 1000
IGNITION_POINT = "random"

logger = logging.getLogger(__name__)

# --- Simple color mapping for raster output ---
# (0,0) is bottom-left
CUSTOM_CMAP = ListedColormap([
    (1.0, 1.0, 1.0),  # empty (white)
    (0.0, 0.6, 0.0),  # not_burnt (green)
    (1.0, 0.5, 0.0),  # burning (orange)
    (0.8, 0.0, 0.0)   # burnt (red)
])
STATE_TO_INT = {
    'empty': 0,
    'not_burnt': 1,
    'burning': 2,
    'burnt': 3
}

# =========================================================================
# Core Simulation Functions (from incinerate_old.py)
# =========================================================================

def count_burning(g):
    return sum(1 for i in g.nodes if g.nodes[i]['fire_state'] == 'burning')

def count_burnt(g):
    return sum(1 for i in g.nodes if g.nodes[i]['fire_state'] == 'burnt')

def count_non_empty(g):
    return sum(1 for n in g.nodes if g.nodes[n]['fire_state'] != 'empty')

def dist(pair1, pair2, dist_scale):
    x1, y1 = pair1
    x2, y2 = pair2
    return np.sqrt((x2 - x1)**2 + (y2 - y1)**2) * dist_scale

def edge_weight(max_speed, eps, edge_strength, wind_direction, distance):
    psi = max_speed
    epss = 1 if edge_strength in [0, 1] else eps
    gamma = rnd.uniform(0.01, 1) * psi * epss
    tau = wind_direction * np.pi / 180
    delta = distance
    if delta == 0: return 0.01
    beta = max(2 / np.pi * np.arctan(1 * gamma * np.cos(tau) / delta), 0.01)
    return round(beta, 2)

def get_angle(pair1, pair2):
    x1, y1 = pair1
    x2, y2 = pair2
    if x1 == x2:
        return 90 if y2 > y1 else 270
    angle = np.arctan((y2 - y1) / (x2 - x1)) * 180 / np.pi
    if x2 < x1:
        angle += 180
    return angle

def get_burning(g, lst):
    return [item for item in lst if g.has_node(item) and g.nodes[item]['fire_state'] == 'burning']

def get_direction(a):
    if a < 22.5 or a >= 337.5: return 'N'
    if a < 67.5: return 'NE'
    if a < 112.5: return 'E'
    if a < 157.5: return 'SE'
    if a < 202.5: return 'S'
    if a < 247.5: return 'SW'
    if a < 292.5: return 'W'
    return 'NW'

def lifeline_update(g, colors):
    for node in g.nodes():
        if g.nodes[node]['fire_state'] == 'burning':
            g.nodes[node]['life'] -= 1
            if g.nodes[node]['life'] < 0:
                g.nodes[node]['fire_state'] = 'burnt'
                g.nodes[node]['color'] = 'brown'
                if 0 <= node -1 < len(colors):
                    colors[node - 1] = 'brown'

def life_edge_update(g, edge_list):
    for p, q in edge_list:
        if g.has_edge(p,q) and g[p][q]['color'] == 'orange':
            g[p][q]['life'] -= 1
            if g[p][q]['life'] < 0:
                g[p][q]['color'] = 'brown'

def node_threshold(slope, elevation, ele_min, ele_max, aspect, aspect_dict):
    phi = np.tan(slope * np.pi / 180)
    phi_s = 5.275 * pow(phi, 2)
    h = (elevation - ele_min) / (ele_max - ele_min) * 2300 if ele_max > ele_min else 0
    h_prime = h * np.exp(-6)
    xi = 1 / (1 + np.log(max(h_prime, 1)))
    dirn = get_direction(aspect)
    alpha = aspect_dict[dirn]
    theta = -np.arctan(phi_s * xi * alpha) / np.pi + 0.5
    # Apply global factor to adjust how easily nodes ignite. Lower values => easier ignition.
    theta = theta * THETA_FACTOR
    return round(theta, 2)

def update_active_neighbors(g):
    for itemm in g.nodes():
        num = sum(1 for item in g.neighbors(itemm) if g.has_node(item) and g.nodes[item]['fire_state'] == 'burning')
        g.nodes[itemm]['num_of_active_neighbors'] = num

def node_id_to_grid(node_id, grid_size):
    # Node IDs are 1-based
    # This logic matches the k-counter in the node creation loop
    # (fills column by column, bottom-to-top)
    col = (node_id - 1) // grid_size   # which column
    row = (node_id - 1) % grid_size    # which row (bottom→top)
    return row, col

def incinerate(g, colors, edge_list):
    # cell scale (grid unit) based on global NODES so ember distances can be computed
    grid_size = int(np.ceil(np.sqrt(g.number_of_nodes())))
    cell_scale = 100.0 / grid_size # Scale based on 100x100 unit area
    
    burning_nodes = get_burning(g, [n for n in g.nodes])
    nodes_to_ignite = []

    for ignition_node in burning_nodes:
        for nb in g.neighbors(ignition_node):
            if g.nodes[nb]['fire_state'] == 'not_burnt':
                active_neighbors = get_burning(g, list(g.neighbors(nb)))
                s = 0
                for burning_nb in active_neighbors:
                    if g.has_edge(burning_nb, nb):
                        w = g.get_edge_data(burning_nb, nb).get('w', 0)
                        # add stochasticity to each contributing edge weight
                        w_eff = w * rnd.uniform(EDGE_WEIGHT_NOISE_LOW, EDGE_WEIGHT_NOISE_HIGH)
                        s = min(1, s + w_eff)
                
                # Apply noise to threshold
                ths = g.nodes[nb]['threshold_switch']
                ths_eff = ths * rnd.uniform(THRESHOLD_NOISE_LOW, THRESHOLD_NOISE_HIGH)

                if s >= ths_eff:
                    nodes_to_ignite.append((nb, ignition_node))

    for nb, ignition_node in nodes_to_ignite:
        if g.nodes[nb]['fire_state'] != 'burning':
            g.nodes[nb]['fire_state'] = 'burning'
            g.nodes[nb]['color'] = 'orange'
            if 0 <= nb - 1 < len(colors):
                colors[nb - 1] = 'orange'
            if g.has_edge(ignition_node, nb):
                g[ignition_node][nb]['color'] = 'orange'

    # Ember mechanic
    non_empty_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] not in ('empty', 'burning', 'burnt')]
    for bnode in burning_nodes:
        if not non_empty_nodes:
            break
        if rnd.random() < EMBER_PROB:
            bx, by = g.nodes[bnode]['pos']
            candidates = []
            for n in non_empty_nodes:
                nxp, nyp = g.nodes[n]['pos']
                dx = abs(nxp - bx) / cell_scale
                dy = abs(nyp - by) / cell_scale
                if dx <= EMBER_RADIUS and dy <= EMBER_RADIUS:
                    candidates.append(n)
            
            if not candidates:
                if rnd.random() < 0.1:
                    candidates = non_empty_nodes
            
            if candidates:
                target = rnd.choice(candidates)
                if rnd.random() < 0.5: # 50% chance to ignite if ember lands
                    if g.nodes[target]['fire_state'] == 'not_burnt':
                        g.nodes[target]['fire_state'] = 'burning'
                        g.nodes[target]['color'] = 'orange'
                        if 0 <= target - 1 < len(colors):
                            colors[target - 1] = 'orange'
                        if g.has_edge(bnode, target):
                            g[bnode][target]['color'] = 'orange'

    lifeline_update(g, colors)
    life_edge_update(g, edge_list)
    update_active_neighbors(g)

    for nd in list(g.nodes()):
        if g.nodes[nd]['fire_state'] == 'burnt':
            g.nodes[nd]['color'] = 'brown'
            for neighbor in g.neighbors(nd):
                if g.has_edge(nd, neighbor):
                    g[nd][neighbor]['color'] = 'brown'
    return g, colors

def simulate_wind(g, edge_list, max_speed, epsilon, dist_scale):
    nn = g.number_of_nodes()
    snn = int(np.ceil(np.sqrt(nn))) # grid size
    non_empty_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] != 'empty']
    if not non_empty_nodes:
        return (None, 0, 0)
    
    center_node = rnd.choice(non_empty_nodes)
    center_node_pos = g.nodes[center_node]['pos']
    random_bound = 4
    a, b = 0, 0
    while a == b:
        a = rnd.randint(1, random_bound)
        b = rnd.randint(1, random_bound)
    c_max = max(a, b) - 1
    c = rnd.randint(1, c_max) * rnd.choice([-1, 1]) if c_max > 0 else 0
    center_x, center_y = g.nodes[center_node]['pos']
    
    cell_scale = 100.0 / snn
    scaled_a = a * cell_scale * 5 
    scaled_b = b * cell_scale * 5

    elliptical_nodes = []
    for node, data in g.nodes(data=True):
        if data['fire_state'] != 'empty':
            x, y = g.nodes[node]['pos']
            if ((x - center_x)**2 / scaled_a**2) + ((y - center_y)**2 / scaled_b**2) <= 1:
                elliptical_nodes.append(node)
    
    focus = center_node
    if a > b:
        focus_offset = snn * c
    else:
        focus_offset = c
        
    focus = center_node + focus_offset
    
    if not (1 <= focus <= nn and g.has_node(focus) and g.nodes[focus]['fire_state'] != 'empty'):
        focus = center_node
    
    posf = g.nodes[focus]['pos']

    for n1 in elliptical_nodes:
        for n2 in elliptical_nodes:
            if n1 >= n2 or not g.has_edge(n1, n2):
                continue
            
            pos1 = g.nodes[n1]['pos']
            pos2 = g.nodes[n2]['pos']
            
            if a > b: # Horizontal ellipse
                angle = 0 if (pos1[0] > posf[0] and pos2[0] > posf[0]) else 180
            else: # Vertical ellipse
                angle = 90 if (pos1[1] > posf[1] and pos2[1] > posf[1]) else 270
            
            w_e = edge_weight(max_speed, epsilon, 1, angle, dist(pos1, pos2, 30))
            g[n1][n2]['w'] = w_e
            g[n1][n2]['wind_dir'] = angle
            g[n1][n2]['edge_strength'] = 1
            
    return (center_node_pos, a, b)

# =========================================================================
# Simulation Runner 
# =========================================================================

def draw_forest_snapshot(g, grid_size, timestep, output_dir):
    """Render a simple raster image of node states on a grid."""
    img_data = np.zeros((grid_size, grid_size), dtype=int)
    
    for node, data in g.nodes(data=True):
        row, col = node_id_to_grid(node, grid_size)
        
        state_int = STATE_TO_INT.get(data['fire_state'], 0)
        
        # Ensure row/col are within bounds before assignment
        if 0 <= row < grid_size and 0 <= col < grid_size:
            img_data[row, col] = state_int
        else:
            logger.warning(f"Node {node} mapped to out-of-bounds grid ({row}, {col}). Skipping.")

    plt.figure(figsize=(10, 10))
    plt.imshow(img_data, cmap=CUSTOM_CMAP, interpolation='nearest', origin='lower', vmin=0, vmax=len(STATE_TO_INT) - 1)
    plt.axis('off')
    filepath = os.path.join(output_dir, f"timestep_{timestep:04d}.png")
    plt.savefig(filepath, bbox_inches='tight', pad_inches=0, dpi=150)
    plt.close()

def run_wildfire_simulation(forest_shape=None):
    """
    Run wildfire simulation using detailed logic from incinerate_old.py
    and save each timestep as a raster PNG.
    """
    logger.info(f"Starting wildfire simulation...")
    try:
        df = pd.read_csv(CSV_FILE)
    except FileNotFoundError:
        logger.error(f"[ERROR] File not found at path: {CSV_FILE}")
        return {"success": False, "error": f"Dataset file not found at {CSV_FILE}"}
    except Exception as e:
        logger.error(f"[ERROR] Could not load {CSV_FILE}: {e}")
        return {"success": False, "error": f"Could not load dataset."}


    grid_size = int(np.ceil(np.sqrt(NODES)))
    scale = 100.0 / grid_size # System scale (e.g., 100x100 units)
    proximity = 1.42 * scale
    dist_scale = 30
    pos_dict = {}
    aspect_dict = {'N': -0.063, 'NE':0.349, 'E':0.686, 'SE':0.557, 'S':0.039, 'SW':-0.155, 'W':-0.252, 'NW':-0.171}

    # Create a point-in-forest predicate using the helper module; this will
    # use the provided override `forest_shape` if passed, otherwise it will
    # read the latest stored shape from the SSOT in `state.py`.
    point_in_forest = get_point_in_forest(scale, grid_size, forest_shape)
    if forest_shape and not point_in_forest:
        logger.error("Invalid GeoJSON: 'forest_shape' was provided but could not be processed.")
        logger.error("Please provide a valid GeoJSON Feature or Geometry with type 'Polygon' or 'MultiPolygon'.")
        return {
            "success": False,
            "error": "Invalid GeoJSON structure. Must be a Polygon or MultiPolygon Feature/Geometry."
        }

    if len(df) < NODES:
        nodes_count = len(df)
        logger.warning(f"CSV file has fewer rows ({len(df)}) than requested NODES ({NODES}). Using {nodes_count}.")
    else:
        nodes_count = NODES

    try:
        ele_series = df.loc[0:nodes_count-1, 'Elevation']
        ele_max = ele_series.max()
        ele_min = ele_series.min()
    except KeyError:
        logger.error("CSV missing 'Elevation' column.")
        return {"success": False, "error": "CSV missing 'Elevation' column."}
    except Exception as e:
        logger.error(f"Error processing elevation data: {e}")
        return {"success": False, "error": f"Error processing elevation data."}


    g = nx.Graph()
    colors = [] 
    k = 1 # Node IDs are 1-based

    # <-- UPDATED node loop to match old logic (col-by-col, 1-based)
    # This coordinate system (i*scale, j*scale) matches create_forest.py
    for i in range(1, grid_size + 1):       # i = col index (x-axis)
        for j in range(1, grid_size + 1):   # j = row index (y-axis)
            if k > nodes_count:
                break
            
            try:
                # k-1 because dataframe is 0-indexed
                slope = df.at[k - 1, 'Slope']
                elevation = df.at[k - 1, 'Elevation']
                aspect = df.at[k - 1, 'Aspect']
            except KeyError as e:
                # Check for out of bounds, e.g., if k-1 > len(df)
                if k - 1 >= len(df):
                    logger.warning(f"Node ID {k} exceeds CSV rows ({len(df)}). Stopping node creation.")
                    break 
                logger.error(f"CSV missing required column: {e}. Aborting.")
                return {"success": False, "error": f"CSV missing required column: {e}."}
            except IndexError:
                 logger.warning(f"Node ID {k} exceeds CSV rows ({len(df)}). Stopping node creation.")
                 break


            theta = node_threshold(slope, elevation, ele_min, ele_max, aspect, aspect_dict)
            lf = rnd.randint(3, 7) # Lifeline

            # Position: (x, y) with (scale, scale) at bottom-left
            current_pos = (i * scale, j * scale)
            pos_dict[k] = current_pos

            # Check if node is inside the provided forest shape
            inside_forest = True
            if point_in_forest:
                try:
                    # point_in_forest is the predicate from create_forest
                    inside_forest = bool(point_in_forest(current_pos))
                except Exception as e:
                    logger.warning(f"Error checking point_in_forest for {current_pos}: {e}")
                    inside_forest = True # Default to inside on error

            if not inside_forest:
                g.add_node(k, threshold_switch=1.0, color='black', num_of_active_neighbors=0,
                           fire_state='empty', life=lf, pos=current_pos)
                colors.append('black')
            # Original density-based occupancy behavior
            elif rnd.uniform(0, 1) > DENSITY_FACTOR:
                g.add_node(k, threshold_switch=1.0, color='black', num_of_active_neighbors=0,
                           fire_state='empty', life=lf, pos=current_pos)
                colors.append('black')
            else:
                g.add_node(k, threshold_switch=theta, color='green', num_of_active_neighbors=0,
                           fire_state='not_burnt', life=lf, pos=current_pos)
                colors.append('green')
            
            k += 1
        if k > nodes_count:
            break

    edge_list = []
    node_ids = list(g.nodes())
    for i in range(len(node_ids)):
        for j in range(i + 1, len(node_ids)):
            n1, n2 = node_ids[i], node_ids[j]
            p1, p2 = g.nodes[n1]['pos'], g.nodes[n2]['pos']
            if dist(p1, p2, 1) < proximity and g.nodes[n1]['fire_state'] != 'empty' and g.nodes[n2]['fire_state'] != 'empty':
                edge_list.append((n1, n2))

    for n1, n2 in edge_list:
        p1, p2 = g.nodes[n1]['pos'], g.nodes[n2]['pos']
        angle = get_angle(p1, p2)
        pp = edge_weight(MAX_WIND_SPEED, 0.1, 0, angle, dist(p1, p2, dist_scale)) * PP_FACTOR
        lf = np.floor((g.nodes[n1]['life'] + g.nodes[n2]['life']) / 2)
        g.add_edge(n1, n2, w=pp, color='green', life=int(lf), edge_strength=0, wind_speed=0.01, wind_dir=angle, eb=0)

    non_burnt_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] == 'not_burnt']
    if not non_burnt_nodes:
        logger.warning("No nodes available to ignite. Forest is empty or all density checks failed.")
        return {"success": False, "error": "No nodes available to ignite"}

    ignition_node = rnd.choice(non_burnt_nodes) if IGNITION_POINT == "random" else int(IGNITION_POINT)
    
    if not g.has_node(ignition_node) or g.nodes[ignition_node]['fire_state'] != 'not_burnt':
        logger.warning(f"Selected ignition node {ignition_node} is invalid. Choosing random.")
        ignition_node = rnd.choice(non_burnt_nodes)

    g.nodes[ignition_node]['fire_state'] = 'burning'
    g.nodes[ignition_node]['color'] = 'orange'
    if 0 <= ignition_node - 1 < len(colors):
        colors[ignition_node - 1] = 'orange'
    
    logger.info(f"Ignition set at node {ignition_node} (pos {g.nodes[ignition_node]['pos']})")

    # --- Setup Output Directory ---
    output_dir = os.path.join(OUTPUT_BASE, f"wildfire_run_{int(time.time())}")
    os.makedirs(output_dir, exist_ok=True)
    logger.info(f"Saving simulation frames to: {output_dir}")

    # --- Main Simulation Loop ---
    final_timestep = 0
    for i in range(TIMESTEPS + 1):
        final_timestep = i
        current_burning_forests = count_burning(g)

        # Draw the state *before* this step's incineration
        draw_forest_snapshot(g, grid_size, i, output_dir)
        
        # Stop when there are no burning nodes left
        if current_burning_forests == 0 and i > 0:
            logger.info(f"Fire simulation stopped at timestep {i}: no more burning nodes.")
            break
        
        if i == TIMESTEPS:
             logger.info(f"Simulation reached max timesteps ({TIMESTEPS}).")

        # Run fire spread logic
        g, colors = incinerate(g, colors, edge_list)

        # Run wind logic
        if i > 0:
            simulate_wind(g, edge_list, MAX_WIND_SPEED, 0.1, dist_scale)

    logger.info(f"Simulation complete. Final timestep: {final_timestep}")

    return {
        "success": True,
        "message": f"Simulation complete. {final_timestep+1} frames saved.",
        "output_dir": output_dir,
        "grid_size": grid_size,
        "final_timestep": final_timestep
    }