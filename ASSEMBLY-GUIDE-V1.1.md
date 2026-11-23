# GrainGuard Edge V1.1 — Physical Assembly Guide

## Purpose and limits
This telemetry-only research instrument uses an ESP32, SHT31, SCD40 and DS18B20. It reports storage-air temperature/relative humidity, headspace CO2 and one grain-mass temperature point. It does not measure grain moisture directly, detect aflatoxin, certify food safety or control fans. CO2 is a trend indicator only. One temperature probe cannot represent an entire silo.

## Bill of materials
| Item | Qty | Notes |
|---|---:|---|
| ESP32 DevKit V1 / ESP32-WROOM-32 | 1 | Use a USB data cable |
| SHT31 breakout | 1 | Verify breakout supply range |
| Sensirion SCD40 breakout | 1 | Verify breakout supply range |
| DS18B20 waterproof probe | 1 | Check lead pinout |
| 4.7 kOhm resistor | 1 | DS18B20 DATA pull-up |
| Breadboard/terminal board | 1 | Secure connections |
| Jumper wires | as needed | Keep I2C short |
| USB power bank or 5 V supply | 1 | Power ESP32 through USB |
| Protected enclosure | 1 | Keep electronics away from grain dust |
| Reference thermometer/humidity method | 1 | For validation |
| Calibrated grain moisture meter or lab access | 1 | Moisture is measured separately |

## Wiring

### Shared I2C bus
| ESP32 | SHT31 | SCD40 |
|---|---|---|
| 3V3 | VIN/VCC only if breakout supports 3.3 V | VIN/VCC only if breakout supports 3.3 V |
| GND | GND | GND |
| GPIO21 | SDA | SDA |
| GPIO22 | SCL | SCL |

Common addresses are SHT31 `0x44` and SCD40 `0x62`; confirm the actual breakout with an I2C scanner.

### DS18B20
| Probe lead | Connection |
|---|---|
| VDD (often red) | ESP32 3V3 |
| GND (often black) | ESP32 GND |
| DATA (often yellow/white) | ESP32 GPIO4 |

Install a 4.7 kOhm resistor between DATA and 3V3. Wire colours are not guaranteed; confirm the probe documentation.

## Safe assembly sequence
1. Disconnect USB power.
2. Identify the exact ESP32 board and sensor breakout revisions.
3. Verify each breakout's allowed supply voltage; do not assume every module accepts 5 V.
4. Wire the I2C bus and DS18B20 pull-up.
5. Inspect for shorts, reversed polarity and loose strands.
6. Power the ESP32 through USB only. Do not inject power through USB and another supply rail simultaneously.
7. Run an I2C scanner and confirm sensor addresses.
8. Flash firmware and open Serial Monitor at 115200 baud.
9. Confirm SHT31, SCD40 and DS18B20 boot diagnostics.
10. Confirm JSON telemetry appears approximately every 30 seconds.
11. Compare sensors against appropriate reference methods before relying on data.

## Sensor placement
- SHT31: shaded, ventilated storage-air location away from direct sun, rain and fan discharge.
- DS18B20: documented depth/location in grain. Use multiple probes for a meaningful store pilot.
- SCD40: protected headspace chamber; avoid dust and condensation. It is not a toxin detector.
- Keep controller and exposed electrical connections away from combustible grain dust and moving machinery.

## Flashing
Use Arduino IDE on a supported Windows, macOS or Linux computer, or another compatible ESP32 flashing environment. Select the correct board and port; install libraries listed in `README.md`; compile and inspect warnings before flashing. A phone-only workflow depends on a compatible Android flashing app and USB-OTG adapter; this package cannot guarantee that every phone can compile the sketch.

## Acceptance test
- [ ] ESP32 boots without repeated resets.
- [ ] I2C scan finds connected sensors.
- [ ] SHT31 temperature/RH are finite and plausible.
- [ ] SCD40 CO2 becomes available after its initial measurement cycle.
- [ ] DS18B20 returns plausible temperature.
- [ ] JSON contains device ID, uptime and sensor-health fields.
- [ ] Disconnecting a sensor causes a missing value/fault, not a fabricated zero.
- [ ] Website displays live readings and missing values clearly.
- [ ] Grain moisture is recorded separately with crop, method, sample ID and moisture basis.

## Safety and interpretation
Never make a ventilation decision from relative humidity alone. Require a reviewed crop-specific equilibrium-moisture-content (EMC) table, independently measured grain moisture, and outside-air temperature/RH. If essential evidence is missing or outside the validated table's range, abstain from a recommendation.

Do not claim CO2 proves mould, insects, aflatoxin or food safety. Confirm suspected spoilage/mycotoxins using qualified sampling and laboratory methods. Do not use this research prototype to release food.
