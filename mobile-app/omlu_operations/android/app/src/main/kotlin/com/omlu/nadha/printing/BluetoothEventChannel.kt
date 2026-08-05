package com.omlu.nadha.printing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import io.flutter.plugin.common.EventChannel

class BluetoothEventChannel(private val context: Context) : EventChannel.StreamHandler {
    private var eventSink: EventChannel.EventSink? = null
    private var receiver: BroadcastReceiver? = null

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
        eventSink = sink
        registerDiscoveryReceiver()
    }

    override fun onCancel(arguments: Any?) {
        unregisterDiscoveryReceiver()
        eventSink = null
    }

    fun sendEvent(eventType: String, data: Map<String, Any?>) {
        val payload = mapOf("event" to eventType, "data" to data)
        eventSink?.success(payload)
    }

    private fun registerDiscoveryReceiver() {
        if (receiver != null) return
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        if (device != null) {
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

                            sendEvent("device_found", mapOf(
                                "name" to name,
                                "address" to address,
                                "is_bonded" to (device.bondState == BluetoothDevice.BOND_BONDED),
                                "capabilities" to caps
                            ))
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        sendEvent("scan_completed", mapOf("status" to "finished"))
                    }
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        try {
            context.registerReceiver(receiver, filter)
        } catch (_: Exception) {}
    }

    private fun unregisterDiscoveryReceiver() {
        receiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        receiver = null
    }
}
