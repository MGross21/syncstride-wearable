#include "HapticController.h"

constexpr int HAPTIC_PIN = 11;
constexpr int HAPTIC_STRENGTH = 255;
constexpr int HAPTIC_DURATION = 100;
constexpr int HAPTIC_PAUSE = 200;

void HapticController::begin() {
  pinMode(HAPTIC_PIN, OUTPUT);
}

void HapticController::trigger(HapticPattern pattern) {
  if (activePattern == HapticPattern::None) {
    activePattern = pattern;
    state = 0;
    lastTime = millis();
  }
}

void HapticController::update() {
  if (activePattern == HapticPattern::None) return;

  unsigned long now = millis();
  switch (activePattern) {
    case HapticPattern::Single:
      if (state == 0) {
        analogWrite(HAPTIC_PIN, HAPTIC_STRENGTH);
        state = 1;
        lastTime = now;
      } else if (now - lastTime >= HAPTIC_DURATION) {
        analogWrite(HAPTIC_PIN, 0);
        activePattern = HapticPattern::None;
      }
      break;

    case HapticPattern::Double:
      switch (state) {
        case 0:
          analogWrite(HAPTIC_PIN, HAPTIC_STRENGTH);
          state = 1;
          lastTime = now;
          break;
        case 1:
          if (now - lastTime >= HAPTIC_DURATION) {
            analogWrite(HAPTIC_PIN, 0);
            state = 2;
            lastTime = now;
          }
          break;
        case 2:
          if (now - lastTime >= HAPTIC_PAUSE) {
            analogWrite(HAPTIC_PIN, HAPTIC_STRENGTH);
            state = 3;
            lastTime = now;
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
