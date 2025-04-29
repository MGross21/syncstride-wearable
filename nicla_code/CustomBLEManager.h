#pragma once
#include <Arduino.h>
#include <ArduinoBLE.h>
#include "SensorInterface.h"

class CustomBLEManager {
public:
  CustomBLEManager(SensorInterface& sensorRef, float& idleRef, float& fwdRef, float& backRef);
  void begin();
  void update();

private:
  static void onCalibCommand(BLEDevice central, BLECharacteristic characteristic);
  static CustomBLEManager* instance;

  SensorInterface& sensor;
  float& idlePitch;
  float& forwardPitch;
  float& backwardPitch;

  BLEService service;
  BLECharacteristic pitchChar;
  BLECharacteristic calibChar;

  unsigned long lastPrint = 0;
};
