"""Forest shape utilities: build point-in-polygon predicate from GeoJSON/list/shapely."""
from matplotlib.path import Path

# Import SSOT `state.py` with a robust fallback for different run contexts
try:
    from py import state as app_state
except Exception:
    try:
        # when executed as a package (e.g. python -m py.wildfire_sim.create_forest)
        from .. import state as app_state
    except Exception:
        # fallback: local import (works if PYTHONPATH or CWD contains py/)
        import state as app_state


def make_point_in_forest(shape_obj, scale, grid_size):
    """Return predicate(pt)->bool testing whether pt is inside shape_obj (supports GeoJSON/list/shapely)."""
    if not shape_obj:
        return None

    # Feature wrapper
    if isinstance(shape_obj, dict) and shape_obj.get('type') == 'Feature':
        shape_obj = shape_obj.get('geometry')

    # GeoJSON geometry
    if isinstance(shape_obj, dict) and shape_obj.get('type') in ('Polygon', 'MultiPolygon'):
        geom_type = shape_obj.get('type')
        coords = shape_obj.get('coordinates', [])
        polygons = []
        if geom_type == 'Polygon' and coords:
            polygons.append(coords[0])
        elif geom_type == 'MultiPolygon' and coords:
            for poly in coords:
                if poly:
                    polygons.append(poly[0])

        all_pts = []
        for poly in polygons:
            for lon, lat in poly:
                all_pts.append((float(lon), float(lat)))

        if not all_pts:
            return None

        lon_vals = [p[0] for p in all_pts]
        lat_vals = [p[1] for p in all_pts]
        lon_min, lon_max = min(lon_vals), max(lon_vals)
        lat_min, lat_max = min(lat_vals), max(lat_vals)

        x_min = scale
        x_max = grid_size * scale
        y_min = scale
        y_max = grid_size * scale

        def _project(lon, lat):
            # uniform scale projection into grid box, centered to preserve aspect
            lon_range = lon_max - lon_min
            lat_range = lat_max - lat_min
            x_range = x_max - x_min
            y_range = y_max - y_min

            if lon_range == 0 and lat_range == 0:
                return ((x_min + x_max) / 2.0, (y_min + y_max) / 2.0)

            if lon_range == 0:
                scale_u = y_range / lat_range if lat_range != 0 else 1.0
            elif lat_range == 0:
                scale_u = x_range / lon_range if lon_range != 0 else 1.0
            else:
                scale_u = min(x_range / lon_range, y_range / lat_range)

            proj_x = (float(lon) - lon_min) * scale_u
            proj_y = (float(lat) - lat_min) * scale_u

            total_proj_w = (lon_range if lon_range != 0 else 1.0) * scale_u
            total_proj_h = (lat_range if lat_range != 0 else 1.0) * scale_u

            offset_x = x_min + (x_range - total_proj_w) / 2.0
            offset_y = y_min + (y_range - total_proj_h) / 2.0

            x = offset_x + proj_x
            y = offset_y + proj_y
            return (x, y)

        path_list = []
        for poly in polygons:
            try:
                proj_pts = [_project(lon, lat) for lon, lat in poly]
                path_list.append(Path(proj_pts))
            except Exception:
                continue

        if not path_list:
            return None

        def _fn(pt):
            for p in path_list:
                if p.contains_point(pt):
                    return True
            return False

        return _fn

    # Sequence of coords
    if isinstance(shape_obj, (list, tuple)) and len(shape_obj) > 0 and isinstance(shape_obj[0], (list, tuple)):
        try:
            pts = [(float(x), float(y)) for x, y in shape_obj]
            path = Path(pts)
            return lambda pt: path.contains_point(pt)
        except Exception:
            return None

    # shapely geometry
    if hasattr(shape_obj, 'contains'):
        try:
            from shapely.geometry import Point
        except Exception:
            return None
        def _fn_shapely(pt):
            return bool(shape_obj.contains(Point(pt)))
        return _fn_shapely

    return None


def get_point_in_forest(scale, grid_size, override_shape=None):
    """Return predicate from override_shape or latest stored shape in state."""
    shape = override_shape if override_shape is not None else app_state.get_forest_shape()
    return make_point_in_forest(shape, scale, grid_size)
