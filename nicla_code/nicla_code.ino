#include <Arduino_BHY2.h>
#include "Nicla_System.h"

// === Configuration ===
const int PinOutput = 4;
const int ForwardSwingThresh = 45;
const int BackswingThresh = -ForwardSwingThresh;
const int Pos1UpperThresh = 5;
const int Pos1LowerThresh = -5;

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

  pinMode(PinOutput, OUTPUT);
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
  int pitch = (abs(sinp) >= 1) ? copysign(90.0f, sinp) : asin(sinp) * 180.0f / PI;

  // Output pitch over Serial
  Serial.print("Pitch (Y): ");
  Serial.print(pitch);
  Serial.println("°");

  // Determine LED color based on pitch
  if (pitch > ForwardSwingThresh || pitch < BackswingThresh) {
    nicla::leds.setColor(green);  // Swing detected
  } else if (pitch > Pos1LowerThresh && pitch < Pos1UpperThresh) {
    nicla::leds.setColor(blue); // Stationary
  } else {
    nicla::leds.setColor(red);   // Transition zone
  }

  delay(100);  // Update interval
}