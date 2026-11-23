# GrainGuard V1.1 — Purchase and Test Checklist

## Minimum build
- [ ] ESP32 DevKit V1 / ESP32-WROOM-32
- [ ] SHT31 breakout
- [ ] SCD40 breakout
- [ ] DS18B20 waterproof probe
- [ ] 4.7 kOhm resistor
- [ ] USB data cable
- [ ] Breadboard/terminal board and jumper wires
- [ ] Protected enclosure and cable glands
- [ ] Reference thermometer and humidity reference method
- [ ] Calibrated grain moisture meter or laboratory access

## Do not substitute without reviewing firmware/calibration
- Do not replace SCD40 with a generic MQ sensor and call it equivalent.
- Do not replace DS18B20 with a soil probe and label it grain temperature.
- Do not use a generic soil-moisture probe as a grain-moisture meter.
- Do not connect 5 V sensor outputs directly to ESP32 GPIO.
- Do not assume a breakout VIN accepts 5 V; inspect its documentation.

## Commissioning record
Record device ID and firmware version; board variant; sensor make/model/serial; wiring and enclosure revision; calibration/reference method, date and operator; sensor placement/depth; crop, variety, storage type and batch ID; grain moisture result, method and moisture basis; ambient/headspace locations; missing data, faults and maintenance.

## Pilot dataset fields
timestamp_utc, device_id, batch_id, crop, grain_temp_c, ambient_temp_c,
ambient_rh_pct, co2_ppm, grain_moisture_pct, moisture_method,
sensor_health, placement_id, calibration_id, operator_note
