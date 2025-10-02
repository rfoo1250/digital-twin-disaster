from collections import defaultdict
from config import TARGET_COL
import pandas as pd


def load_group_to_features(groupings: pd.DataFrame):
    """
    Map group name → list of features.
    """
    group_to_features = defaultdict(list)
    for _, row in groupings.iterrows():
        group_to_features[row["Group"]].append(row["Feature"])
    return group_to_features


def expand_group_dag_to_parents(dag_json, groupings, target_col=TARGET_COL):
    """
    Expand group-level DAG into feature-level parent mapping.
    """
    group_to_features = load_group_to_features(groupings)
    dag_parents = defaultdict(list)

    for src_group, tgt_groups in dag_json.items():
        src_feats = group_to_features.get(src_group, [])
        for tgt_group in tgt_groups:
            tgt_feats = group_to_features.get(tgt_group, [])
            for tgt_feat in tgt_feats:
                dag_parents[tgt_feat].extend(src_feats)

    dag_parents.setdefault(target_col, [])
    for src_group, tgt_groups in dag_json.items():
        if target_col in tgt_groups:
            dag_parents[target_col].extend(group_to_features.get(src_group, []))

    # Deduplicate parent lists
    for node in dag_parents:
        dag_parents[node] = list(set(dag_parents[node]))

    return dag_parents


def topological_sort(parents_dict):
    """
    Perform topological sort based on parent relationships.
    """
    all_nodes = set(parents_dict.keys()) | {p for ps in parents_dict.values() for p in ps}
    in_deg = {node: 0 for node in all_nodes}

    for child, parents in parents_dict.items():
        for parent in parents:
            in_deg[child] += 1

    queue = [node for node, deg in in_deg.items() if deg == 0]
    sorted_nodes = []

    while queue:
        node = queue.pop(0)
        sorted_nodes.append(node)
        for child, parents in parents_dict.items():
            if node in parents:
                in_deg[child] -= 1
                if in_deg[child] == 0:
                    queue.append(child)

    return [n for n in sorted_nodes if n in parents_dict or n == TARGET_COL]