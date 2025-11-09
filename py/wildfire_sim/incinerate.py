import pandas as pd
import numpy as np
import random as rnd
import networkx as nx
import logging
from matplotlib.path import Path
# from wildfire_sim.create_forest import get_point_in_forest

from config import ROOSEVELT_FOREST_COVER_CSV

# =========================================================================
# User-configurable Parameters
# =========================================================================
CSV_FILE = ROOSEVELT_FOREST_COVER_CSV
NODES = 50*50
# NODES = 20*20 # original
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
TIMESTEPS = 1000
# TODO: allow for a user set ignition point by node ID
IGNITION_POINT = "random"

logger = logging.getLogger(__name__)

# =========================================================================
# Core Simulation Functions
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
    # old behavior: bottom→top first, then left→right
    col = (node_id - 1) // grid_size   # which column
    row = (node_id - 1) % grid_size    # which row (bottom→top)
    return row, col

def incinerate(g, colors, edge_list):
    # cell scale (grid unit) based on global NODES so ember distances can be computed
    cell_scale = 100.0 / NODES
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
                ths = g.nodes[nb]['threshold_switch']
                if s >= ths:
                    nodes_to_ignite.append((nb, ignition_node))

    for nb, ignition_node in nodes_to_ignite:
        if g.nodes[nb]['fire_state'] != 'burning':
            g.nodes[nb]['fire_state'] = 'burning'
            colors[nb - 1] = 'orange'
            g.nodes[nb]['color'] = 'orange'
            if g.has_edge(ignition_node, nb):
                g[ignition_node][nb]['color'] = 'orange'

    # Ember mechanic: burning nodes occasionally create embers that can ignite
    # non-neighboring nodes within a radius to introduce long-range stochastic spread.
    non_empty_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] not in ('empty', 'burning', 'burnt')]
    for bnode in burning_nodes:
        if not non_empty_nodes:
            break
        if rnd.random() < EMBER_PROB:
            # pick targets within EMBER_RADIUS grid cells (using pos differences)
            bx, by = g.nodes[bnode]['pos']
            candidates = []
            for n in non_empty_nodes:
                nxp, nyp = g.nodes[n]['pos']
                # grid distance approximation (cell units)
                dx = abs(nxp - bx) / cell_scale
                dy = abs(nyp - by) / cell_scale
                if dx <= EMBER_RADIUS and dy <= EMBER_RADIUS:
                    candidates.append(n)
            if not candidates:
                # fallback: allow global ember target occasionally
                if rnd.random() < 0.1:
                    candidates = non_empty_nodes
            if candidates:
                target = rnd.choice(candidates)
                # ignite with some probability depending on a reduced chance
                if rnd.random() < 0.5:
                    g.nodes[target]['fire_state'] = 'burning'
                    g.nodes[target]['color'] = 'orange'
                    # color edges from nearby burning node if present
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
    snn = int(np.sqrt(nn))
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
    elliptical_nodes = []
    for node, data in g.nodes(data=True):
        if data['fire_state'] != 'empty':
            x, y = g.nodes[node]['pos']
            if ((x - center_x)**2 / (a * 1)**2) + ((y - center_y)**2 / (b * 1)**2) <= 1:
                elliptical_nodes.append(node)
    focus = center_node
    if a > b:
        focus = center_node + snn * c
    else:
        focus = center_node + c
    if not (1 <= focus <= nn and g.has_node(focus)):
        focus = center_node
    posf = g.nodes[focus]['pos']
    for n1 in elliptical_nodes:
        for n2 in elliptical_nodes:
            if n1 >= n2 or not g.has_edge(n1, n2):
                continue
            pos1 = g.nodes[n1]['pos']
            pos2 = g.nodes[n2]['pos']
            if a > b:
                angle = 0 if (pos1[0] > posf[0] and pos2[0] > posf[0]) else 180
            else:
                angle = 90 if (pos1[1] > posf[1] and pos2[1] > posf[1]) else 270
            w_e = edge_weight(max_speed, epsilon, 1, angle, dist(pos1, pos2, 30))
            g[n1][n2]['w'] = w_e
            g[n1][n2]['wind_dir'] = angle
            g[n1][n2]['edge_strength'] = 1
    return (center_node_pos, a, b)

# =========================================================================
# Simulation Runner 
# =========================================================================

def run_wildfire_simulation(ignitLat=None, ignitLon=None, forest_shape=None):
    logger.info(f"Starting wildfire simulation for ({ignitLat}, {ignitLon})")
    print(f"[DEBUG] Attempting to load dataset from: {CSV_FILE}")
    try:
        df = pd.read_csv(CSV_FILE)
    except FileNotFoundError:
        print(f"[ERROR] File not found at path: {CSV_FILE}")
        return {"success": False, "error": f"Dataset file not found at {CSV_FILE}"}

    scale = 100 / NODES
    # grid_size is needed by the forest-shape projection helper, compute it early
    grid_size = int(np.ceil(np.sqrt(NODES)))
    proximity = 1.42 * scale
    dist_scale = 30
    pos_dict = {}
    aspect_dict = {'N': -0.063, 'NE':0.349, 'E':0.686, 'SE':0.557, 'S':0.039, 'SW':-0.155, 'W':-0.252, 'NW':-0.171}

    # Create a point-in-forest predicate using the helper module; this will
    # use the provided override `forest_shape` if passed, otherwise it will
    # read the latest stored shape from the SSOT in `state.py`.
    # point_in_forest = get_point_in_forest(scale, grid_size, forest_shape)

    if len(df) < NODES:
        nodes_count = len(df)
    else:
        nodes_count = NODES

    ele_series = df.loc[0:nodes_count-1, 'Elevation']
    ele_max = ele_series.max()
    ele_min = ele_series.min()

    g = nx.Graph()
    empty_list = []
    k = 1
    # grid_size_y = int(np.ceil(NODES / grid_size_x))

    for i in range(1, grid_size + 1):
        for j in range(1, grid_size + 1):
            if k > NODES:
                break

            slope = df.at[k - 1, 'Slope']
            elevation = df.at[k - 1, 'Elevation']
            aspect = df.at[k - 1, 'Aspect']
            theta = node_threshold(slope, elevation, ele_min, ele_max, aspect, aspect_dict)
            lf = rnd.randint(3, 7)

            current_pos = (i * scale, j * scale)

            # If a forest_shape was provided, force nodes outside it to be 'empty'.
            inside_forest = True
            # if point_in_forest:
            #     try:
            #         inside_forest = bool(point_in_forest(current_pos))
            #     except Exception:
            #         inside_forest = True

            if not inside_forest:
                g.add_node(k, threshold_switch=1.0, color='black', num_of_active_neighbors=0,
                           fire_state='empty', life=lf, pos=current_pos)
                empty_list.append(k)
            else:
                # original density-based occupancy behavior
                if rnd.uniform(0, 1) > DENSITY_FACTOR:
                    g.add_node(k, threshold_switch=1.0, color='black', num_of_active_neighbors=0,
                               fire_state='empty', life=lf, pos=current_pos)
                    empty_list.append(k)
                else:
                    g.add_node(k, threshold_switch=theta, color='green', num_of_active_neighbors=0,
                               fire_state='not_burnt', life=lf, pos=current_pos)

            pos_dict[k] = current_pos
            k += 1
        if k > NODES:
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
        return {"success": False, "error": "No nodes available to ignite"}

    ignition_node = rnd.choice(non_burnt_nodes) if IGNITION_POINT == "random" else int(IGNITION_POINT)
    # if IGNITION_POINT == "random" and lat is not None and lng is not None:
    #     rnd.seed(int(lat * 1000 + lng * 1000))
    if ignition_node and g.has_node(ignition_node):
        g.nodes[ignition_node]['fire_state'] = 'burning'
        g.nodes[ignition_node]['color'] = 'orange'

    simulation_results = []
    prev_burning_forests = 0
    current_burning_forests = 1 if ignition_node else 0
    non_empty_count = count_non_empty(g)

    final_timestep = 0
    for i in range(TIMESTEPS + 1):
        final_timestep = i
        # Option A: run until all burning nodes finish (simulate complete wildfire)
        # Stop when there are no burning nodes left or when we've reached TIMESTEPS.
        if current_burning_forests == 0:
            break

        timestep_data = {
            "timestep": i,
            "burning": current_burning_forests,
            "burnt": count_burnt(g),
            "total": non_empty_count,
            "nodes": [
                {
                    "id": n,
                    "state": g.nodes[n]['fire_state'],
                    "color": g.nodes[n]['color'],
                    "row": node_id_to_grid(n, grid_size)[0],
                    "col": node_id_to_grid(n, grid_size)[1]
                }
                for n in g.nodes
            ]
        }
        simulation_results.append(timestep_data)

        g, _ = incinerate(g, [g.nodes[n]['color'] for n in sorted(g.nodes())], edge_list)

        if i > 0:
        # if i > 0 and i % 3 == 0:
        # increased wind freq to every timestep
            simulate_wind(g, edge_list, MAX_WIND_SPEED, 0.1, dist_scale)

        prev_burning_forests = current_burning_forests
        current_burning_forests = count_burning(g)

    logger.info(" Ending wildfire simulation (HTTP mode)")
    logger.info(f" Final timestep: {final_timestep}")
    print("DEBUG Node sample", [
        (n, g.nodes[n]['fire_state'], node_id_to_grid(n, grid_size))
        for n in list(g.nodes)[:20]
    ])
    return {
        "success": True,
        "message": "Simulation complete",
        "final_timestep": final_timestep,
        "timesteps": simulation_results,
        "grid_size": grid_size
    }
