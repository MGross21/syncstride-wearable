#pragma once
#include <Arduino.h>

enum class HapticPattern : uint8_t { None, Single, Double };

class HapticController {
public:
  void begin();
  void trigger(HapticPattern pattern);
  void update();

private:
  HapticPattern activePattern = HapticPattern::None;
  int state = 0;
  unsigned long lastTime = 0;
};