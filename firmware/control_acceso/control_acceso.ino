#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>

constexpr uint8_t SS_PIN = 5;
constexpr uint8_t RST_PIN = 4;
constexpr uint8_t RELAY_PIN = 27;
constexpr uint8_t LCD_SDA_PIN = 21;
constexpr uint8_t LCD_SCL_PIN = 22;
constexpr uint8_t LCD_ADDRESS = 0x27;
constexpr uint32_t OPEN_TIME_MS = 3000;

const char* WIFI_SSID = "NOMBRE_WIFI";
const char* WIFI_PASSWORD = "CLAVE_WIFI";
const char* SERVER_URL = "http://192.168.1.50:3000/api/access";
const char* DEVICE_NAME = "Puerta principal";

MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(LCD_ADDRESS, 20, 4);

void showIdle() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CONTROL ACCESO");
  lcd.setCursor(0, 1);
  lcd.print("NUSEFA PEREIRA");
  lcd.setCursor(0, 2);
  lcd.print("Acerque tarjeta");
  lcd.setCursor(0, 3);
  lcd.print("Sistema listo");
}

void printLine(uint8_t row, const String& text) {
  lcd.setCursor(0, row);
  String padded = text.substring(0, 20);
  while (padded.length() < 20) padded += " ";
  lcd.print(padded);
}

String movementLabel(const String& movement) {
  if (movement == "ingreso") return "ENTRA";
  if (movement == "salida") return "SALE";
  return "MOVIMIENTO";
}

void showAccessResult(bool allowed, const String& personName, const String& movement, const String& uid) {
  lcd.clear();
  if (allowed) {
    printLine(0, "ACCESO PERMITIDO");
    printLine(1, movementLabel(movement) + ": " + personName);
    printLine(2, "UID " + uid);
    printLine(3, "Puerta autorizada");
    return;
  }

  printLine(0, "ACCESO DENEGADO");
  printLine(1, personName);
  printLine(2, "UID " + uid);
  printLine(3, "Revise registro");
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  lcd.clear();
  printLine(0, "CONTROL ACCESO");
  printLine(1, "Conectando WiFi");
  printLine(2, WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP del ESP32: ");
  Serial.println(WiFi.localIP());
  printLine(1, "WiFi conectado");
  printLine(2, WiFi.localIP().toString());
  printLine(3, "Servidor listo");
  delay(1200);
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

bool requestAccess(const String& uid, String& personName, String& movement) {
  if (WiFi.status() != WL_CONNECTED) connectWifi();

  printLine(0, "Tarjeta leida");
  printLine(1, uid);
  printLine(2, "Consultando...");
  printLine(3, "Espere");

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
    printLine(2, "Error servidor");
    printLine(3, "HTTP " + String(statusCode));
    http.end();
    return false;
  }

  JsonDocument response;
  DeserializationError error = deserializeJson(response, http.getString());
  http.end();
  if (error) {
    Serial.println("Respuesta JSON invalida");
    printLine(2, "Respuesta invalida");
    printLine(3, "Revise servidor");
    return false;
  }

  personName = response["name"] | "Desconocido";
  movement = response["movement"] | "";
  return response["allowed"] | false;
}

void openDoor(const String& movement) {
  printLine(3, movementLabel(movement) + " - Abriendo");
  digitalWrite(RELAY_PIN, HIGH);
  delay(OPEN_TIME_MS);
  digitalWrite(RELAY_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();
  printLine(0, "CONTROL ACCESO");
  printLine(1, "NUSEFA PEREIRA");
  printLine(2, "Iniciando...");
  printLine(3, "ESP32 + RFID");

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
  String movement;
  Serial.println("UID: " + uid);

  bool allowed = requestAccess(uid, personName, movement);
  showAccessResult(allowed, personName, movement, uid);

  if (allowed) {
    Serial.println("Acceso permitido: " + personName + " - " + movement);
    openDoor(movement);
  } else {
    Serial.println("Acceso denegado: " + personName);
    delay(2500);
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  showIdle();
  delay(800);
}

