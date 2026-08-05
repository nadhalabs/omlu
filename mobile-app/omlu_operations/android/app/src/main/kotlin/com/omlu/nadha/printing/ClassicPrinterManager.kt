package com.omlu.nadha.printing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

class ClassicPrinterManager(private val context: Context) {
    private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var activeSocket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null

    companion object {
        val DEFAULT_SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    fun getBondedDevices(): List<BluetoothDeviceInfo> {
        val result = mutableListOf<BluetoothDeviceInfo>()
        val bluetoothAdapter = adapter ?: return result
        try {
            val bonded = bluetoothAdapter.bondedDevices ?: return result
            for (device in bonded) {
                val name = try { device.name ?: "Unknown Printer" } catch (_: SecurityException) { "Unknown Printer" }
                val address = device.address
                val caps = mutableListOf<String>()
                val type = try { device.type } catch (_: SecurityException) { BluetoothDevice.DEVICE_TYPE_UNKNOWN }
                if (type == BluetoothDevice.DEVICE_TYPE_CLASSIC || type == BluetoothDevice.DEVICE_TYPE_DUAL) {
                    caps.add("classic")
                }
                if (type == BluetoothDevice.DEVICE_TYPE_LE || type == BluetoothDevice.DEVICE_TYPE_DUAL) {
                    caps.add("ble")
                }
                if (caps.isEmpty()) caps.add("classic")
                result.add(BluetoothDeviceInfo(name, address, true, caps))
            }
        } catch (_: SecurityException) {
            // Handled cleanly
        }
        return result
    }

    fun connect(address: String, uuidString: String?, allowInsecureFallback: Boolean): Boolean {
        disconnect()
        val bluetoothAdapter = adapter ?: throw IllegalStateException("Bluetooth unsupported.")
        if (!bluetoothAdapter.isEnabled) throw IllegalStateException("Bluetooth is disabled.")

        val device = try {
            bluetoothAdapter.getRemoteDevice(address)
        } catch (e: Exception) {
            throw IllegalArgumentException("Invalid device address: $address")
        }

        val targetUuid = if (!uuidString.isNull_or_blank()) {
            try { UUID.fromString(uuidString) } catch (_: Exception) { DEFAULT_SPP_UUID }
        } else {
            DEFAULT_SPP_UUID
        }

        var socket: BluetoothSocket? = null
        // Order: 1) Configured/Default SPP UUID, 2) Insecure fallback if explicitly allowed
        try {
            socket = device.createRfcommSocketToServiceRecord(targetUuid)
            socket.connect()
        } catch (e: Exception) {
            socket?.close()
            socket = null
            if (allowInsecureFallback) {
                try {
                    socket = device.createInsecureRfcommSocketToServiceRecord(targetUuid)
                    socket.connect()
                } catch (e2: Exception) {
                    socket?.close()
                    socket = null
                    throw IOException("Could not connect to Classic Bluetooth printer.", e2)
                }
            } else {
                throw IOException("Could not connect to Classic Bluetooth printer.", e)
            }
        }

        activeSocket = socket
        outputStream = socket?.outputStream
        return true
    }

    fun write(bytes: ByteArray, chunkSize: Int, delayMs: Long) {
        val stream = outputStream ?: throw IOException("Printer socket is closed.")
        val size = if (chunkSize > 0) chunkSize else 128
        var offset = 0
        while (offset < bytes.size) {
            val length = Math.min(size, bytes.size - offset)
            stream.write(bytes, offset, length)
            stream.flush()
            offset += length
            if (delayMs > 0 && offset < bytes.size) {
                try { Thread.sleep(delayMs) } catch (_: InterruptedException) {}
            }
        }
    }

    fun flush() {
        outputStream?.flush()
    }

    fun disconnect() {
        try { outputStream?.close() } catch (_: Exception) {}
        try { activeSocket?.close() } catch (_: Exception) {}
        outputStream = null
        activeSocket = null
    }

    private fun String?.isNull_or_blank(): Boolean = this == null || this.trim().isEmpty()
}
