#include <Arduino_BHY2.h>
#include "Nicla_System.h"

// === Configuration ===
const int OUTPUT_PIN = 4;
const int FORWARD_SWING_THRESH = 45;
const int BACKSWING_THRESH = -FORWARD_SWING_THRESH;
const int POS1_UPPER_THRESH = 5;
const int POS1_LOWER_THRESH = -5;

// === Printout ===
const int PRINT_INTERVAL = 100; // milliseconds
static unsigned long lastPrintTime = 0;

// === Sensor ===
SensorQuaternion quaternion(SENSOR_ID_RV);

void setup() {
  Serial.begin(115200);
  Serial.println("Start");

  // Initialize Nicla board and sensors
  nicla::begin();
  nicla::leds.begin();
  BHY2.begin(NICLA_STANDALONE);
  quaternion.begin();

  pinMode(OUTPUT_PIN, OUTPUT);
}

void loop() {
  BHY2.update();

  // Get quaternion values
  float x = quaternion.x();
  float y = quaternion.y();
  float z = quaternion.z();
  float w = quaternion.w();

  // Calculate pitch angle (Y-axis)
  float sinp = 2.0f * (w * y - z * x);
  int pitch;
  if (abs(sinp) >= 1) {
    pitch = (sinp > 0) ? 90 : -90; // Avoid using `copysign` for efficiency
  } else {
    pitch = asin(sinp) * 180.0f / PI;
  }

  // Print pitch angle at regular intervals
  unsigned long currentTime = millis();
  if (currentTime - lastPrintTime >= PRINT_INTERVAL) {
    Serial.print("Pitch (Y): ");
    Serial.print(pitch);
    Serial.println("°");
    lastPrintTime = currentTime;
  }

  // Update LED color based on pitch
  updateLedColor(pitch);
}

void updateLedColor(int pitch) {
  // Use a single comparison chain for efficiency
  if (pitch > FORWARD_SWING_THRESH) {
    nicla::leds.setColor(green);  // Forward swing detected
  } else if (pitch < BACKSWING_THRESH) {
    nicla::leds.setColor(green);  // Backward swing detected
  } else if (pitch > POS1_LOWER_THRESH && pitch < POS1_UPPER_THRESH) {
    nicla::leds.setColor(blue);   // Stationary
  } else {
    nicla::leds.setColor(red);    // Transition zone
  }
}