#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>

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

  nicla::begin();
  nicla::leds.begin();
  BHY2.begin(NICLA_STANDALONE);
  quaternion.begin();

  idlePitch = 0;
  forwardSwingPitch = 45;
  backwardSwingPitch = -45;

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
        Serial.println("\xC2\xB0");
        lastPrintTime = now;
      }
    }

    nicla::leds.setColor(red);
    Serial.println("BLE disconnected.");
  }
}

float computePitch() {
  float x = quaternion.x();
  float y = quaternion.y();
  float z = quaternion.z();
  float w = quaternion.w();

  float sinp = 2.0f * (w * y - z * x);
  float pitch = (abs(sinp) >= 1) ? (sinp > 0 ? 90.0f : -90.0f) : asin(sinp) * 180.0f / PI;
  return pitch;
}

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

  if (calibratedIdle && calibratedForward && calibratedBackward) {
    Serial.println("All positions calibrated.");
  }
}