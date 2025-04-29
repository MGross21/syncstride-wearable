#pragma once
#include <Arduino.h>
#include "Arduino_BHY2.h"

class SensorInterface {
public:
  SensorInterface();
  void begin();
  float getPitch();

private:
  SensorQuaternion quaternion;
};