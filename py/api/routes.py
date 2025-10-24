from flask import request, jsonify
import logging
import traceback

from simulation.engine import run_scm_counterfactual_simulation
from wildfire_sim.incinerate import run_wildfire_simulation
import state as app_state
from config import VALID_DAG_KEYS

logger = logging.getLogger(__name__)


def register_routes(app):
    @app.route('/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'healthy', 'message': 'API is running'})

    @app.route('/simulate', methods=['POST'])
    def run_simulation():
        try:
            if not request.is_json:
                return jsonify({'error': 'Content-Type must be application/json'}), 400

            data = request.get_json()
            required_fields = ['original_dict', 'interventions_dict']
            for field in required_fields:
                if field not in data:
                    return jsonify({'error': f'Missing required field: {field}'}), 400

            original_dict = data['original_dict']
            interventions_dict = data['interventions_dict']
            dag_key = data.get('dag_key', 'DAG_1_Independent')

            if dag_key not in VALID_DAG_KEYS:
                return jsonify({'error': f'Invalid dag_key. Must be one of: {VALID_DAG_KEYS}'}), 400

            logger.info(f"Running simulation with dag_key: {dag_key}")
            counterfactual_label, original_label = run_scm_counterfactual_simulation(original_dict, interventions_dict, dag_key)

            return jsonify({
                'success': True,
                'results': {
                    'counterfactual_label': counterfactual_label,
                    'original_label': original_label,
                    'dag_key_used': dag_key
                }
            })
        except Exception as e:
            logger.error(f"Simulation failed: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': 'Internal server error during simulation', 'message': str(e)}), 500

    @app.route('/simulate/batch', methods=['POST'])
    def run_batch_simulation():
        try:
            if not request.is_json:
                return jsonify({'error': 'Content-Type must be application/json'}), 400

            data = request.get_json()
            if 'simulations' not in data or not isinstance(data['simulations'], list):
                return jsonify({'error': 'Invalid or missing simulations list'}), 400

            results = []
            for i, sim in enumerate(data['simulations']):
                try:
                    original_dict = sim['original_dict']
                    interventions_dict = sim['interventions_dict']
                    dag_key = sim.get('dag_key', 'DAG_1_Independent')

                    counterfactual_label, original_label = run_scm_counterfactual_simulation(original_dict, interventions_dict, dag_key)

                    results.append({
                        'index': i,
                        'success': True,
                        'counterfactual_label': counterfactual_label,
                        'original_label': original_label,
                        'dag_key_used': dag_key
                    })
                except Exception as e:
                    results.append({'index': i, 'success': False, 'error': str(e)})

            return jsonify({'success': True, 'results': results, 'total_simulations': len(results)})
        except Exception as e:
            logger.error(f"Batch simulation failed: {str(e)}")
            return jsonify({'error': 'Internal server error during batch simulation', 'message': str(e)}), 500

    @app.route('/simulate_wildfire', methods=['POST'])
    def run_wildfire_simulation_route():
        try:
            logger.info("Running wildfire simulation")

            # accept optional JSON payload that may include forestShape
            forest_shape = None
            if request.is_json:
                data = request.get_json()
                forest_shape = data.get('forestShape')
                # store the shape in the app-wide SSOT so other modules can access it
                if forest_shape is not None:
                    app_state.set_forest_shape(forest_shape)
            else:
                # If there is a body but it's not JSON, reject it
                if request.data and len(request.data) > 0:
                    return jsonify({'error': 'Content-Type must be application/json'}), 400

            result = run_wildfire_simulation(forest_shape=forest_shape)

            # attach stored forest shape back into the response for the frontend
            # if forest_shape is not None:
            #     result['forestFeature'] = forest_shape

            return jsonify(result)
        except Exception as e:
            logger.error(f"Wildfire simulation failed: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({'error': 'Internal server error during wildfire simulation', 'message': str(e)}), 500
