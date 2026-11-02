# SyncStride: Wearable Gait Biofeedback Device

<img src="docs/images/syncstride_logo.png" alt="Logo" width="300">

<img src="docs/images/demo.gif" alt="Live arm swing pitch recording in the SyncStride BLE Recorder" width="640">

[Web console](https://mgross21.github.io/syncstride-wearable/) · [Demo](https://mgross21.github.io/syncstride-wearable/?demo) · [Video](https://mgross21.github.io/syncstride-wearable/assets/demo.mp4)

## Overview

SyncStride is a wrist-mounted wearable designed for individuals with Parkinson’s Disease. It detects asymmetric arm swing in real-time and provides vibrotactile cues to encourage symmetrical gait patterns, helping reduce fall risk and improve mobility.

<a href="docs/poster.png"><img src="pages/assets/poster.jpg" alt="SyncStride research poster" width="800"></a>

## Features

- Real-time IMU-based arm swing detection
- Vibrotactile and auditory feedback for movement correction
- BLE interface with Python GUI for live data and calibration
- Logs motion data to CSV for clinical analysis
- Ergonomic, lightweight, and adjustable for long-term use

## Hardware

- Nicla Sense ME microcontroller
- 6-axis IMU
- Vibration motor
- Rechargeable battery (>4h runtime)
- BLE module

<img src="docs/images/rendered_casing.png" alt="Casing" width="500">

<img src="pages/assets/exploded_view.png" alt="Exploded view of the device" width="500">

<img src="pages/assets/wrist_fit.jpg" alt="Device worn on the wrist" width="800">

| Property | Value |
| --- | --- |
| Dimensions (L × B × H) | 74.6 × 33.6 × 31.65 mm |
| Weight | 66 g |
| Casing | PLA |
| Strap | Nylon sport loop |
| Cost | $110 |

| Schematic | Case Drawing |
| --- | --- |
| <a href="docs/hardware/schematic.pdf"><img src="pages/assets/schematic.png" alt="Schematic" width="400"></a> | <a href="docs/hardware/case_drawing.pdf"><img src="pages/assets/case_drawing.png" alt="Case drawing" width="400"></a> |

## GUI Alerts

- Device connected/disconnected
- Calibration (idle, forward, backward)
- Data saved to CSV
- Real-time pitch plotting

<img src="docs/images/py_gui.png" alt="GUI" width="500">

## Testing Highlights

- Feedback latency: 10 ms hardware, 100 ms GUI
- Detection accuracy: ±5° arm swing
- BLE range: ~12 m (~40 ft)
- Battery life: 4+ hrs
- Comfortable for extended wear

## Documents

- [Research poster](docs/poster.png)
- [Presentation slides](docs/presentation.pdf)
- [Circuit schematic](docs/hardware/schematic.pdf)
- [Case drawing](docs/hardware/case_drawing.pdf)

## Contributors

- Shashank Singh Deo
- [@MGross21](https://github.com/MGross21)
- Glen Stevens
- Jonathan Hernandez
- Nitish R. Dyapa
- Heman S. Chagarlamudi
