def predict_label(instance_df, models, configs, target_col):
    """
    Predict label by propagating through models in topological order.
    """
    instance = instance_df.copy()
    top_order = sorted(configs.keys())  # assumes configs already provide valid dependencies

    for node in top_order:
        parents = configs[node]["input_features"]
        pred = models[node].predict(instance[parents])[0]
        instance[node] = pred

    return instance[target_col].values[0]