const uuid = short => `12345678-${short}-1000-8000-00805f9b34fb`;

const SERVICE_UUID = uuid('0000');
const PITCH_CHARACTERISTIC_UUID = uuid('0001');
const CALIB_CHARACTERISTIC_UUID = uuid('0003');

// Web Bluetooth link to the Nicla firmware. Each notification carries four
// little-endian floats: pitch, forward threshold, backward threshold, millis().
export class DeviceSource {
  static supported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

  constructor({ onSample, onState }) {
    this.onSample = onSample;
    this.onState = onState;
    this.device = null;
    this.pitchChar = null;
    this.calibChar = null;
    this.handleValue = e => this.#parse(e.target.value);
    this.handleDisconnect = () => this.#setState('disconnected');
  }

  get connected() {
    return !!this.device?.gatt?.connected;
  }

  async connect() {
    if (!DeviceSource.supported) return this.#setState('unsupported');
    try {
      this.#setState('connecting');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'SyncStride' }, { services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });
      await this.#attach(device);
    } catch (err) {
      // The chooser being dismissed is not an error worth shouting about.
      this.#setState(err.name === 'NotFoundError' ? 'idle' : 'error', err);
    }
  }

  // Quietly reconnects to a device this browser was already granted, if any.
  async reconnect() {
    if (!navigator.bluetooth?.getDevices) return false;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const device = devices.find(d => d.name?.startsWith('SyncStride'));
      if (!device) return false;
      await this.#attach(device);
      return true;
    } catch {
      return false;
    }
  }

  disconnect() {
    this.pitchChar?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    if (this.connected) this.device.gatt.disconnect();
    this.device = this.pitchChar = this.calibChar = null;
    this.#setState('idle');
  }

  async calibrate(command) {
    if (!this.calibChar) throw new Error('Not connected');
    // Pausing notifications around the write avoids GATT "operation in progress" errors.
    await this.pitchChar.stopNotifications();
    try {
      await this.calibChar.writeValue(Uint8Array.of(command));
    } finally {
      await this.pitchChar.startNotifications();
    }
  }

  async #attach(device) {
    this.#setState('connecting');
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.pitchChar = await service.getCharacteristic(PITCH_CHARACTERISTIC_UUID);
    this.calibChar = await service.getCharacteristic(CALIB_CHARACTERISTIC_UUID);
    this.pitchChar.addEventListener('characteristicvaluechanged', this.handleValue);
    await this.pitchChar.startNotifications();
    this.#setState('connected');
  }

  #parse(value) {
    if (value.byteLength < 16) return;
    const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
    this.onSample({
      pitch: view.getFloat32(0, true),
      fwd: view.getFloat32(4, true),
      back: view.getFloat32(8, true),
      t: view.getFloat32(12, true) / 1000,
      deviceMs: view.getFloat32(12, true)
    });
  }

  #setState(state, error) {
    this.onState(state, { name: this.device?.name, error });
  }
}
