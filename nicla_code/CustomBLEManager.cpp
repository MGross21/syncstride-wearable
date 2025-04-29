#include "CustomBLEManager.h"

constexpr char PITCH_SERVICE_UUID[] = "12345678-0000-1000-8000-00805f9b34fb";
constexpr char PITCH_CHAR_UUID[]    = "12345678-0001-1000-8000-00805f9b34fb";
constexpr char CALIB_CHAR_UUID[]    = "12345678-0003-1000-8000-00805f9b34fb";

CustomBLEManager* CustomBLEManager::instance = nullptr;

CustomBLEManager::CustomBLEManager(SensorInterface& sensorRef, float& idleRef, float& fwdRef, float& backRef)
  : sensor(sensorRef),
    idlePitch(idleRef),
    forwardPitch(fwdRef),
    backwardPitch(backRef),
    service(PITCH_SERVICE_UUID),
    pitchChar(PITCH_CHAR_UUID, BLERead | BLENotify, sizeof(float) * 4),
    calibChar(CALIB_CHAR_UUID, BLEWrite, 1) {}

void CustomBLEManager::begin() {
  if (!BLE.begin()) {
    Serial.println("BLE init failed");
    while (1);
  }

  BLE.setLocalName("SyncStride");
  BLE.setAdvertisedService(service);
  service.addCharacteristic(pitchChar);
  service.addCharacteristic(calibChar);
  calibChar.setEventHandler(BLEWritten, onCalibCommand);
  BLE.addService(service);
  BLE.advertise();

  instance = this;
  Serial.println("BLE advertising...");
}

void CustomBLEManager::update() {
  float pitch = sensor.getPitch();

  if (pitchChar.subscribed()) {
    float data[4] = { pitch, forwardPitch, backwardPitch, static_cast<float>(millis()) };
    pitchChar.writeValue(reinterpret_cast<uint8_t*>(data), sizeof(data));
  }

  if (millis() - lastPrint > 500) {
    Serial.print("Pitch: ");
    Serial.println(pitch, 2);
    lastPrint = millis();
  }
}

void CustomBLEManager::onCalibCommand(BLEDevice, BLECharacteristic characteristic) {
  if (!instance || characteristic.valueLength() < 1) return;
  byte command = characteristic.value()[0];
  float pitch = instance->sensor.getPitch();

  switch (command) {
    case 1: instance->idlePitch = pitch; Serial.println("Calibrated idle"); break;
    case 2: instance->forwardPitch = pitch; Serial.println("Calibrated forward"); break;
    case 3: instance->backwardPitch = pitch; Serial.println("Calibrated backward"); break;
    default: Serial.println("Invalid calibration command"); break;
  }
}