import os

# ------------------ PATH CONFIG ------------------ #
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

DATA_PATH = os.path.join(BASE_DIR, "data_features.csv")
GROUPINGS_PATH = os.path.join(BASE_DIR, "models", "disaster-assessment-tool", "assets", "groupings", "feature_groupings.csv")
DAG_PATH = os.path.join(BASE_DIR, "models", "disaster-assessment-tool", "assets", "dags", "dag_structures.json")
OUTPUT_BASE = os.path.join(BASE_DIR, "models", "disaster-assessment-tool", "assets", "full_features_v6")

# ------------------ SIMULATION CONFIG ------------------ #
TARGET_COL = "Property_Damage_GT"

VALID_DAG_KEYS = [
    'DAG_1_Independent',
    'DAG_2_Infrastructure_Mediator',
    'DAG_3_Flood_Driven'
]

# ------------------ SERVER CONFIG ------------------ #
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 5000
DEBUG_MODE = True
