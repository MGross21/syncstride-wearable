#include "SensorInterface.h"

SensorInterface::SensorInterface()
  : quaternion(SENSOR_ID_RV) {}

void SensorInterface::begin() {
  BHY2.begin(NICLA_STANDALONE);
  quaternion.begin();
}

float SensorInterface::getPitch() {
  float sinp = 2.0f * (quaternion.w() * quaternion.y() - quaternion.z() * quaternion.x());
  return abs(sinp) >= 1.0f ? copysign(90.0f, sinp) : asin(sinp) * 180.0f / PI;
}