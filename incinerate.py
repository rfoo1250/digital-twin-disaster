import networkx as nx
import pandas as pd
import numpy as np
import random as rnd
import matplotlib.pyplot as plt
from matplotlib.pyplot import figure, text
import time
import re
import copy
import os

# =========================================================================
# User-configurable Parameters & Dataset Path
# =========================================================================
CSV_FILE = "./covtype.csv" # Path to your dataset
NODES = 20*20 # Number of nodes in the network
DENSITY_FACTOR = 0.85 # Network dense factor (percentage of the network with trees)
MAX_WIND_SPEED = 25 # User-defined max wind speed possible
TIMESTEPS = 20 # Number of steps to run the simulation
SLEEP_TIME = 0 # Time to pause between timesteps for interactive visualization

IGNITION_POINT = "random" # Set to "random" or a specific node ID (e.g., 150)

# --- Image Saving Configuration ---
SAVE_IMAGES = True # Set to True to save images to a folder, False to display them interactively
SAVE_FOLDER = "simulation_results" # Folder to save the timestep images


# =========================================================================
# Main Simulation Functions
# =========================================================================

def incinerate(g, colors, edge_list):
    """
    Main method called in a fire simulation step to propagate the fire
    based on the Linear Threshold Model.
    """
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
                        s = min(1, s + w)

                ths = g.nodes[nb]['threshold_switch']
                if s >= ths:
                    nodes_to_ignite.append((nb, ignition_node))

    # Apply changes after checking all nodes to avoid conflicts during iteration
    for nb, ignition_node in nodes_to_ignite:
        if g.nodes[nb]['fire_state'] != 'burning':
            g.nodes[nb]['fire_state'] = 'burning'
            colors[nb - 1] = 'orange'
            g.nodes[nb]['color'] = 'orange'
            if g.has_edge(ignition_node, nb):
                 g[ignition_node][nb]['color'] = 'orange'


    lifeline_update(g, colors)
    life_edge_update(g, edge_list)
    update_active_neighbors(g)
    
    # Update colors of burnt nodes and their edges after all logic
    for nd in list(g.nodes()):
        if g.nodes[nd]['fire_state'] == 'burnt':
            g.nodes[nd]['color'] = 'brown'
            for neighbor in g.neighbors(nd):
                if g.has_edge(nd, neighbor):
                    g[nd][neighbor]['color'] = 'brown'

    return g, colors


def simulate_wind(g, edge_list, max_speed, epsilon, dist_scale):
    """
    Simulates a wind event affecting a random elliptical region of the graph.
    """
    nn = g.number_of_nodes()
    snn = int(np.sqrt(nn))

    # Ensure there are non-empty nodes to select from
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

    # Get node coordinates for easier calculation
    center_x, center_y = pos_dict[center_node]

    # Find nodes within the elliptical area
    elliptical_nodes = []
    for node, data in g.nodes(data=True):
        if data['fire_state'] != 'empty':
            x, y = pos_dict[node]
            # Ellipse equation: ((x-h)^2 / a^2) + ((y-k)^2 / b^2) <= 1
            if ((x - center_x)**2 / (a * scale)**2) + ((y - center_y)**2 / (b * scale)**2) <= 1:
                elliptical_nodes.append(node)

    # Determine focus point
    focus = center_node
    if a > b: # Horizontal ellipse
        focus = center_node + snn * c
    else: # Vertical ellipse
        focus = center_node + c

    if not (1 <= focus <= nn and g.has_node(focus)):
        focus = center_node # Fallback

    posf = pos_dict[focus]

    for n1 in elliptical_nodes:
        for n2 in elliptical_nodes:
            if n1 >= n2 or not g.has_edge(n1, n2):
                continue

            pos1 = pos_dict[n1]
            pos2 = pos_dict[n2]
            
            # Determine wind direction based on orientation to focus
            dx1, dy1 = pos1[0] - posf[0], pos1[1] - posf[1]
            dx2, dy2 = pos2[0] - posf[0], pos2[1] - posf[1]
            
            # Simplified wind logic: align with major axis
            if a > b: # Horizontal
                angle = 0 if (dx1 > 0 and dx2 > 0) else 180
            else: # Vertical
                angle = 90 if (dy1 > 0 and dy2 > 0) else 270

            w_e = edge_weight(max_speed, epsilon, 1, angle, dist(pos1, pos2, dist_scale))
            g[n1][n2]['w'] = w_e
            g[n1][n2]['wind_dir'] = angle
            g[n1][n2]['edge_strength'] = 1 # Mark as affected by wind

    return (center_node_pos, a, b)


# =========================================================================
# Helper and Utility Functions
# =========================================================================

def count_burning(g):
    """Counts how many nodes are currently in the 'burning' state."""
    return sum(1 for i in g.nodes if g.nodes[i]['fire_state'] == 'burning')

def count_burnt(g):
    """Counts how many nodes are currently in the 'burnt' state."""
    return sum(1 for i in g.nodes if g.nodes[i]['fire_state'] == 'burnt')

def count_non_empty(g):
    """Counts how many nodes are not in the 'empty' state."""
    return sum(1 for n in g.nodes if g.nodes[n]['fire_state'] != 'empty')

def dist(pair1, pair2, dist_scale):
    """Computes Euclidean distance between two points."""
    x1, y1 = pair1
    x2, y2 = pair2
    return np.sqrt((x2 - x1)**2 + (y2 - y1)**2) * dist_scale

def edge_weight(max_speed, eps, edge_strength, wind_direction, distance):
    """Determines the weight of an edge based on various factors."""
    psi = max_speed
    epss = 1 if edge_strength in [0, 1] else eps
    gamma = rnd.uniform(0.01, 1) * psi * epss
    tau = wind_direction * np.pi / 180  # Wind direction in radians
    delta = distance
    if delta == 0: return 0.01 # Avoid division by zero
    beta = max(2 / np.pi * np.arctan(1 * gamma * np.cos(tau) / delta), 0.01)
    return round(beta, 2)

def get_angle(pair1, pair2):
    """Gets the angle in degrees between two node positions."""
    x1, y1 = pair1
    x2, y2 = pair2
    if x1 == x2:
        return 90 if y2 > y1 else 270
    angle = np.arctan((y2 - y1) / (x2 - x1)) * 180 / np.pi
    if x2 < x1:
        angle += 180
    return angle

def get_burning(g, lst):
    """Given a list of nodes, returns a list of those that are burning."""
    return [item for item in lst if g.has_node(item) and g.nodes[item]['fire_state'] == 'burning']


def get_direction(a):
    """Returns the cardinal direction given an aspect in degrees."""
    if a < 22.5 or a >= 337.5: return 'N'
    if a < 67.5: return 'NE'
    if a < 112.5: return 'E'
    if a < 157.5: return 'SE'
    if a < 202.5: return 'S'
    if a < 247.5: return 'SW'
    if a < 292.5: return 'W'
    return 'NW'

def life_edge_update(g, edge_list):
    """Updates the fire life of the edges."""
    for p, q in edge_list:
        if g.has_edge(p,q) and g[p][q]['color'] == 'orange':
            g[p][q]['life'] -= 1
            if g[p][q]['life'] < 0:
                g[p][q]['color'] = 'brown'

def lifeline_update(g, colors):
    """Updates the life of the fire in each node."""
    for node in g.nodes():
        if g.nodes[node]['fire_state'] == 'burning':
            g.nodes[node]['life'] -= 1
            if g.nodes[node]['life'] < 0:
                g.nodes[node]['fire_state'] = 'burnt'
                g.nodes[node]['color'] = 'brown'
                if 0 <= node -1 < len(colors):
                    colors[node - 1] = 'brown'

def node_threshold(slope, elevation, ele_min, ele_max, aspect, aspect_dict):
    """Computes the fire ignition threshold for a node."""
    phi = np.tan(slope * np.pi / 180)
    phi_s = 5.275 * pow(phi, 2)
    h = (elevation - ele_min) / (ele_max - ele_min) * 2300 if ele_max > ele_min else 0
    h_prime = h * np.exp(-6)
    xi = 1 / (1 + np.log(max(h_prime, 1)))
    dirn = get_direction(aspect)
    alpha = aspect_dict[dirn]
    theta = -np.arctan(phi_s * xi * alpha) / np.pi + 0.5
    return round(theta, 2)

def update_active_neighbors(g):
    """Counts how many neighbors are actively burning for each node."""
    for itemm in g.nodes():
        num = sum(1 for item in g.neighbors(itemm) if g.has_node(item) and g.nodes[item]['fire_state'] == 'burning')
        g.nodes[itemm]['num_of_active_neighbors'] = num

# =========================================================================
# Visualization and Data Functions
# =========================================================================

def draw_graph(g, ns, node_colors, edge_colors, pos_dict, fs, filepath=None):
    """Draws the graph using matplotlib and optionally saves it to a file."""
    plt.figure(figsize=(12, 12))
    title = os.path.basename(filepath).split('.')[0] if filepath else "Interactive View"
    plt.title(f"Wildfire Simulation - {title.replace('_', ' ').title()}")
    nx.draw(g, node_size=ns, node_color=node_colors, edge_color=edge_colors, with_labels=False, pos=pos_dict)
    
    if filepath:
        plt.savefig(filepath, bbox_inches='tight', dpi=150)
        print(f"Saved image to {filepath}")
    else:
        plt.show(block=False)
        if SLEEP_TIME > 0:
            plt.pause(SLEEP_TIME)
    
    plt.close()


def save_graph(g, node_fn, edge_fn):
    """Saves the graph node and edge attributes to CSV files."""
    node_df = pd.DataFrame.from_dict(dict(g.nodes(data=True)), orient='index')
    node_df['node'] = node_df.index
    node_df.to_csv(node_fn, index=False)

    edge_list_data = []
    for u, v, data in g.edges(data=True):
        edge_data = data.copy()
        edge_data['edge'] = f"{u},{v}"
        edge_list_data.append(edge_data)
    edge_df = pd.DataFrame(edge_list_data)
    edge_df.to_csv(edge_fn, index=False)

# =========================================================================
# Main Execution Block
# =========================================================================

if __name__ == '__main__':
    # --- 1. Load Data ---
    try:
        df = pd.read_csv(CSV_FILE)
    except FileNotFoundError:
        print(f"Error: Dataset file not found at '{CSV_FILE}'.")
        print("Please update the CSV_FILE variable with the correct path.")
        exit()

    # --- 2. Initialize Graph ---
    scale = 100 / NODES
    proximity = 1.42 * scale
    dist_scale = 30
    pos_dict = {}
    aspect_dict = {'N': -0.063, 'NE':0.349, 'E':0.686, 'SE':0.557, 'S':0.039, 'SW':-0.155, 'W':-0.252, 'NW':-0.171}
    
    if len(df) < NODES:
        print(f"Warning: NODES ({NODES}) is greater than the number of rows in the CSV ({len(df)}).")
        print("Using all available rows instead.")
        NODES = len(df)

    ele_series = df.loc[0:NODES-1, 'Elevation']
    ele_max = ele_series.max()
    ele_min = ele_series.min()

    g = nx.Graph()
    empty_list = []
    k = 1
    grid_size = int(np.sqrt(NODES))
    for i in range(1, grid_size + 2):
        for j in range(1, grid_size + 2):
            if k > NODES: break
            slope = df.at[k-1, 'Slope']
            elevation = df.at[k-1, 'Elevation']
            aspect = df.at[k-1, 'Aspect']
            theta = node_threshold(slope, elevation, ele_min, ele_max, aspect, aspect_dict)
            lf = rnd.randint(3, 7)
            
            current_pos = (i * scale, j * scale)
            if rnd.uniform(0, 1) > DENSITY_FACTOR:
                g.add_node(k, threshold_switch=1.0, color='black', num_of_active_neighbors=0, fire_state='empty', life=lf, pos=current_pos)
                empty_list.append(k)
            else:
                g.add_node(k, threshold_switch=theta, color='green', num_of_active_neighbors=0, fire_state='not_burnt', life=lf, pos=current_pos)
            pos_dict[k] = current_pos
            k += 1
        if k > NODES: break
        
    edge_list = []
    node_ids = list(g.nodes())
    for i in range(len(node_ids)):
        for j in range(i + 1, len(node_ids)):
            n1 = node_ids[i]
            n2 = node_ids[j]
            p1 = g.nodes[n1]['pos']
            p2 = g.nodes[n2]['pos']
            not_empty = g.nodes[n1]['fire_state'] != 'empty' and g.nodes[n2]['fire_state'] != 'empty'
            if dist(p1, p2, 1) < proximity and not_empty: # Using scale=1 for grid distance
                edge_list.append((n1, n2))

    for n1, n2 in edge_list:
        p1 = g.nodes[n1]['pos']
        p2 = g.nodes[n2]['pos']
        angle = get_angle(p1, p2)
        pp = edge_weight(MAX_WIND_SPEED, 0.1, 0, angle, dist(p1, p2, dist_scale))
        lf = np.floor((g.nodes[n1]['life'] + g.nodes[n2]['life']) / 2)
        g.add_edge(n1, n2, w=pp, color='green', life=int(lf), edge_strength=0, wind_speed=0.01, wind_dir=angle, eb=0)

    # --- 3. Prepare for Simulation ---
    if SAVE_IMAGES and not os.path.exists(SAVE_FOLDER):
        os.makedirs(SAVE_FOLDER)
        print(f"Created directory: {SAVE_FOLDER}")

    colors = ['black'] * NODES
    for node, data in g.nodes(data=True):
        colors[node-1] = data['color']

    # --- 4. Set Initial Ignition Point ---
    non_burnt_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] == 'not_burnt']
    ignition_node = None

    if not non_burnt_nodes:
        print("No nodes available to ignite. Exiting simulation.")
        exit()

    if IGNITION_POINT == "random":
        ignition_node = rnd.choice(non_burnt_nodes)
        print(f"Starting fire at random node: {ignition_node}")
    else:
        try:
            node_id = int(IGNITION_POINT)
            if g.has_node(node_id) and g.nodes[node_id]['fire_state'] == 'not_burnt':
                ignition_node = node_id
                print(f"Starting fire at specified node: {ignition_node}")
            else:
                print(f"Warning: Node {node_id} is invalid or not burnable (e.g., empty space).")
                ignition_node = rnd.choice(non_burnt_nodes)
                print(f"Falling back to random start node: {ignition_node}")
        except (ValueError, TypeError):
            print(f"Warning: Invalid IGNITION_POINT '{IGNITION_POINT}'. Value must be 'random' or an integer.")
            ignition_node = rnd.choice(non_burnt_nodes)
            print(f"Falling back to random start node: {ignition_node}")

    if ignition_node:
        g.nodes[ignition_node]['fire_state'] = 'burning'
        g.nodes[ignition_node]['color'] = 'orange'
        colors[ignition_node - 1] = 'orange'
    
    # --- 5. Run Simulation Loop ---
    prev_burning_forests = 0
    current_burning_forests = 1 if ignition_node else 0
    non_empty_count = count_non_empty(g)
    
    final_timestep = 0
    for i in range(TIMESTEPS + 1):
        final_timestep = i
        if i > 0 and prev_burning_forests >= current_burning_forests:
            print("Forest fire simulation complete: No new forests are burning.")
            break

        print(f"--- Timestep {i} ---")
        print(f"Burning: {current_burning_forests} | Burnt: {count_burnt(g)} | Total Affected: {current_burning_forests + count_burnt(g)} / {non_empty_count}")

        node_colors = [g.nodes[n]['color'] for n in sorted(g.nodes())]
        edge_colors = [g.edges[e].get('color', 'gray') for e in g.edges()]
        
        filepath = os.path.join(SAVE_FOLDER, f"timestep_{i:03d}.png") if SAVE_IMAGES else None
        draw_graph(g, 50, node_colors, edge_colors, pos_dict, 10, filepath=filepath)

        g, colors = incinerate(g, colors, edge_list)
        
        if i > 0 and i % 3 == 0: 
            print("Simulating wind...")
            simulate_wind(g, edge_list, MAX_WIND_SPEED, 0.1, dist_scale)

        prev_burning_forests = current_burning_forests
        current_burning_forests = count_burning(g)
    
    if final_timestep >= TIMESTEPS:
         print("Forest fire simulation complete: Reached the maximum iteration number.")

    # --- 6. Save Final State ---
    print("\n--- Final State ---")
    node_colors = [g.nodes[n]['color'] for n in sorted(g.nodes())]
    edge_colors = [g.edges[e].get('color', 'gray') for e in g.edges()]
    filepath = os.path.join(SAVE_FOLDER, f"final_state_{final_timestep:03d}.png") if SAVE_IMAGES else None
    draw_graph(g, 50, node_colors, edge_colors, pos_dict, 10, filepath=filepath)

