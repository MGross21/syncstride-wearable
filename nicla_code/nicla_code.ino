#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>

// === Custom BLE UUIDs ===
#define PITCH_SERVICE_UUID       "12345678-0000-1000-8000-00805f9b34fb"
#define PITCH_CHARACTERISTIC_UUID "12345678-0001-1000-8000-00805f9b34fb"

BLEService pitchService(PITCH_SERVICE_UUID);
BLEFloatCharacteristic pitchCharacteristic(PITCH_CHARACTERISTIC_UUID, BLERead | BLENotify);

// === Sensor ===
SensorQuaternion quaternion(SENSOR_ID_RV);

// === LED Thresholds ===
const int FORWARD_SWING_THRESH = 45;
const int BACKSWING_THRESH = -FORWARD_SWING_THRESH;
const int POS1_UPPER_THRESH = 5;
const int POS1_LOWER_THRESH = -5;

// === Print Control ===
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
  BLE.addService(pitchService);
  BLE.advertise();

  Serial.println("BLE advertising started...");
}

void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to central: ");
    Serial.println(central.address());

    while (central.connected()) {
      BHY2.update();

      float x = quaternion.x();
      float y = quaternion.y();
      float z = quaternion.z();
      float w = quaternion.w();

      float sinp = 2.0f * (w * y - z * x);
      int pitch;
      if (abs(sinp) >= 1)
        pitch = (sinp > 0) ? 90 : -90;
      else
        pitch = asin(sinp) * 180.0f / PI;

      updateLedColor(pitch);

      if (pitchCharacteristic.subscribed()) {
        pitchCharacteristic.writeValue((float)pitch);
      }

      unsigned long now = millis();
      if (now - lastPrintTime >= PRINT_INTERVAL) {
        Serial.print("Pitch (Y): ");
        Serial.print(pitch);
        Serial.println("°");
        lastPrintTime = now;
      }
    }

    nicla::leds.setColor(red);
    Serial.println("Disconnected.");
  }
}

void updateLedColor(int pitch) {
  if (pitch > FORWARD_SWING_THRESH || pitch < BACKSWING_THRESH) {
    nicla::leds.setColor(green);
  } else if (pitch > POS1_LOWER_THRESH && pitch < POS1_UPPER_THRESH) {
    nicla::leds.setColor(blue);
  } else {
    nicla::leds.setColor(red);
  }
}