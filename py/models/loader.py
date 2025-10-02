import os
import json
import joblib
import numpy as np


def load_scm_components(model_dir):
    """
    Load SCM models, configs, epsilons, and scaler from disk.
    Returns: (models, configs, epsilons, scaler)
    """
    models, configs, epsilons = {}, {}, {}
    model_path = os.path.join(model_dir, "models")

    # Load models and configs
    for file in os.listdir(model_path):
        path = os.path.join(model_path, file)
        if file.endswith(".joblib") and file != "scaler.joblib":
            node = file.replace(".joblib", "")
            models[node] = joblib.load(path)
        elif file.endswith("_model_config.json"):
            node = file.replace("_model_config.json", "")
            with open(path) as f:
                configs[node] = json.load(f)

    # Load epsilons
    eps_dir = os.path.join(model_dir, "eps")
    for file in os.listdir(eps_dir):
        if file.startswith("eps_test_") and file.endswith(".npy"):
            node = file.replace("eps_test_", "").replace(".npy", "")
            epsilons[node] = np.load(os.path.join(eps_dir, file))

    # Load scaler
    scaler = joblib.load(os.path.join(model_path, "scaler.joblib"))

    return models, configs, epsilons, scaler