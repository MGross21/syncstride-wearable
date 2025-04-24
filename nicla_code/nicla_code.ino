#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>

// BLE UUIDs
#define UUID_PREFIX "12345678-"
#define UUID_SUFFIX "-1000-8000-00805f9b34fb"
#define PITCH_SERVICE_UUID        UUID_PREFIX "0000" UUID_SUFFIX
#define PITCH_CHARACTERISTIC_UUID UUID_PREFIX "0001" UUID_SUFFIX
#define CALIB_COMMAND_UUID        UUID_PREFIX "0003" UUID_SUFFIX
#define FRONT_SWING_UUID          UUID_PREFIX "0004" UUID_SUFFIX
#define BACK_SWING_UUID           UUID_PREFIX "0005" UUID_SUFFIX
#define BATTERY_UUID              UUID_PREFIX "0006" UUID_SUFFIX

#define BATTERY_PIN A1

BLEService pitchService(PITCH_SERVICE_UUID);
BLEFloatCharacteristic pitchCharacteristic(PITCH_CHARACTERISTIC_UUID, BLERead | BLENotify);
BLECharacteristic calibCommandCharacteristic(CALIB_COMMAND_UUID, BLEWrite, 1);
BLEFloatCharacteristic frontSwingCharacteristic(FRONT_SWING_UUID, BLERead);
BLEFloatCharacteristic backSwingCharacteristic(BACK_SWING_UUID, BLERead);
BLEFloatCharacteristic batteryCharacteristic(BATTERY_UUID, BLERead);

SensorQuaternion quaternion(SENSOR_ID_RV);
float idlePitch = 0;
float forwardSwingPitch = 45;
float backwardSwingPitch = -45;

const int PRINT_INTERVAL = 100;
unsigned long lastPrintTime = 0;

void setup() {
  Serial.begin(115200);
  nicla::begin();
  nicla::leds.begin();
  BHY2.begin(NICLA_STANDALONE);
  quaternion.begin();

  if (!BLE.begin()) {
    Serial.println("BLE init failed!");
    while (1);
  }

  BLE.setLocalName("SyncStride");
  BLE.setAdvertisedService(pitchService);
  pitchService.addCharacteristic(pitchCharacteristic);
  pitchService.addCharacteristic(calibCommandCharacteristic);
  pitchService.addCharacteristic(frontSwingCharacteristic);
  pitchService.addCharacteristic(backSwingCharacteristic);
  pitchService.addCharacteristic(batteryCharacteristic);
  calibCommandCharacteristic.setEventHandler(BLEWritten, onCalibCommandReceived);
  BLE.addService(pitchService);
  BLE.advertise();

  pinMode(BATTERY_PIN, INPUT);
  Serial.println("BLE advertising...");
}

void writeCharacteristicIfSubscribed(BLEFloatCharacteristic &characteristic, float value) {
  if (characteristic.subscribed()) {
    characteristic.writeValue(value);
  }
}

void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to: ");
    Serial.println(central.address());

    while (central.connected()) {
      BHY2.update();
      float pitch = computePitch();

      writeCharacteristicIfSubscribed(pitchCharacteristic, pitch);
      writeCharacteristicIfSubscribed(frontSwingCharacteristic, forwardSwingPitch);
      writeCharacteristicIfSubscribed(backSwingCharacteristic, backwardSwingPitch);

      int rawValue = analogRead(BATTERY_PIN);
      float voltage = rawValue * (3.3 / 1023.0) * 2;
      int batteryPercentage = calculateBatteryPercentage(voltage);
      writeCharacteristicIfSubscribed(batteryCharacteristic, batteryPercentage);

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

float computePitch() {
  float x = quaternion.x();
  float y = quaternion.y();
  float z = quaternion.z();
  float w = quaternion.w();

  float sinp = 2.0f * (w * y - z * x);
  return (abs(sinp) >= 1) ? (sinp > 0 ? 90.0f : -90.0f) : asin(sinp) * 180.0f / PI;
}

int calculateBatteryPercentage(float voltage) {
  if (voltage >= 4.2) return 100;
  if (voltage >= 4.0) return 90;
  if (voltage >= 3.8) return 70;
  if (voltage >= 3.7) return 50;
  if (voltage >= 3.6) return 30;
  if (voltage >= 3.5) return 15;
  return 5;
}

void updateLedColor(float pitch) {
  if (pitch > forwardSwingPitch) {
    nicla::leds.setColor(green);
  } else if (pitch < backwardSwingPitch) {
    nicla::leds.setColor(green);
  } else if (abs(pitch - idlePitch) < 5) {
    nicla::leds.setColor(blue);
  } else {
    nicla::leds.setColor(yellow);
  }
}

void onCalibCommandReceived(BLEDevice central, BLECharacteristic characteristic) {
  byte command = characteristic.value()[0];
  float currentPitch = computePitch();

  switch (command) {
    case 1:
      idlePitch = currentPitch;
      Serial.println("Calibrated: idle");
      break;
    case 2:
      forwardSwingPitch = currentPitch;
      Serial.println("Calibrated: forward");
      break;
    case 3:
      backwardSwingPitch = currentPitch;
      Serial.println("Calibrated: backward");
      break;
    default:
      Serial.println("Unknown calibration command.");
      return;
  }
}