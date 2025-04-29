import asyncio
import csv
import struct
from datetime import datetime
from bleak import BleakClient, BleakScanner

# BLE details
DEVICE_NAME = "SyncStride"
PITCH_CHARACTERISTIC_UUID = "12345678-0001-1000-8000-00805f9b34fb"

# Output CSV file
CSV_FILE = "ble_pitch_data.csv"

# Create CSV and write header
file = open(CSV_FILE, mode='w', newline='')
writer = csv.writer(file)
writer.writerow(["Timestamp (PC)", "Pitch (deg)", "Forward Swing Pitch (deg)", "Backward Swing Pitch (deg)", "Device Timestamp (ms)"])

def handle_notification(sender, data):
    # Unpack 4 floats (little endian, 4 bytes each)
    pitch, forward_swing, backward_swing, device_timestamp = struct.unpack('<ffff', data)
    
    pc_timestamp = datetime.now().isoformat()
    print(f"[{pc_timestamp}] Pitch: {pitch:.2f}, Forward Swing: {forward_swing:.2f}, Backward Swing: {backward_swing:.2f}, Device Time: {device_timestamp:.0f} ms")
    
    # Save to CSV
    writer.writerow([pc_timestamp, pitch, forward_swing, backward_swing, device_timestamp])
    file.flush()  # Ensure it's saved immediately

async def main():
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover(timeout=5.0)
    target = None
    for d in devices:
        if d.name == DEVICE_NAME:
            target = d
            break

    if not target:
        print(f"Device '{DEVICE_NAME}' not found. Make sure it is advertising!")
        return

    async with BleakClient(target) as client:
        print(f"Connected to {DEVICE_NAME}")
        await client.start_notify(PITCH_CHARACTERISTIC_UUID, handle_notification)

        print("Listening for notifications... (press Ctrl+C to stop)")
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("Stopping...")
        finally:
            await client.stop_notify(PITCH_CHARACTERISTIC_UUID)
            file.close()

if __name__ == "__main__":
    asyncio.run(main())