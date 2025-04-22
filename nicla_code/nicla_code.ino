#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>
#include <EEPROM.h>

// === BLE Custom UUIDs ===
#define PITCH_SERVICE_UUID        "12345678-0000-1000-8000-00805f9b34fb"
#define PITCH_CHARACTERISTIC_UUID "12345678-0001-1000-8000-00805f9b34fb"
#define CALIB_COMMAND_UUID        "12345678-0003-1000-8000-00805f9b34fb"

// === EEPROM Configuration ===
#define EEPROM_SIZE 16
#define ADDR_HAS_DATA 0
#define ADDR_IDLE_PITCH 1
#define ADDR_FORWARD_PITCH 5
#define ADDR_BACKWARD_PITCH 9

// === BLE Setup ===
BLEService pitchService(PITCH_SERVICE_UUID);
BLEFloatCharacteristic pitchCharacteristic(PITCH_CHARACTERISTIC_UUID, BLERead | BLENotify);
BLECharacteristic calibCommandCharacteristic(CALIB_COMMAND_UUID, BLEWrite, 1);

// === Sensor and Calibration Variables ===
SensorQuaternion quaternion(SENSOR_ID_RV);
float idlePitch = 0;
float forwardSwingPitch = 45;
float backwardSwingPitch = -45;

// === Tracking calibration state ===
bool calibratedIdle = false;
bool calibratedForward = false;
bool calibratedBackward = false;

// === Print Control ===
const int PRINT_INTERVAL = 100;
unsigned long lastPrintTime = 0;

void setup() {
  Serial.begin(115200);

  // Initialize Nicla and sensors
  nicla::begin();
  nicla::leds.begin();
  BHY2.begin(NICLA_STANDALONE);
  quaternion.begin();

  // Initialize EEPROM and load calibration
  EEPROM.begin(EEPROM_SIZE);
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

// === Compute Pitch from Quaternion ===
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

// === LED Color Feedback Based on Pitch ===
void updateLedColor(float pitch) {
  if (pitch > forwardSwingPitch + 10) {
    nicla::leds.setColor(green);
  } else if (pitch < backwardSwingPitch - 10) {
    nicla::leds.setColor(red);
  } else if (abs(pitch - idlePitch) < 5) {
    nicla::leds.setColor(blue);
  } else {
    nicla::leds.setColor(255, 100, 0);  // Orange
  }
}

// === Handle Incoming Calibration Commands from BLE Central ===
void onCalibCommandReceived(BLEDevice central, BLECharacteristic characteristic) {
  byte command = characteristic.value()[0];
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

  // If all positions calibrated, save to EEPROM
  if (calibratedIdle && calibratedForward && calibratedBackward) {
    saveCalibration();
    Serial.println("All positions calibrated. Calibration saved to EEPROM.");
  }
}

// === Save Calibration Values to EEPROM ===
void saveCalibration() {
  EEPROM.put(ADDR_IDLE_PITCH, idlePitch);
  EEPROM.put(ADDR_FORWARD_PITCH, forwardSwingPitch);
  EEPROM.put(ADDR_BACKWARD_PITCH, backwardSwingPitch);
  EEPROM.write(ADDR_HAS_DATA, 1);  // Valid marker
  EEPROM.commit();

  Serial.println("Calibration saved to EEPROM.");
}

// === Load Calibration from EEPROM or Use Defaults ===
void loadCalibration() {
  byte hasData = EEPROM.read(ADDR_HAS_DATA);

  if (hasData == 1) {
    EEPROM.get(ADDR_IDLE_PITCH, idlePitch);
    EEPROM.get(ADDR_FORWARD_PITCH, forwardSwingPitch);
    EEPROM.get(ADDR_BACKWARD_PITCH, backwardSwingPitch);
    Serial.println("Loaded calibration from EEPROM.");
  } else {
    idlePitch = 0;
    forwardSwingPitch = 45;
    backwardSwingPitch = -45;
    Serial.println("No saved calibration found. Using defaults.");
  }

  Serial.print("Idle Pitch: "); Serial.println(idlePitch);
  Serial.print("Forward Pitch: "); Serial.println(forwardSwingPitch);
  Serial.print("Backward Pitch: "); Serial.println(backwardSwingPitch);
}