#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>
#include <Preferences.h>

// === BLE Custom UUIDs ===
#define PITCH_SERVICE_UUID        "12345678-0000-1000-8000-00805f9b34fb"
#define PITCH_CHARACTERISTIC_UUID "12345678-0001-1000-8000-00805f9b34fb"
#define CALIB_COMMAND_UUID        "12345678-0003-1000-8000-00805f9b34fb"

// === BLE Setup ===
BLEService pitchService(PITCH_SERVICE_UUID);
BLEFloatCharacteristic pitchCharacteristic(PITCH_CHARACTERISTIC_UUID, BLERead | BLENotify);
BLECharacteristic calibCommandCharacteristic(CALIB_COMMAND_UUID, BLEWrite, 1);

// === Sensor and Calibration Variables ===
SensorQuaternion quaternion(SENSOR_ID_RV);
Preferences prefs;

float idlePitch = 0;
float forwardSwingPitch = 45;
float backwardSwingPitch = -45;

// Tracking calibration state
bool calibratedIdle = false;
bool calibratedForward = false;
bool calibratedBackward = false;

// === Print Control ===
const int PRINT_INTERVAL = 100;
unsigned long lastPrintTime = 0;

void setup() {
  Serial.begin(115200);

  // Initialize Nicla and sensor
  nicla::begin();
  nicla::leds.begin();
  BHY2.begin(NICLA_STANDALONE);
  quaternion.begin();

  // Load from flash or use defaults
  loadCalibration();

  // Setup BLE
  if (!BLE.begin()) {
    Serial.println("BLE init failed!");
    while (1);
  }

  BLE.setLocalName("SyncStride");
  BLE.setAdvertisedService(pitchService);

  pitchService.addCharacteristic(pitchCharacteristic);
  pitchService.addCharacteristic(calibCommandCharacteristic);
  calibCommandCharacteristic.setEventHandler(BLEWritten, onCalibCommandReceived);

  BLE.addService(pitchService);
  BLE.advertise();

  Serial.println("BLE advertising...");
}

void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to: ");
    Serial.println(central.address());

    while (central.connected()) {
      BHY2.update();

      float pitch = computePitch();

      if (pitchCharacteristic.subscribed()) {
        pitchCharacteristic.writeValue(pitch);
      }

      updateLedColor(pitch);

      unsigned long now = millis();
      if (now - lastPrintTime >= PRINT_INTERVAL) {
        Serial.print("Pitch: ");
        Serial.print(pitch);
        Serial.println("°");
        lastPrintTime = now;
      }
    }

    nicla::leds.setColor(red);
    Serial.println("BLE disconnected.");
  }
}

// === Quaternion to Pitch Calculation ===
float computePitch() {
  float x = quaternion.x();
  float y = quaternion.y();
  float z = quaternion.z();
  float w = quaternion.w();

  float sinp = 2.0f * (w * y - z * x);
  float pitch;
  if (abs(sinp) >= 1)
    pitch = (sinp > 0) ? 90.0f : -90.0f;
  else
    pitch = asin(sinp) * 180.0f / PI;

  return pitch;
}

// === LED Feedback ===
void updateLedColor(float pitch) {
  if (pitch > forwardSwingPitch + 10) {
    nicla::leds.setColor(green);
  } else if (pitch < backwardSwingPitch - 10) {
    nicla::leds.setColor(red);
  } else if (abs(pitch - idlePitch) < 5) {
    nicla::leds.setColor(blue);
  } else {
    nicla::leds.setColor(255, 100, 0); // orange
  }
}

// === BLE Command Handler ===
void onCalibCommandReceived(BLEDevice central, BLECharacteristic characteristic) {
  byte command = characteristic.value();
  float currentPitch = computePitch();

  switch (command) {
    case 1:
      idlePitch = currentPitch;
      calibratedIdle = true;
      Serial.println("Calibrated: idle");
      break;
    case 2:
      forwardSwingPitch = currentPitch;
      calibratedForward = true;
      Serial.println("Calibrated: forward");
      break;
    case 3:
      backwardSwingPitch = currentPitch;
      calibratedBackward = true;
      Serial.println("Calibrated: backward");
      break;
    default:
      Serial.println("Unknown calibration command.");
      return;
  }

  // Auto-save if all positions calibrated
  if (calibratedIdle && calibratedForward && calibratedBackward) {
    saveCalibration();
    Serial.println("All positions calibrated. Calibration saved to NVM.");
  }
}

// === Save Calibration to Flash ===
void saveCalibration() {
  prefs.begin("calib", false);
  prefs.putFloat("idle", idlePitch);
  prefs.putFloat("fwd", forwardSwingPitch);
  prefs.putFloat("back", backwardSwingPitch);
  prefs.putBool("hasData", true);  // Mark as valid
  prefs.end();
}

// === Load Calibration or Fallback to Defaults ===
void loadCalibration() {
  prefs.begin("calib", true);
  bool hasData = prefs.getBool("hasData", false);
  if (hasData) {
    idlePitch = prefs.getFloat("idle", 0);
    forwardSwingPitch = prefs.getFloat("fwd", 45);
    backwardSwingPitch = prefs.getFloat("back", -45);
    Serial.println("Loaded calibration from flash.");
  } else {
    idlePitch = 0;
    forwardSwingPitch = 45;
    backwardSwingPitch = -45;
    Serial.println("No saved calibration found. Using defaults.");
  }
  prefs.end();

  Serial.print("Idle Pitch: "); Serial.println(idlePitch);
  Serial.print("Forward Pitch: "); Serial.println(forwardSwingPitch);
  Serial.print("Backward Pitch: "); Serial.println(backwardSwingPitch);
}