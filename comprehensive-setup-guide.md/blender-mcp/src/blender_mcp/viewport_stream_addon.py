bl_info = {
    "name": "Live Viewport Stream Server",
    "author": "Your Name",
    "version": (1, 0, 0),
    "blender": (2, 93, 0),
    "location": "View3D > Toolshelf",
    "description": "Serves the live Blender viewport as a JPEG stream via Flask.",
    "category": "3D View",
}

import threading
import time
import io
import sys


# Import bpy separately, fail hard if not in Blender
try:
    import bpy
except ImportError:
    bpy = None
    print("[Viewport Stream] This add-on must be run inside Blender.", file=sys.stderr)

# Import optional dependencies for streaming
try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None
    print("[Viewport Stream] Pillow (PIL) not found. Install it for streaming.", file=sys.stderr)
try:
    import numpy as np
except ImportError:
    np = None
    print("[Viewport Stream] numpy not found. Install it for streaming.", file=sys.stderr)
try:
    from flask import Flask, make_response
except ImportError:
    Flask = None
    make_response = None
    print("[Viewport Stream] Flask not found. Install it for streaming.", file=sys.stderr)

flask_app = Flask(__name__) if Flask else None
_latest_frame_jpg = None
_frame_lock = threading.Lock()


def capture_blender_viewport():
    global _latest_frame_jpg
    if not bpy or not PILImage or not np:
        return
    try:
        for window in bpy.context.window_manager.windows:
            for area in window.screen.areas:
                if area.type == 'VIEW_3D':
                    for region in area.regions:
                        if region.type == 'WINDOW':
                            override = {'window': window, 'screen': window.screen, 'area': area, 'region': region}
                            width = region.width
                            height = region.height
                            offscreen = bpy.types.GPUOffScreen(width, height)
                            with offscreen.bind():
                                bpy.ops.render.opengl(override, view_context=True)
                                buffer = offscreen.read_color(0, 0, width, height, 4, 0, 'BYTE')
                            offscreen.free()
                            arr = np.frombuffer(buffer, dtype=np.uint8).reshape((height, width, 4))
                            arr = np.flip(arr, axis=0)
                            img = PILImage.fromarray(arr[..., :3], 'RGB')
                            buf = io.BytesIO()
                            img.save(buf, format='JPEG', quality=80)
                            with _frame_lock:
                                _latest_frame_jpg = buf.getvalue()
                            return
    except Exception as e:
        print(f"[Viewport Stream] Error capturing viewport: {e}", file=sys.stderr)


def frame_capture_loop():
    while True:
        capture_blender_viewport()
        time.sleep(0.1)

if flask_app:
    @flask_app.route('/frame.jpg')
    def serve_frame():
        with _frame_lock:
            if _latest_frame_jpg:
                response = make_response(_latest_frame_jpg)
                response.headers['Content-Type'] = 'image/jpeg'
                response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
                return response
            else:
                return ("No frame available", 503)

def start_flask_server():
    if flask_app:
        flask_app.run(host='0.0.0.0', port=5001, threaded=True, use_reloader=False)

def start_viewport_streaming():
    if not bpy or not Flask:
        print("[Viewport Stream] Not running inside Blender or Flask not available.", file=sys.stderr)
        return
    t1 = threading.Thread(target=frame_capture_loop, daemon=True)
    t1.start()
    t2 = threading.Thread(target=start_flask_server, daemon=True)
    t2.start()
    print("[Viewport Stream] Flask server and frame capture started on port 5001.")

# Blender Add-on registration
class VIEW3D_OT_start_viewport_streaming(bpy.types.Operator):
    bl_idname = "view3d.start_viewport_streaming"
    bl_label = "Start Viewport Streaming Server"
    bl_description = "Start the Flask server to stream the viewport as JPEGs"
    bl_options = {'REGISTER'}

    def execute(self, context):
        start_viewport_streaming()
        self.report({'INFO'}, "Viewport streaming server started.")
        return {'FINISHED'}

def menu_func(self, context):
    self.layout.operator(VIEW3D_OT_start_viewport_streaming.bl_idname)

def register():
    if bpy:
        bpy.utils.register_class(VIEW3D_OT_start_viewport_streaming)
        bpy.types.VIEW3D_MT_view.append(menu_func)

def unregister():
    if bpy:
        bpy.utils.unregister_class(VIEW3D_OT_start_viewport_streaming)
        bpy.types.VIEW3D_MT_view.remove(menu_func)

if __name__ == "__main__":
    register()
