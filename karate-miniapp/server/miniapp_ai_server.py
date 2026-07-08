#!/usr/bin/env python3
"""
小程序云端 AI 推理服务
提供姿态检测和人脸检测 API，供微信小程序调用
依赖: pip install mediapipe opencv-python numpy face-recognition
"""

import base64
import io
import json
import os
import numpy as np
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = os.environ.get("MINIAPP_AI_HOST", "0.0.0.0")
PORT = int(os.environ.get("MINIAPP_AI_PORT", "8789"))

mp_pose = None
mp_face_detection = None
face_recognition_lib = None


def init_models():
    global mp_pose, mp_face_detection, face_recognition_lib

    print("[AI] 正在加载 MediaPipe Pose...")
    import mediapipe as mp
    mp_pose = mp.solutions.pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    print("[AI] MediaPipe Pose 加载完成")

    print("[AI] 正在加载人脸识别库...")
    try:
        import face_recognition
        face_recognition_lib = face_recognition
        print("[AI] face_recognition 加载完成")
    except ImportError:
        print("[AI] face_recognition 未安装，人脸检测将使用 MediaPipe")
        mp_face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.5
        )
    print("[AI] 所有模型加载完成")


def decode_image(image_base64):
    import cv2
    image_data = base64.b64decode(image_base64)
    nparr = np.frombuffer(image_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")
    return img


def detect_pose(image_base64):
    import cv2
    img = decode_image(image_base64)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = mp_pose.process(img_rgb)

    if not results.pose_landmarks:
        return {"ok": True, "landmarks": None, "detected": False}

    landmarks = []
    for lm in results.pose_landmarks.landmark:
        landmarks.append({
            "x": round(lm.x, 5),
            "y": round(lm.y, 5),
            "z": round(lm.z, 5),
            "visibility": round(lm.visibility, 5)
        })

    return {"ok": True, "landmarks": landmarks, "detected": True}


def detect_face(image_base64):
    import cv2
    img = decode_image(image_base64)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    if face_recognition_lib is not None:
        face_locations = face_recognition_lib.face_locations(img_rgb)
        if not face_locations:
            return {"ok": True, "descriptor": None, "detected": False}

        encodings = face_recognition_lib.face_encodings(img_rgb, face_locations)
        if not encodings:
            return {"ok": True, "descriptor": None, "detected": False}

        descriptor = encodings[0].tolist()
        return {"ok": True, "descriptor": descriptor, "detected": True}
    else:
        results = mp_face_detection.process(img_rgb)
        if not results.detections:
            return {"ok": True, "descriptor": None, "detected": False}

        return {
            "ok": True,
            "descriptor": None,
            "detected": True,
            "faceLocation": {
                "xMin": results.detections[0].location_data.relative_bounding_box.xmin,
                "yMin": results.detections[0].location_data.relative_bounding_box.ymin,
                "width": results.detections[0].location_data.relative_bounding_box.width,
                "height": results.detections[0].location_data.relative_bounding_box.height
            }
        }


class AIRequestHandler(BaseHTTPRequestHandler):

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, error):
        self.send_json(status, {"ok": False, "error": str(error)})

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if path == "/api/health":
            return self.send_json(HTTPStatus.OK, {"ok": True, "service": "miniapp-ai"})
        return self.send_error_json(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode("utf-8") or "{}")

            if path == "/api/pose-detect":
                image_base64 = payload.get("image", "")
                if not image_base64:
                    return self.send_error_json(HTTPStatus.BAD_REQUEST, "image is required")
                result = detect_pose(image_base64)
                return self.send_json(HTTPStatus.OK, result)

            if path == "/api/face-detect":
                image_base64 = payload.get("image", "")
                if not image_base64:
                    return self.send_error_json(HTTPStatus.BAD_REQUEST, "image is required")
                result = detect_face(image_base64)
                return self.send_json(HTTPStatus.OK, result)

            return self.send_error_json(HTTPStatus.NOT_FOUND, "not found")

        except ValueError as exc:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def log_message(self, format, *args):
        print(f"[AI] {args[0]}")


def main():
    init_models()
    server = ThreadingHTTPServer((HOST, PORT), AIRequestHandler)
    print(f"[AI] 小程序 AI 推理服务启动: http://{HOST}:{PORT}")
    print(f"[AI] 姿态检测: POST /api/pose-detect")
    print(f"[AI] 人脸检测: POST /api/face-detect")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[AI] 服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()