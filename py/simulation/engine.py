import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder

from models.loader import load_scm_components
from simulation.interventions import do_intervention, abduction_action_prediction
from simulation.predictor import predict_label
from simulation.dag_utils import topological_sort
from config import OUTPUT_BASE, TARGET_COL


def run_scm_counterfactual_simulation(original_sample, interventions_raw, dag_key):
    """
    Run SCM counterfactual simulation given an original sample, interventions, and DAG key.
    Returns: (counterfactual_label, original_label)
    """
    # Prepare label encoder
    label_encoder = LabelEncoder()
    label_encoder.classes_ = np.array(["High", "Low", "Medium"])

    # Load models, configs, epsilons, scaler
    model_dir = f"{OUTPUT_BASE}/scm_{dag_key.lower()}"
    models, configs, epsilons, scaler = load_scm_components(model_dir)

    # Topological order of nodes
    top_order = topological_sort({k: v["input_features"] for k, v in configs.items()})

    # Prepare input data
    original = pd.DataFrame([original_sample])
    input_features = scaler.feature_names_in_

    scaled_input = original[input_features].copy()
    scaled_input[input_features] = scaler.transform(scaled_input[input_features])

    # Apply interventions (unscaled → scaled)
    temp = original[input_features].copy()
    for var, new_val in interventions_raw.items():
        temp[var] = new_val
    temp[input_features] = scaler.transform(temp[input_features])

    scaled_interventions = {var: temp[var].values[0] for var in interventions_raw}

    # Counterfactual simulation
    counterfactual = do_intervention(scaled_input.copy(), scaled_interventions)
    counterfactual = abduction_action_prediction(
        counterfactual, models, epsilons, configs, top_order, scaled_interventions
    )

    # Predictions
    label_id = predict_label(scaled_input, models, configs, TARGET_COL)
    original_label = label_encoder.inverse_transform([label_id])[0]

    counterfactual_numeric = counterfactual[TARGET_COL].values[0]
    counterfactual_label = label_encoder.inverse_transform([counterfactual_numeric])[0]

    return counterfactual_label, original_label