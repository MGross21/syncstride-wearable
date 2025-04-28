// -------------------- INCLUDES --------------------
#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>

// -------------------- BLE UUIDs --------------------
#define UUID_PREFIX "12345678-"
#define UUID_SUFFIX "-1000-8000-00805f9b34fb"
#define PITCH_SERVICE_UUID        UUID_PREFIX "0000" UUID_SUFFIX
#define PITCH_CHARACTERISTIC_UUID UUID_PREFIX "0001" UUID_SUFFIX
#define CALIB_COMMAND_UUID        UUID_PREFIX "0003" UUID_SUFFIX

// -------------------- HAPTIC MOTOR SETTINGS --------------------
#define HAPTIC_MOTOR            11
#define HAPTIC_MOTOR_STRENGTH   255
#define HAPTIC_MOTOR_DURATION   100 // milliseconds
#define HAPTIC_MOTOR_OFF_DELAY  200 // milliseconds

// -------------------- BUZZER SETTINGS --------------------
#define BUZZER                  10
#define BUZZER_DURATION         100 // milliseconds
#define BUZZER_FREQUENCY        1000 // Hz

// -------------------- DEBUG SETTINGS --------------------
#define DEBUG_MODE              0 // Set to 1 for debug mode, 0 for production
#define PRINT_INTERVAL          500 // milliseconds

// -------------------- BLE SERVICE AND CHARACTERISTICS --------------------
BLEService pitchService(PITCH_SERVICE_UUID);
BLECharacteristic pitchCharacteristic(PITCH_CHARACTERISTIC_UUID, BLERead | BLENotify, sizeof(float) * 4);
BLECharacteristic calibCommandCharacteristic(CALIB_COMMAND_UUID, BLEWrite, 1);

// -------------------- SENSOR SETTINGS --------------------
SensorQuaternion quaternion(SENSOR_ID_RV);
float idlePitch = 0;
float forwardSwingPitch = 25;
float backwardSwingPitch = -25;

// -------------------- GLOBAL VARIABLES --------------------
unsigned long lastPrintTime = 0;
unsigned long lastTriggerTime = 0;
int state = 0;
bool motorOn = false;
bool buzzerOn = false;

// -------------------- SETUP FUNCTION --------------------
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
  calibCommandCharacteristic.setEventHandler(BLEWritten, onCalibCommandReceived);
  BLE.addService(pitchService);
  BLE.advertise();
  Serial.println("BLE advertising...");

  pinMode(HAPTIC_MOTOR, OUTPUT);
  pinMode(BUZZER, OUTPUT);
}

// -------------------- MAIN LOOP --------------------
void loop() {
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("Connected to: ");
    Serial.println(central.address().c_str());

    while (central.connected()) {
      BHY2.update();
      float pitch = computePitch();

      hapticFeedback(pitch);

      if (pitchCharacteristic.subscribed()) {
        float data[4] = { pitch, forwardSwingPitch, backwardSwingPitch, (float)millis() };
        pitchCharacteristic.writeValue((uint8_t*)data, sizeof(data));
      }
      if (DEBUG_MODE) {
        debugTelemetry(pitch);
      }
    }

    disconnectDevice(); // Ensure proper disconnection
  }
}

// -------------------- HELPER FUNCTIONS: DEBUG --------------------
void debugTelemetry(float pitch) {
    updateLedColor(pitch);
    Serial.print("Pitch: ");
    Serial.print(pitch, 2);
    Serial.println("°");
}

// -------------------- HELPER FUNCTIONS: COMPUTATION --------------------
float computePitch() {
  float sinp = 2.0f * (quaternion.w() * quaternion.y() - quaternion.z() * quaternion.x());
  return (abs(sinp) >= 1) ? copysign(90.0f, sinp) : asin(sinp) * 180.0f / PI;
}

// -------------------- HELPER FUNCTIONS: HAPTIC FEEDBACK --------------------
void singleMotorTrigger() {
  if (!motorOn) {
    analogWrite(HAPTIC_MOTOR, HAPTIC_MOTOR_STRENGTH);
    motorOn = true;
    lastTriggerTime = millis();
  } else if (millis() - lastTriggerTime >= HAPTIC_MOTOR_DURATION) {
    analogWrite(HAPTIC_MOTOR, 0);
    motorOn = false;
  }
}

void doubleMotorTrigger() {
  switch (state) {
    case 0: // Turn on the motor
      analogWrite(HAPTIC_MOTOR, HAPTIC_MOTOR_STRENGTH);
      state = 1;
      lastTriggerTime = millis();
      break;
    case 1: // Turn off the motor after a delay
      if (millis() - lastTriggerTime >= HAPTIC_MOTOR_DURATION) {
        analogWrite(HAPTIC_MOTOR, 0);
        state = 2;
        lastTriggerTime = millis();
      }
      break;
    case 2: // Turn on the motor again
      if (millis() - lastTriggerTime >= HAPTIC_MOTOR_OFF_DELAY) {
        analogWrite(HAPTIC_MOTOR, HAPTIC_MOTOR_STRENGTH);
        state = 3;
        lastTriggerTime = millis();
      }
      break;
    case 3: // Turn off the motor after a delay
      if (millis() - lastTriggerTime >= HAPTIC_MOTOR_DURATION) {
        analogWrite(HAPTIC_MOTOR, 0);
        state = 0;
      }
      break;
  }
}

void buzzerTrigger() {
  if (!buzzerOn) {
    tone(BUZZER, BUZZER_FREQUENCY);
    buzzerOn = true;
    lastTriggerTime = millis();
  } else if (millis() - lastTriggerTime >= BUZZER_DURATION) {
    noTone(BUZZER);
    buzzerOn = false;
  }
}

void hapticFeedback(float pitch) {
  if (pitch >= forwardSwingPitch || pitch <= backwardSwingPitch) {
    doubleMotorTrigger();
  } else {
    hapticOff();
  }
}

void hapticOff() {
  analogWrite(HAPTIC_MOTOR, 0);
  noTone(BUZZER);
  motorOn = false;
  buzzerOn = false;
  state = 0; // Reset state for doubleMotorTrigger
}

// -------------------- HELPER FUNCTIONS: LED CONTROL --------------------
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

// -------------------- HELPER FUNCTIONS: BLE COMMANDS --------------------
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

void disconnectDevice() {
  BLEDevice central = BLE.central();
  if (central) {
    central.disconnect();
    Serial.println("Device disconnected.");
    nicla::leds.setColor(red);
  }
}