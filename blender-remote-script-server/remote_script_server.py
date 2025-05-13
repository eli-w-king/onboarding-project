import bpy
import threading
import time
import os
from flask import Flask, request, jsonify, send_file

# Globals
flask_app = Flask(__name__)
SCRIPT_RESULT_PATH = "/tmp/blender_script_render.jpg"

# --- Script Execution Endpoint ---
@flask_app.route('/run_script', methods=['POST'])
def run_script():
    code = request.json.get('code', '')
    try:
        # Provide a safe namespace with bpy
        exec(code, {'bpy': bpy, 'SCRIPT_RESULT_PATH': SCRIPT_RESULT_PATH})
        # If the script rendered an image, return it
        if os.path.exists(SCRIPT_RESULT_PATH):
            return send_file(SCRIPT_RESULT_PATH, mimetype='image/jpeg')
        return jsonify({'status': 'ok', 'message': 'Script executed, no image output.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

# --- Simple Status Endpoint ---
@flask_app.route('/')
def index():
    return '<h2>Blender Remote Script Server is running.</h2>'

# --- Start Flask in a thread (for Blender add-on compatibility) ---
def start_flask_server():
    flask_app.run(host='0.0.0.0', port=5002, threaded=True, use_reloader=False)

def register():
    t = threading.Thread(target=start_flask_server, daemon=True)
    t.start()
    print('[Blender Remote Script Server] Flask server started on port 5002.')

def unregister():
    print('[Blender Remote Script Server] Unregister called.')

if __name__ == "__main__":
    register()
