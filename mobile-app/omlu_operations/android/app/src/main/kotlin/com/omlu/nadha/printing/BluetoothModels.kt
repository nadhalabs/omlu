package com.omlu.nadha.printing

data class BluetoothDeviceInfo(
    val name: String,
    val address: String,
    val isBonded: Boolean,
    val capabilities: List<String> // "classic", "ble"
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "name" to name,
        "address" to address,
        "is_bonded" to isBonded,
        "capabilities" to capabilities
    )
}

data class DiscoveredServiceInfo(
    val uuid: String,
    val characteristics: List<DiscoveredCharacteristicInfo>
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "uuid" to uuid,
        "characteristics" to characteristics.map { it.toMap() }
    )
}

data class DiscoveredCharacteristicInfo(
    val uuid: String,
    val canWriteWithResponse: Boolean,
    val canWriteWithoutResponse: Boolean
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "uuid" to uuid,
        "can_write_with_response" to canWriteWithResponse,
        "can_write_without_response" to canWriteWithoutResponse
    )
}
