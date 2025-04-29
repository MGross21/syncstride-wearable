import asyncio
import threading
import csv
import struct
import os
import sys
import time
import tkinter as tk
from tkinter import messagebox
from datetime import datetime
from collections import deque
from bleak import BleakClient, BleakScanner

import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# BLE details
DEVICE_NAME = "SyncStride"
PITCH_CHARACTERISTIC_UUID = "12345678-0001-1000-8000-00805f9b34fb"
CALIB_COMMAND_UUID = "12345678-0003-1000-8000-00805f9b34fb"

# Asyncio event loop in background thread
async_loop = asyncio.new_event_loop()
def run_async_loop():
    asyncio.set_event_loop(async_loop)
    async_loop.run_forever()

threading.Thread(target=run_async_loop, daemon=True).start()

# Global control flags and storage
client = None
stop_requested = False
recording = False
connected = False
data_buffer = []
filename = None
current_pitch_value = None
FORWARD_SWING_PITCH = None
BACKWARD_SWING_PITCH = None

DATA_FOLDER = "Data"
graph_data = deque()

def update_status(message):
    status_text.config(state='normal')
    status_text.delete(1.0, tk.END)
    status_text.insert(tk.END, message)
    status_text.config(state='disabled')

def update_pitch_display():
    if current_pitch_value is not None:
        pitch_display_label.config(text=f"Current Pitch: {current_pitch_value:.2f}°")
    else:
        pitch_display_label.config(text="Current Pitch: --")

def handle_notification(sender, data):
    global data_buffer, current_pitch_value, FORWARD_SWING_PITCH, BACKWARD_SWING_PITCH
    pitch, forward_swing, backward_swing, device_timestamp = struct.unpack('<ffff', data)
    pc_timestamp = datetime.now().isoformat()

    data_buffer.append([pc_timestamp, pitch, forward_swing, backward_swing, device_timestamp])

    current_pitch_value = pitch
    FORWARD_SWING_PITCH = forward_swing
    BACKWARD_SWING_PITCH = backward_swing

    graph_data.append((time.time(), pitch))

    update_pitch_display()

async def ble_task():
    global client, stop_requested, recording, connected
    update_status("Scanning for BLE...")

    devices = await BleakScanner.discover(timeout=5.0)
    target = None
    for d in devices:
        if d.name == DEVICE_NAME:
            target = d
            break

    if not target:
        update_status("Device not found.")
        messagebox.showerror("Error", f"Device '{DEVICE_NAME}' not found.")
        return

    client = BleakClient(target)

    try:
        await client.connect()
        update_status("Connected.\nRecording...")
        connected = True
        set_calibration_buttons_state(True)
        print(f"Connected to {DEVICE_NAME}")

        recording = True
        stop_requested = False

        await client.start_notify(PITCH_CHARACTERISTIC_UUID, handle_notification)

        while not stop_requested:
            await asyncio.sleep(0.1)

        await client.stop_notify(PITCH_CHARACTERISTIC_UUID)
        await client.disconnect()
        print("Disconnected BLE client.")

        connected = False
        set_calibration_buttons_state(False)

        update_status(f"Stopped.\n{len(data_buffer)} points.")
        reset_pitch_display()

    except Exception as e:
        connected = False
        set_calibration_buttons_state(False)
        messagebox.showerror("Error", f"BLE connection failed: {e}")
        update_status("Connection failed.")
    finally:
        recording = False

async def send_calibration_command(command_id):
    if client and client.is_connected:
        try:
            await client.write_gatt_char(CALIB_COMMAND_UUID, bytes([command_id]))
            print(f"Sent calibration command {command_id}")
            update_status(f"Calibration {command_id} sent.")
            flash_pitch_display()
        except Exception as e:
            print(f"Failed to send calibration command: {e}")
            messagebox.showerror("Error", f"Failed to send calibration command: {e}")
    else:
        print("Not connected.")
        messagebox.showerror("Error", "Device not connected!")

def calibrate_idle():
    asyncio.run_coroutine_threadsafe(send_calibration_command(1), async_loop)

def calibrate_forward():
    asyncio.run_coroutine_threadsafe(send_calibration_command(2), async_loop)

def calibrate_backward():
    asyncio.run_coroutine_threadsafe(send_calibration_command(3), async_loop)

def flash_pitch_display():
    pitch_display_label.config(bg="lightgreen")
    root.after(300, lambda: pitch_display_label.config(bg=root.cget("bg")))

def set_calibration_buttons_state(state):
    if state:
        calibrate_idle_button.config(state='normal')
        calibrate_forward_button.config(state='normal')
        calibrate_backward_button.config(state='normal')
    else:
        calibrate_idle_button.config(state='disabled')
        calibrate_forward_button.config(state='disabled')
        calibrate_backward_button.config(state='disabled')

def reset_pitch_display():
    global current_pitch_value
    current_pitch_value = None
    update_pitch_display()

def start_recording():
    global recording, filename
    if recording:
        messagebox.showinfo("Info", "Already recording!")
        return

    filename_raw = filename_entry.get().strip()
    if not filename_raw:
        messagebox.showerror("Error", "Please enter a filename before starting.")
        return

    if not filename_raw.endswith(".csv"):
        filename_raw += ".csv"

    if not os.path.exists(DATA_FOLDER):
        os.makedirs(DATA_FOLDER)

    filename = os.path.join(DATA_FOLDER, filename_raw)

    data_buffer.clear()
    graph_data.clear()
    reset_pitch_display()

    asyncio.run_coroutine_threadsafe(ble_task(), async_loop)

def stop_recording():
    global stop_requested
    if not recording:
        messagebox.showinfo("Info", "Not recording yet!")
        return

    stop_requested = True
    print("Stopping BLE recording...")

def save_data():
    global filename
    if not data_buffer:
        messagebox.showinfo("Info", "No data to save!")
        return

    try:
        if not os.path.exists(DATA_FOLDER):
            os.makedirs(DATA_FOLDER)

        with open(filename, mode='w', newline='') as file:
            writer = csv.writer(file)
            writer.writerow(["Timestamp (PC)", "Pitch (deg)", "Forward Swing Pitch (deg)", "Backward Swing Pitch (deg)", "Device Timestamp (ms)"])
            writer.writerows(data_buffer)

        print(f"Data saved to {filename}")
        os.startfile(filename, "open")

    except Exception as e:
        messagebox.showerror("Error", f"Failed to save data: {e}")

def generate_default_filename():
    now = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return f"SyncStride - {now}.csv"

def update_chart():
    if recording:
        current_time = time.time()
        while graph_data and (current_time - graph_data[0][0]) > 30:
            graph_data.popleft()

        times = [t - current_time for t, p in graph_data]
        pitches = [p for t, p in graph_data]

        ax.clear()
        ax.plot(times, pitches, label="Pitch", color="blue")
        
        if FORWARD_SWING_PITCH is not None:
            ax.axhline(FORWARD_SWING_PITCH, color="green", linestyle="--", label=f"Forward {FORWARD_SWING_PITCH:.1f}°")
        if BACKWARD_SWING_PITCH is not None:
            ax.axhline(BACKWARD_SWING_PITCH, color="red", linestyle="--", label=f"Backward {BACKWARD_SWING_PITCH:.1f}°")
        
        ax.set_xlim(-30, 0)
        ax.set_ylim(-90, 90)
        ax.set_ylabel("Pitch (°)")
        ax.set_xlabel("Seconds Ago")
        ax.legend(loc="upper right")
        ax.grid(True)
        canvas.draw()

    root.after(200, update_chart)

# -------------------- GUI SETUP --------------------
root = tk.Tk()
root.title("BLE Pitch Recorder")
root.geometry("950x550")

# LEFT FRAME (buttons)
left_frame = tk.Frame(root)
left_frame.pack(side="left", padx=10, pady=10)

label = tk.Label(left_frame, text="SyncStride BLE Recorder", font=("Arial", 14))
label.pack(pady=5)

filename_label = tk.Label(left_frame, text="Filename:")
filename_label.pack()
filename_entry = tk.Entry(left_frame, width=25)
filename_entry.pack(pady=5)

filename_entry.insert(0, generate_default_filename())

run_button = tk.Button(left_frame, text="Run", width=20, command=start_recording)
run_button.pack(pady=5)

stop_button = tk.Button(left_frame, text="Stop", width=20, command=stop_recording)
stop_button.pack(pady=5)

save_button = tk.Button(left_frame, text="Save and Open CSV", width=20, command=save_data)
save_button.pack(pady=5)

calibrate_idle_button = tk.Button(left_frame, text="Calibrate Idle", width=20, command=calibrate_idle, state='disabled')
calibrate_idle_button.pack(pady=5)

calibrate_forward_button = tk.Button(left_frame, text="Calibrate Forward Swing", width=20, command=calibrate_forward, state='disabled')
calibrate_forward_button.pack(pady=5)

calibrate_backward_button = tk.Button(left_frame, text="Calibrate Backward Swing", width=20, command=calibrate_backward, state='disabled')
calibrate_backward_button.pack(pady=5)

# RIGHT FRAME (chart + status)
right_frame = tk.Frame(root)
right_frame.pack(side="right", padx=10, pady=10, fill="both", expand=True)

pitch_display_label = tk.Label(right_frame, text="Current Pitch: --", font=("Arial", 16))
pitch_display_label.pack(pady=5)

fig, ax = plt.subplots(figsize=(6, 3))
canvas = FigureCanvasTkAgg(fig, master=right_frame)
canvas.get_tk_widget().pack(pady=5)

status_label = tk.Label(right_frame, text="Status:", font=("Arial", 12))
status_label.pack(pady=2)

status_text = tk.Text(right_frame, height=2, width=50, state='disabled', wrap='word')
status_text.pack(pady=2)

update_status("Idle. Ready to start.")

update_chart()

root.mainloop()