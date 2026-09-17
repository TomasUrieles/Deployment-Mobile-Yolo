# Deployment-Mobile-Yolo

Detección y reconocimiento de **placas vehiculares** usando un modelo **YOLOv8** (entrenado por transferencia de aprendizaje) y **EasyOCR**, con:

- **Backend** en **FastAPI** desplegado en **AWS EC2** (servicio `systemd`).
- **App móvil** en **React Native (Expo)** que toma la foto con la cámara, la envía al servidor y **anuncia la placa detectada en voz alta**.

![Demo](imagenes/carroprueba.JPG)

---

## Arquitectura

```
                 ┌─────────────────────────────┐
  [Expo Go]      │        AWS EC2 (Ubuntu)     │
  ┌──────────┐   │   FastAPI (uvicorn :8080)   │
  │  Cámara  │ ─▶│      YOLOv8 + EasyOCR       │
  │ expo-    │   │        (best.pt)            │
  │ speech   │ ◀─│  JSON  {placas:[...],...}   │
  └──────────┘   └─────────────────────────────┘
```

1. La app captura la foto con `expo-camera` y la convierte a `base64`.
2. La envía como **JSON** a `POST http://<IP>:8080/predict_json/`.
3. El servidor corre YOLOv8 para detectar la placa y EasyOCR para leer los caracteres.
4. Devuelve `{ placas: [...], image: <base64> }` y la app **muestra la placa y la lee en voz alta** (español).

---

## Estructura del proyecto

```
Deployment-Mobile-Yolo/
├── snippet/                  # Código fuente del backend
│   ├── app.py                # API FastAPI (predict + predict_json)
│   └── test_backend.py       # Prueba rápida del endpoint
├── modelo/
│   └── best.pt               # Pesos del modelo YOLOv8
├── imagenes/                 # Capturas del despliegue en AWS
├── DetectorPlacas/           # App móvil (Expo SDK 57)
│   ├── App.tsx               # Pantalla principal (cámara + envío + voz)
│   ├── app.json
│   └── package.json
└── README.md
```

---

## 1. Backend (FastAPI)

### Dependencias (Python 3.10+)

- `fastapi`, `uvicorn`
- `ultralytics` (YOLOv8)
- `easyocr`, `opencv-python-headless`, `numpy`
- `python-multipart`
- `torch` / `torchvision`

### Ejecutar localmente

```bash
cd backend                # o donde esté app.py
python -m venv venv
venv\Scripts\activate     # Windows | source venv/bin/activate (Linux/Mac)
pip install fastapi uvicorn ultralytics easyocr opencv-python-headless python-multipart
export MODEL_PATH=best.pt # variable opcional
python app.py             # escucha en 0.0.0.0:8080
```

### Variables de entorno

| Variable        | Default   | Descripción                          |
|-----------------|-----------|--------------------------------------|
| `PORT`          | `8080`    | Puerto del servidor                  |
| `MODEL_PATH`    | `best.pt` | Ruta de los pesos del modelo         |
| `OCR_LANGS`     | `en`      | Idiomas de EasyOCR (coma separados)  |
| `CONF_THRESH`   | `0.25`    | Umbral de confianza de YOLO          |
| `MAX_PART_SIZE` | `15 MB`   | Límite por campo de formulario       |

### Desplegar en AWS EC2

1. Lanza una instancia EC2 **Ubuntu** (t2.large o superior por RAM del modelo) y abre el **puerto 8080/TCP** en su *Security Group* (necesario para que el celular llegue por Internet).
2. Copia el código y el modelo al servidor:
   ```bash
   scp -i tu.pem app.py best.pt ubuntu@<IP>:/home/ubuntu/proyecto/
   ```
3. Crea el entorno virtual e instala dependencias (versión *CPU*, suficiente para inferencia):
   ```bash
   ssh -i tu.pem ubuntu@<IP>
   cd /home/ubuntu/proyecto
   python3 -m venv venv
   venv/bin/pip install fastapi uvicorn ultralytics easyocr opencv-python-headless python-multipart
   ```
4. Crea el servicio `systemd` (`/etc/systemd/system/yolo-plates.service`):
   ```ini
   [Unit]
   Description=YOLOv8 Plate Detector (FastAPI)
   After=network.target

   [Service]
   WorkingDirectory=/home/ubuntu/proyecto
   Environment=PORT=8080
   Environment=MODEL_PATH=/home/ubuntu/proyecto/best.pt
   ExecStart=/home/ubuntu/proyecto/venv/bin/python /home/ubuntu/proyecto/app.py
   Restart=always
   User=ubuntu

   [Install]
   WantedBy=multi-user.target
   ```
5. Actívalo y arráncalo:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now yolo-plates
   sudo systemctl status yolo-plates
   ```

---

## 2. API

### `GET /`

```bash
curl http://3.94.64.78:8080/
# {"message": "YOLOv8 + OCR server running"}
```

### `POST /predict/` — multipart o form-urlencoded

```bash
# Por archivo (multipart)
curl -X POST http://IP:8080/predict/ -F "file=@foto.jpg"

# Por base64 (form-urlencoded)
curl -X POST http://IP:8080/predict/ \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "image_base64=TU9JTw..."
```

### `POST /predict_json/` — JSON (usado por la app)

```bash
curl -X POST http://IP:8080/predict_json/ \
     -H "Content-Type: application/json" \
     -d '{"image_base64":"TU9JTw..."}'
```

Respuesta:

```json
{
  "success": true,
  "placas": ["JNU540"],
  "num_placas": 1,
  "image": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "message": "OK"
}
```

> El campo `image` es la imagen anotada (cajas + texto OCR) en base64 JPEG.
> El campo `image_base64` acepta también el prefijo `data:image/jpeg;base64,...`.

---

## 3. App móvil (Expo)

### Requisitos

- **Node.js** 20+ y **Expo SDK 57**.
- **Expo Go** instalado en el celular (el proyecto usa `expo ~57`).

### Ejecutar

```bash
cd DetectorPlacas
npm install
npx expo start -c
```

- Conecta la PC y el celular a la **misma red Wi-Fi**.
- Escanea el **QR** que muestra la terminal (modo LAN) con Expo Go.
- En la app puedes **editar la IP y el puerto** del servidor (por defecto `3.94.64.78:8080`).

### Cómo funciona la app

1. Pide permiso de cámara.
2. `takePictureAsync({ base64: true, quality: 0.7 })` captura la imagen.
3. Envía `POST /predict_json/` con el base64 en el cuerpo JSON.
4. Muestra la placa detectada y la lee con `expo-speech` (`es-ES`).

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `400 Field exceeded maximum size of 1024KB` | Límite por campo; ya está ampliado a 15 MB (env `MAX_PART_SIZE`). Preferir `/predict_json/` (JSON no aplica ese límite). |
| Expo Go no abre el proyecto (timeout) | Mismo Wi-Fi + **Windows Firewall**: eliminar las reglas de bloqueo de `node.exe` y abrir `8081/TCP` (ver `DetectorPlacas/fix-firewall.cmd`, ejecutar como administrador). |
| `You are trying to open the project as "usuario"...` | El celular está logueado en Expo Go pero la CLI no. Ejecutar `npx expo login` o cerrar sesión en Expo Go. |
| El QR apunta a una IP vieja | Reiniciar Metro: `Ctrl+C` y `npx expo start -c` para regenerar el QR con la IP actual. |
| El celular no alcanza el backend | Abrir `8080/TCP` en el Security Group de EC2. |

---

## Créditos

Proyecto basado en [adiacla/Deployment-Mobile-Yolo](https://github.com/adiacla/Deployment-Mobile-Yolo). El entrenamiento del modelo y el enunciado original pertenecen a su autor.