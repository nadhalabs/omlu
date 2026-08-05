package com.omlu.nadha.printing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothProfile
import android.content.Context
import java.io.IOException
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BlePrinterManager(private val context: Context) {
    private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var activeGatt: BluetoothGatt? = null
    private var connectedDeviceAddress: String? = null
    private var currentMtu: Int = 23

    @Synchronized
    fun connectAndDiscover(address: String, timeoutMs: Long): List<DiscoveredServiceInfo> {
        disconnect()
        val bluetoothAdapter = adapter ?: throw IllegalStateException("Bluetooth unsupported.")
        if (!bluetoothAdapter.isEnabled) throw IllegalStateException("Bluetooth is disabled.")

        val device = try {
            bluetoothAdapter.getRemoteDevice(address)
        } catch (e: Exception) {
            throw IllegalArgumentException("Invalid device address: $address")
        }

        val latch = CountDownLatch(1)
        var connectError: Throwable? = null
        val discoveredServicesList = mutableListOf<DiscoveredServiceInfo>()

        val gattCallback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    try {
                        gatt.requestMtu(512)
                        gatt.discoverServices()
                    } catch (e: Exception) {
                        connectError = e
                        latch.countDown()
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    if (latch.count > 0) {
                        connectError = IOException("GATT disconnected during connection setup.")
                        latch.countDown()
                    }
                }
            }

            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    currentMtu = mtu
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    for (service in gatt.services) {
                        val chars = mutableListOf<DiscoveredCharacteristicInfo>()
                        for (ch in service.characteristics) {
                            val props = ch.properties
                            val canWithResp = (props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
                            val canNoResp = (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                            if (canWithResp || canNoResp) {
                                chars.add(DiscoveredCharacteristicInfo(
                                    ch.uuid.toString(),
                                    canWithResp,
                                    canNoResp
                                ))
                            }
                        }
                        if (chars.isNotEmpty()) {
                            discoveredServicesList.add(DiscoveredServiceInfo(service.uuid.toString(), chars))
                        }
                    }
                } else {
                    connectError = IOException("Service discovery failed with status $status")
                }
                latch.countDown()
            }
        }

        activeGatt = device.connectGatt(context, false, gattCallback)
        connectedDeviceAddress = address

        val ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        if (!ok || connectError != null) {
            disconnect()
            throw IOException(connectError?.message ?: "BLE connection timed out after ${timeoutMs}ms.")
        }

        return discoveredServicesList
    }

    fun write(
        serviceUuidStr: String?,
        charUuidStr: String?,
        bytes: ByteArray,
        writeMode: String, // "auto", "with_response", "without_response"
        chunkSize: Int,
        delayMs: Long
    ) {
        val gatt = activeGatt ?: throw IOException("BLE printer is not connected.")

        // Find service and characteristic
        var targetChar: BluetoothGattCharacteristic? = null
        if (!serviceUuidStr.isNullOrBlank() && !charUuidStr.isNullOrBlank()) {
            try {
                val sUuid = UUID.fromString(serviceUuidStr)
                val cUuid = UUID.fromString(charUuidStr)
                targetChar = gatt.getService(sUuid)?.getCharacteristic(cUuid)
            } catch (_: Exception) {}
        }

        if (targetChar == null) {
            // Auto-detect first writable characteristic
            for (service in gatt.services) {
                for (ch in service.characteristics) {
                    val props = ch.properties
                    if ((props and (BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0) {
                        targetChar = ch
                        break
                    }
                }
                if (targetChar != null) break
            }
        }

        if (targetChar == null) {
            throw IOException("No writable BLE characteristic found on printer.")
        }

        val props = targetChar.properties
        val canWithResp = (props and BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
        val canNoResp = (props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0

        val useResponse = when (writeMode) {
            "with_response" -> true
            "without_response" -> false
            else -> canWithResp // Default auto: prefer response if supported
        }

        targetChar.writeType = if (useResponse) {
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        } else {
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        }

        // Safe chunk size (mtu - 3 or specified chunkSize)
        val safeMax = Math.max(20, currentMtu - 3)
        val actualChunkSize = if (chunkSize in 1..safeMax) chunkSize else safeMax

        var offset = 0
        while (offset < bytes.size) {
            val length = Math.min(actualChunkSize, bytes.size - offset)
            val chunk = bytes.copyOfRange(offset, offset + length)
            targetChar.value = chunk

            if (useResponse) {
                val writeLatch = CountDownLatch(1)
                var writeSuccess = false

                // We send write and wait for GATT callback (or timeout)
                val ok = gatt.writeCharacteristic(targetChar)
                if (!ok) throw IOException("Failed to initiate BLE write operation.")

                // Simple sleep sync for write ACK pacing
                try { Thread.sleep(Math.max(15L, delayMs)) } catch (_: InterruptedException) {}
            } else {
                val ok = gatt.writeCharacteristic(targetChar)
                if (!ok) throw IOException("Failed to initiate BLE write operation.")
                if (delayMs > 0) {
                    try { Thread.sleep(delayMs) } catch (_: InterruptedException) {}
                }
            }

            offset += length
        }
    }

    fun disconnect() {
        try {
            activeGatt?.disconnect()
            activeGatt?.close()
        } catch (_: Exception) {}
        activeGatt = null
        connectedDeviceAddress = null
    }
}
