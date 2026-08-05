package com.omlu.nadha.printing

import android.bluetooth.BluetoothAdapter
import android.content.Context
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class BluetoothMethodChannel(
    private val context: Context,
    private val classicManager: ClassicPrinterManager,
    private val bleManager: BlePrinterManager,
    private val permissionManager: BluetoothPermissionManager
) : MethodChannel.MethodCallHandler {

    private val adapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "checkState" -> {
                    val supported = adapter != null
                    val enabled = adapter?.isEnabled == true
                    val hasConnectPermission = permissionManager.hasConnectPermission()
                    val hasScanPermission = permissionManager.hasScanPermission()

                    result.success(mapOf(
                        "supported" to supported,
                        "enabled" to enabled,
                        "has_connect_permission" to hasConnectPermission,
                        "has_scan_permission" to hasScanPermission
                    ))
                }
                "getPairedDevices" -> {
                    if (!permissionManager.hasConnectPermission()) {
                        result.error("permission_denied", "Bluetooth permission was denied.", null)
                        return
                    }
                    val devices = classicManager.getBondedDevices().map { it.toMap() }
                    result.success(devices)
                }
                "startScan" -> {
                    if (!permissionManager.hasScanPermission()) {
                        result.error("permission_denied", "Location/Bluetooth scan permission was denied.", null)
                        return
                    }
                    val ok = try {
                        adapter?.startDiscovery() == true
                    } catch (_: SecurityException) {
                        false
                    }
                    result.success(ok)
                }
                "stopScan" -> {
                    try { adapter?.cancelDiscovery() } catch (_: SecurityException) {}
                    result.success(true)
                }
                "connectClassic" -> {
                    val address = call.argument<String>("address")
                    val uuid = call.argument<String>("uuid")
                    val allowInsecure = call.argument<Boolean>("allow_insecure") ?: false

                    if (address.isNullOrBlank()) {
                        result.error("invalid_address", "Printer address is required.", null)
                        return
                    }
                    val connected = classicManager.connect(address, uuid, allowInsecure)
                    result.success(connected)
                }
                "writeClassic" -> {
                    val bytes = call.argument<ByteArray>("bytes") ?: byteArrayOf()
                    val chunkSize = call.argument<Int>("chunk_size") ?: 128
                    val delayMs = (call.argument<Int>("delay_ms") ?: 20).toLong()

                    classicManager.write(bytes, chunkSize, delayMs)
                    result.success(true)
                }
                "flushClassic" -> {
                    classicManager.flush()
                    result.success(true)
                }
                "disconnectClassic" -> {
                    classicManager.disconnect()
                    result.success(true)
                }
                "connectBle" -> {
                    val address = call.argument<String>("address")
                    val timeoutMs = (call.argument<Int>("timeout_ms") ?: 5000).toLong()

                    if (address.isNullOrBlank()) {
                        result.error("invalid_address", "Printer address is required.", null)
                        return
                    }
                    val services = bleManager.connectAndDiscover(address, timeoutMs).map { it.toMap() }
                    result.success(services)
                }
                "writeBle" -> {
                    val serviceUuid = call.argument<String>("service_uuid")
                    val charUuid = call.argument<String>("characteristic_uuid")
                    val bytes = call.argument<ByteArray>("bytes") ?: byteArrayOf()
                    val writeMode = call.argument<String>("write_mode") ?: "auto"
                    val chunkSize = call.argument<Int>("chunk_size") ?: 20
                    val delayMs = (call.argument<Int>("delay_ms") ?: 20).toLong()

                    bleManager.write(serviceUuid, charUuid, bytes, writeMode, chunkSize, delayMs)
                    result.success(true)
                }
                "disconnectBle" -> {
                    bleManager.disconnect()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        } catch (t: Throwable) {
            val sanitized = BluetoothErrorSanitizer.sanitize(t)
            result.error("bluetooth_error", sanitized, null)
        }
    }
}
