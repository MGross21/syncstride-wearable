#include "Nicla_System.h"
#include "Arduino_BHY2.h"
#include <ArduinoBLE.h>

#include "SensorInterface.h"
#include "HapticController.h"
#include "CustomBLEManager.h"

// Global instances
SensorInterface sensor;
HapticController haptics;
float idlePitch = 0;
float forwardPitch = 45.0f;
float backwardPitch = -45.0f;
CustomBLEManager ble(sensor, idlePitch, forwardPitch, backwardPitch);

void setup() {
  Serial.begin(115200);
  nicla::begin();
  nicla::leds.begin();
  sensor.begin();
  haptics.begin();
  ble.begin();
}

void loop() {
  BLEDevice central = BLE.central();
  if (!central) return;

  Serial.print("Connected to: ");
  Serial.println(central.address().c_str());

  while (central.connected()) {
    BHY2.update();
    float pitch = sensor.getPitch();

    if (pitch >= forwardPitch)
      haptics.trigger(HapticPattern::Single);
    else if (pitch <= backwardPitch)
      haptics.trigger(HapticPattern::Double);

    haptics.update();
    ble.update();
  }

  central.disconnect();
  Serial.println("Device disconnected.");
}