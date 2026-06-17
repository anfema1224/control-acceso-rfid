#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

constexpr uint8_t SS_PIN = 5;
constexpr uint8_t RST_PIN = 22;
constexpr uint8_t RELAY_PIN = 27;
constexpr uint32_t OPEN_TIME_MS = 3000;

const char* WIFI_SSID = "NOMBRE_WIFI";
const char* WIFI_PASSWORD = "CLAVE_WIFI";
const char* SERVER_URL = "http://192.168.1.50:3000/api/access";
const char* DEVICE_NAME = "Puerta principal";

MFRC522 rfid(SS_PIN, RST_PIN);

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP del ESP32: ");
  Serial.println(WiFi.localIP());
}

String readUid() {
  String uid;
  for (byte index = 0; index < rfid.uid.size; index++) {
    if (rfid.uid.uidByte[index] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[index], HEX);
  }
  uid.toUpperCase();
  return uid;
}

bool requestAccess(const String& uid, String& personName) {
  if (WiFi.status() != WL_CONNECTED) connectWifi();

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  JsonDocument request;
  request["uid"] = uid;
  request["device"] = DEVICE_NAME;
  String payload;
  serializeJson(request, payload);

  int statusCode = http.POST(payload);
  if (statusCode != HTTP_CODE_OK) {
    Serial.printf("Error HTTP: %d\n", statusCode);
    http.end();
    return false;
  }

  JsonDocument response;
  DeserializationError error = deserializeJson(response, http.getString());
  http.end();
  if (error) {
    Serial.println("Respuesta JSON invalida");
    return false;
  }

  personName = response["name"] | "Desconocido";
  return response["allowed"] | false;
}

void openDoor() {
  digitalWrite(RELAY_PIN, HIGH);
  delay(OPEN_TIME_MS);
  digitalWrite(RELAY_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  SPI.begin();
  rfid.PCD_Init();
  connectWifi();
  Serial.println("Acerque una tarjeta al RC522");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  String uid = readUid();
  String personName;
  Serial.println("UID: " + uid);

  if (requestAccess(uid, personName)) {
    Serial.println("Acceso permitido: " + personName);
    openDoor();
  } else {
    Serial.println("Acceso denegado: " + personName);
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1200);
}

