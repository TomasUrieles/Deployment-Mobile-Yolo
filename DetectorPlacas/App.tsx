import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const DEFAULT_HOST = '3.94.64.78';
const DEFAULT_PORT = '8080';

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [image, setImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [plates, setPlates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const apiUrl = host && port ? `http://${host.trim()}:${port.trim()}` : '';

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  const speak = (message: string) => {
    if (Platform.OS !== 'web') {
      Speech.speak(message, { language: 'es-ES' });
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (!apiUrl) {
      Alert.alert('Error', 'Por favor ingresa la dirección IP del servidor.');
      return;
    }

    try {
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });
      if (!photo?.base64) {
        Alert.alert('Error', 'No se pudo obtener la imagen de la cámara.');
        return;
      }

      setImage(photo.uri);
      setPlates([]);
      setProcessedImage(null);

      const fullUrl = `${apiUrl}/predict_json/`;
      console.log('Enviando imagen base64 a:', fullUrl);

      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ image_base64: photo.base64 }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Error HTTP:', response.status, text);
        Alert.alert('Error HTTP', `Código: ${response.status}`);
        speak('Ocurrió un error al contactar el servidor.');
        return;
      }

      const data = await response.json();
      console.log('Respuesta del servidor:', data);

      if (data?.placas && data.placas.length > 0) {
        const detected: string[] = data.placas;
        setPlates(detected);

        if (data.image) {
          setProcessedImage(`data:image/jpeg;base64,${data.image}`);
        }

        const textToSpeak =
          detected.length === 1
            ? `La placa detectada es ${detected[0].split('').join(' ')}`
            : `Se detectaron ${detected.length} placas: ${detected.join(', ')}`;

        speak(textToSpeak);
      } else if (data?.placas?.length === 0) {
        speak('No se detectaron placas.');
        Alert.alert('Resultado', 'No se detectaron placas.');
        setPlates([]);
        setProcessedImage(null);
      } else if (data?.error) {
        Alert.alert('Error del servidor', data.error);
        speak('Ocurrió un error en el servidor.');
      } else {
        console.warn('Respuesta inesperada:', data);
        Alert.alert('Respuesta inesperada', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error enviando imagen:', error);
      Alert.alert('Error', 'No se pudo conectar al servidor.');
      speak('No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text>Solicitando permisos de cámara...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Se necesita permiso para usar la cámara.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Detector de Placas</Text>

        <Text style={styles.label}>Dirección IP del servidor:</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: 3.94.64.78"
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
        />

        <Text style={styles.label}>Puerto:</Text>
        <TextInput
          style={styles.input}
          placeholder="8080"
          value={port}
          onChangeText={setPort}
          keyboardType="number-pad"
        />

        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        <TouchableOpacity style={styles.button} onPress={handleCapture} disabled={loading}>
          <Text style={styles.buttonText}>Tomar foto</Text>
        </TouchableOpacity>

        {loading && <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />}

        {image && (
          <View style={styles.imageContainer}>
            <Text style={styles.label}>Imagen capturada:</Text>
            <Image source={{ uri: image }} style={styles.image} />
          </View>
        )}

        {processedImage && (
          <View style={styles.imageContainer}>
            <Text style={styles.label}>Imagen procesada por el servidor:</Text>
            <Image source={{ uri: processedImage }} style={styles.image} resizeMode="contain" />
          </View>
        )}

        {plates.length > 0 && (
          <View style={styles.resultContainer}>
            <Text style={styles.label}>Placas detectadas:</Text>
            {plates.map((p, i) => (
              <Text key={i} style={styles.plateText}>
                {p}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
      <StatusBar style="auto" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    padding: 24,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0b3d5c',
    marginBottom: 16,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#333',
    alignSelf: 'flex-start',
    marginLeft: '5%',
  },
  input: {
    width: '90%',
    height: 42,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  button: {
    width: '90%',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  camera: {
    width: '100%',
    height: 400,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  imageContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  image: {
    width: 300,
    height: 200,
    borderRadius: 10,
  },
  resultContainer: {
    marginTop: 20,
    backgroundColor: '#007AFF20',
    padding: 12,
    borderRadius: 8,
    width: '90%',
  },
  plateText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#007AFF',
    textAlign: 'center',
  },
});