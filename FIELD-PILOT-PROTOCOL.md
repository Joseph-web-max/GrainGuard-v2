# GrainGuard — First Field Pilot Protocol

## Objective
Determine whether continuous temperature, ambient humidity and headspace CO2 trends provide useful early warnings for investigation and storage management. This is a monitoring study, not a food-safety certification study.

## Pilot design
1. Select one safely accessible grain store and obtain owner/operator permission.
2. Record crop, variety, storage structure, approximate batch mass, storage date and known drying/storage history.
3. Install the ESP32 in a protected enclosure.
4. Place SHT31 away from direct sun, rain and fan discharge.
5. Place DS18B20 at a recorded grain depth/location. Use multiple probes if possible.
6. Place SCD40 in a protected headspace chamber; document location and airflow.
7. Measure grain moisture independently with a crop-calibrated meter or lab method; record moisture basis.
8. Collect baseline readings and inspect daily during commissioning.
9. Compare temperature and humidity against reference instruments at scheduled intervals.
10. Investigate abnormal trends with a qualified operator and document findings.

## Outcomes
- Data completeness and device uptime
- Sensor maintenance events
- Temperature agreement against reference thermometer
- RH agreement against reference method
- CO2 trend repeatability and response to known events
- Spatial temperature differences where multiple probes are installed
- Alerts investigated and proportion judged useful
- False alerts, missed events and time-to-detection

## Ventilation decision validation
Do not automate fans in this pilot. Before any future recommendation, obtain a reviewed crop-specific EMC table, measure grain moisture independently, record outside-air temperature/RH and compare predicted equilibrium moisture against the target. A qualified grain-storage specialist must review the rule and fail-safe behaviour.

## Stop conditions
Stop and inspect for condensation, electrical damage, abnormal heating, loose wiring, dust ingress, implausible readings, repeated resets or unsafe conditions. Do not enter confined storage spaces without appropriate professional procedures.
