#include <Nicla_System.h>
#include <Nicla_SenseME.h>

void setup() {
    // Initialize the system
    nicla::begin();
    // Initialize the sensors
    nicla::Sense.begin();
    // Start the serial communication
    Serial.begin(115200);
}

void loop() {
    // Read sensor data
    float temperature = nicla::Sense.readTemperature();
    float humidity = nicla::Sense.readHumidity();
    float pressure = nicla::Sense.readPressure();
    float gas = nicla::Sense.readGas();
    float accelerationX = nicla::Sense.readAccelerationX();
    float accelerationY = nicla::Sense.readAccelerationY();
    float accelerationZ = nicla::Sense.readAccelerationZ();

    // Print sensor data to the serial monitor
    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.println(" °C");

    Serial.print("Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");

    Serial.print("Pressure: ");
    Serial.print(pressure);
    Serial.println(" hPa");

    Serial.print("Gas: ");
    Serial.print(gas);
    Serial.println(" ohms");

    Serial.print("Acceleration X: ");
    Serial.print(accelerationX);
    Serial.println(" m/s^2");

    Serial.print("Acceleration Y: ");
    Serial.print(accelerationY);
    Serial.println(" m/s^2");

    Serial.print("Acceleration Z: ");
    Serial.print(accelerationZ);
    Serial.println(" m/s^2");

    // Wait for a second before reading again
    delay(1000);
}