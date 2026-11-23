/*
  GrainGuard Edge Node V1.1 — telemetry-only field-pilot firmware
  Board: ESP32 DevKit V1 / ESP32-WROOM-32
  Sensors: SHT31 ambient T/RH, SCD40 headspace CO2, DS18B20 grain-mass temperature
  Transport: USB Serial JSONL + Nordic UART Service BLE notifications

  IMPORTANT:
  - This firmware does NOT control fans, heaters, augers or other actuators.
  - Grain moisture is intentionally null. Use a crop-calibrated grain moisture meter
    and record its result in the GrainGuard web application.
  - CO2 is a trend indicator, not an aflatoxin/mould detector.
  - Calibrate sensors and verify breakout-board voltage requirements before use.
*/

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <SensirionI2cScd4x.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>

#define DEVICE_ID "GG-ESP32-001"
#define I2C_SDA 21
#define I2C_SCL 22
#define DS18B20_PIN 4
#define TELEMETRY_INTERVAL_MS 30000UL
#define SENSOR_RETRY_INTERVAL_MS 60000UL
#define FIRMWARE_VERSION "1.1.0"

static const char *NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char *NUS_RX_UUID      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char *NUS_TX_UUID      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

Adafruit_SHT31 sht31 = Adafruit_SHT31();
SensirionI2cScd4x scd4x;
OneWire oneWire(DS18B20_PIN);
DallasTemperature grainProbe(&oneWire);
NimBLECharacteristic *txCharacteristic = nullptr;
bool shtReady = false;
bool scdStarted = false;
bool dsReady = false;
uint32_t lastTelemetry = 0;
uint32_t lastSensorRetry = 0;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *server, NimBLEConnInfo &info) override {
    // Keep USB Serial output JSONL-only so the browser parser never receives debug text.
  }
  void onDisconnect(NimBLEServer *server, NimBLEConnInfo &info, int reason) override {
    NimBLEDevice::startAdvertising();
  }
};

void sendBleLine(const String &line) {
  if (!txCharacteristic) return;
  // Conservative 20-byte chunks support clients that negotiate the default MTU.
  const size_t chunkSize = 20;
  for (size_t offset = 0; offset < line.length(); offset += chunkSize) {
    const size_t length = min(chunkSize, line.length() - offset);
    txCharacteristic->setValue((uint8_t *)line.c_str() + offset, length);
    txCharacteristic->notify();
    delay(12);
  }
}

void emitJson(JsonDocument &doc) {
  String line;
  serializeJson(doc, line);
  Serial.println(line);
  line += "\n";
  sendBleLine(line);
}

void startBle() {
  NimBLEDevice::init("GrainGuard-Edge-001");
  NimBLEDevice::setMTU(247);
  NimBLEServer *server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  NimBLEService *service = server->createService(NUS_SERVICE_UUID);

  txCharacteristic = service->createCharacteristic(
    NUS_TX_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );
  // RX reserved for a future read-only configuration protocol; no actuation command exists.
  service->createCharacteristic(NUS_RX_UUID, NIMBLE_PROPERTY::WRITE);
  service->start();

  NimBLEAdvertising *advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(NUS_SERVICE_UUID);
  advertising->setName("GrainGuard-Edge-001");
  advertising->start();
}

void retryMissingSensors() {
  if (!shtReady) shtReady = sht31.begin(0x44);

  if (!dsReady) {
    grainProbe.begin();
    dsReady = grainProbe.getDeviceCount() > 0;
  }

  if (!scdStarted) {
    scd4x.begin(Wire, SCD40_I2C_ADDR_62);
    int16_t err = scd4x.stopPeriodicMeasurement();
    (void)err;
    delay(30);
    err = scd4x.startPeriodicMeasurement();
    scdStarted = (err == 0);
  }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Wire.begin(I2C_SDA, I2C_SCL);

  shtReady = sht31.begin(0x44);
  scd4x.begin(Wire, SCD40_I2C_ADDR_62);
  int16_t scdError = scd4x.stopPeriodicMeasurement();
  (void)scdError;
  delay(500);
  scdError = scd4x.startPeriodicMeasurement();
  scdStarted = (scdError == 0);

  grainProbe.begin();
  dsReady = grainProbe.getDeviceCount() > 0;

  startBle();

  // Status packet is valid JSONL on USB Serial and uses the same protocol as readings.
  JsonDocument status;
  status["type"] = "status";
  status["device_id"] = DEVICE_ID;
  status["firmware"] = FIRMWARE_VERSION;
  status["protocol_version"] = "1.1";
  status["message"] = "ready";
  status["sht31_ready"] = shtReady;
  status["scd40_ready"] = scdStarted;
  status["ds18b20_ready"] = dsReady;
  emitJson(status);
}

void loop() {
  const uint32_t now = millis();
  if (now - lastSensorRetry >= SENSOR_RETRY_INTERVAL_MS) {
    lastSensorRetry = now;
    retryMissingSensors();
  }
  if (now - lastTelemetry < TELEMETRY_INTERVAL_MS) {
    delay(40);
    return;
  }
  lastTelemetry = now;

  float ambientTemp = NAN;
  float ambientRh = NAN;
  float grainTemp = NAN;
  uint16_t co2 = 0;
  float scdTemp = NAN;
  float scdRh = NAN;
  bool co2Ready = false;

  if (shtReady) {
    ambientTemp = sht31.readTemperature();
    ambientRh = sht31.readHumidity();
  }

  if (dsReady) {
    grainProbe.requestTemperatures();
    grainTemp = grainProbe.getTempCByIndex(0);
    if (grainTemp <= -100.0f || grainTemp > 100.0f) grainTemp = NAN;
  }

  if (scdStarted) {
    bool dataReady = false;
    int16_t err = scd4x.getDataReadyStatus(dataReady);
    if (err == 0 && dataReady) {
      err = scd4x.readMeasurement(co2, scdTemp, scdRh);
      co2Ready = (err == 0 && co2 >= 250 && co2 <= 40000);
    }
  }

  String sensorHealth = "OK";
  String faults = "";
  if (!shtReady) faults += "SHT31_MISSING;";
  else if (!isfinite(ambientTemp) || !isfinite(ambientRh) || ambientRh < 0 || ambientRh > 100) faults += "SHT31_INVALID_READING;";
  if (!dsReady) faults += "DS18B20_MISSING;";
  else if (!isfinite(grainTemp)) faults += "DS18B20_INVALID_READING;";
  if (!scdStarted) faults += "SCD40_NOT_STARTED;";

  if (faults.length() > 0) sensorHealth = "SENSOR_FAULT:" + faults;
  else if (!co2Ready) sensorHealth = "WARN:SCD40_SAMPLE_NOT_READY";

  JsonDocument doc;
  doc["type"] = "reading";
  doc["protocol_version"] = "1.1";
  doc["firmware"] = FIRMWARE_VERSION;
  doc["device_id"] = DEVICE_ID;
  doc["uptime_ms"] = now;
  doc["sample_interval_s"] = TELEMETRY_INTERVAL_MS / 1000UL;
  if (isfinite(grainTemp)) doc["grain_temp_c"] = grainTemp; else doc["grain_temp_c"] = nullptr;
  if (isfinite(ambientTemp)) doc["ambient_temp_c"] = ambientTemp; else doc["ambient_temp_c"] = nullptr;
  if (isfinite(ambientRh)) doc["ambient_rh_pct"] = ambientRh; else doc["ambient_rh_pct"] = nullptr;
  if (co2Ready) doc["co2_ppm"] = co2; else doc["co2_ppm"] = nullptr;
  doc["grain_moisture_pct"] = nullptr; // Must come from a calibrated grain meter / lab result.
  doc["grain_moisture_status"] = "not_connected";
  doc["sensor_health"] = sensorHealth;
  doc["fan_control"] = "not_implemented_advisory_only";
  if (isfinite(scdTemp)) doc["scd40_temperature_c"] = scdTemp; else doc["scd40_temperature_c"] = nullptr;
  if (isfinite(scdRh)) doc["scd40_relative_humidity_pct"] = scdRh; else doc["scd40_relative_humidity_pct"] = nullptr;

  emitJson(doc);
}
