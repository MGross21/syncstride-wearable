#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>

// -------------------- Constants --------------------
constexpr int HAPTIC_PIN = 11;
constexpr int HAPTIC_STRENGTH = 255;
constexpr int HAPTIC_DURATION = 100;
constexpr int HAPTIC_PAUSE = 200;

constexpr int BUZZER_PIN = 10;
constexpr int BUZZER_FREQ = 1000;
constexpr int BUZZER_DURATION = 100;

constexpr float DEFAULT_FORWARD_PITCH = 45.0f;
constexpr float DEFAULT_BACKWARD_PITCH = -45.0f;
constexpr float CALIB_TOLERANCE = 5.0f;

constexpr char PITCH_SERVICE_UUID[] = "12345678-0000-1000-8000-00805f9b34fb";
constexpr char PITCH_CHAR_UUID[]    = "12345678-0001-1000-8000-00805f9b34fb";
constexpr char CALIB_CHAR_UUID[]    = "12345678-0003-1000-8000-00805f9b34fb";

enum class HapticPattern : uint8_t { None, Single, Double };

// -------------------- Sensor Interface --------------------
class SensorInterface {
public:
  SensorInterface() : quaternion(SENSOR_ID_RV) {}
  
  void begin() {
    BHY2.begin(NICLA_STANDALONE);
    quaternion.begin();
  }

  float getPitch() {
    float sinp = 2.0f * (quaternion.w() * quaternion.y() - quaternion.z() * quaternion.x());
    return abs(sinp) >= 1.0f ? copysign(90.0f, sinp) : asin(sinp) * 180.0f / PI;
  }

private:
  SensorQuaternion quaternion;
};

// -------------------- Haptic Controller --------------------
class HapticController {
public:
  void begin() {
    pinMode(HAPTIC_PIN, OUTPUT);
  }

  void trigger(HapticPattern pattern) {
    if (activePattern == HapticPattern::None) {
      activePattern = pattern;
      state = 0;
      lastTime = millis();
    }
  }

  void update() {
    if (activePattern == HapticPattern::None) return;

    unsigned long now = millis();
    switch (activePattern) {
      case HapticPattern::Single:
        if (state == 0) {
          analogWrite(HAPTIC_PIN, HAPTIC_STRENGTH);
          lastTime = now;
          state = 1;
        } else if (now - lastTime >= HAPTIC_DURATION) {
          analogWrite(HAPTIC_PIN, 0);
          activePattern = HapticPattern::None;
        }
        break;

      case HapticPattern::Double:
        switch (state) {
          case 0:
            analogWrite(HAPTIC_PIN, HAPTIC_STRENGTH);
            lastTime = now;
            state = 1;
            break;
          case 1:
            if (now - lastTime >= HAPTIC_DURATION) {
              analogWrite(HAPTIC_PIN, 0);
              lastTime = now;
              state = 2;
            }
            break;
          case 2:
            if (now - lastTime >= HAPTIC_PAUSE) {
              analogWrite(HAPTIC_PIN, HAPTIC_STRENGTH);
              lastTime = now;
              state = 3;
            }
            break;
          case 3:
            if (now - lastTime >= HAPTIC_DURATION) {
              analogWrite(HAPTIC_PIN, 0);
              activePattern = HapticPattern::None;
            }
            break;
        }
        break;

      default:
        analogWrite(HAPTIC_PIN, 0);
        activePattern = HapticPattern::None;
        break;
    }
  }

private:
  HapticPattern activePattern = HapticPattern::None;
  int state = 0;
  unsigned long lastTime = 0;
};

// -------------------- BLE Manager --------------------
class CustomBLEManager {
public:
  CustomBLEManager(SensorInterface& sensorRef, float& idleRef, float& fwdRef, float& backRef)
    : sensor(sensorRef), idlePitch(idleRef), forwardPitch(fwdRef), backwardPitch(backRef) {}

  void begin() {
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

    CustomBLEManager::instance = this;
    Serial.println("BLE advertising...");
  }

  void update() {
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

  static void onCalibCommand(BLEDevice, BLECharacteristic characteristic) {
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

private:
  SensorInterface& sensor;
  float& idlePitch;
  float& forwardPitch;
  float& backwardPitch;

  BLEService service = BLEService(PITCH_SERVICE_UUID);
  BLECharacteristic pitchChar = BLECharacteristic(PITCH_CHAR_UUID, BLERead | BLENotify, sizeof(float) * 4);
  BLECharacteristic calibChar = BLECharacteristic(CALIB_CHAR_UUID, BLEWrite, 1);
  unsigned long lastPrint = 0;

  static CustomBLEManager* instance;
};

CustomBLEManager* CustomBLEManager::instance = nullptr;

// -------------------- Globals --------------------
SensorInterface sensor;
HapticController haptics;
float idlePitch = 0;
float forwardPitch = DEFAULT_FORWARD_PITCH;
float backwardPitch = DEFAULT_BACKWARD_PITCH;
CustomBLEManager ble(sensor, idlePitch, forwardPitch, backwardPitch);

// -------------------- Setup --------------------
void setup() {
  Serial.begin(115200);
  nicla::begin();
  nicla::leds.begin();
  sensor.begin();
  haptics.begin();
  ble.begin();
}

// -------------------- Loop --------------------
void loop() {
  BLEDevice central = BLE.central();
  if (!central) return;

  Serial.print("Connected to: ");
  Serial.println(central.address().c_str());

  while (central.connected()) {
    BHY2.update();
    float pitch = sensor.getPitch();

    if (pitch >= forwardPitch) {
      haptics.trigger(HapticPattern::Single);
    } else if (pitch <= backwardPitch) {
      haptics.trigger(HapticPattern::Double);
    }

    haptics.update();
    ble.update();
  }

  central.disconnect();
  Serial.println("Device disconnected.");
}
