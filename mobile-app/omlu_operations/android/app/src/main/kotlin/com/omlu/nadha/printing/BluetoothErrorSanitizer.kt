package com.omlu.nadha.printing

object BluetoothErrorSanitizer {
    fun sanitize(error: Throwable?): String {
        if (error == null) return "Printer is not connected."
        val message = error.message ?: ""
        return when {
            error is SecurityException || message.contains("Permission", ignoreCase = true) ->
                "Bluetooth permission was denied."
            message.contains("disabled", ignoreCase = true) || message.contains("OFF", ignoreCase = true) ->
                "Bluetooth is turned off on this device."
            message.contains("timeout", ignoreCase = true) ->
                "Printer connection timed out."
            message.contains("GATT", ignoreCase = true) || message.contains("RFCOMM", ignoreCase = true) ->
                "Printer is unavailable or disconnected."
            else -> "Printing failed. The bill remains safely issued."
        }
    }
}
