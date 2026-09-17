#!/usr/bin/env python3
"""Test de carga del modelo y de la API sin arrancar el servidor."""
import base64
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, "/home/ubuntu/proyecto")
from app import app, model, reader

print("MODELO OK", model.model.names)
print("OCR OK")

client = TestClient(app)
r = client.get("/")
print("GET / ->", r.json())

with open("/home/ubuntu/proyecto/prueba.jpg", "rb") as f:
    resp = client.post("/predict/", files={"file": ("prueba.jpg", f, "image/jpeg")})

data = resp.json()
print("POST /predict/ status:", resp.status_code)
print("placas:", data.get("placas"))
print("message:", data.get("message"))
print("success:", data.get("success"))
if data.get("error"):
    print("ERROR:", data.get("error"))