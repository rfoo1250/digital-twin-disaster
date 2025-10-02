from config import TARGET_COL


def do_intervention(instance, interventions):
    """
    Apply interventions (scaled values) directly to the instance.
    """
    for var, val in interventions.items():
        instance[var] = val
    return instance


def abduction_action_prediction(instance, models, epsilons, configs, top_order, interventions):
    """
    Perform abduction-action-prediction step of SCM simulation.
    """
    for node in top_order:
        if node in interventions:
            continue  # Skip intervened variables
        parents = configs[node]["input_features"]
        pred = models[node].predict(instance[parents])[0]
        instance[node] = pred + epsilons[node][0] if node != TARGET_COL else pred
    return instance
