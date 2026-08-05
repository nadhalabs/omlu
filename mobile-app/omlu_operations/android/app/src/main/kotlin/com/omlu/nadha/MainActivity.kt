package com.omlu.nadha

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import com.omlu.nadha.printing.BlePrinterManager
import com.omlu.nadha.printing.BluetoothEventChannel
import com.omlu.nadha.printing.BluetoothMethodChannel
import com.omlu.nadha.printing.BluetoothPermissionManager
import com.omlu.nadha.printing.ClassicPrinterManager

class MainActivity : FlutterActivity() {
    private val downloadChannel = "app.omlu.operations/downloads"
    private val btCommandChannel = "app.omlu.operations/bluetooth/commands"
    private val btEventChannel = "app.omlu.operations/bluetooth/events"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val permissionManager = BluetoothPermissionManager(context)
        val classicManager = ClassicPrinterManager(context)
        val bleManager = BlePrinterManager(context)

        val btMethodHandler = BluetoothMethodChannel(context, classicManager, bleManager, permissionManager)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, btCommandChannel)
            .setMethodCallHandler(btMethodHandler)

        val btStreamHandler = BluetoothEventChannel(context)
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, btEventChannel)
            .setStreamHandler(btStreamHandler)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, downloadChannel).setMethodCallHandler { call, result ->
            when (call.method) {
                "download" -> {
                    val url = call.argument<String>("url")
                    if (url.isNullOrBlank()) {
                        result.error("invalid_url", "Download URL is required.", null)
                    } else {
                        enqueueDownload(url)
                        result.success(null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun enqueueDownload(url: String) {
        val uri = Uri.parse(url)
        val fileName = URLUtil.guessFileName(url, null, null)
        val request = DownloadManager.Request(uri)
            .setTitle(fileName)
            .setDescription("Downloading OMLU report")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        CookieManager.getInstance().getCookie(url)?.let { cookie ->
            request.addRequestHeader("Cookie", cookie)
        }
        request.addRequestHeader("User-Agent", System.getProperty("http.agent") ?: "OMLU Android")

        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.enqueue(request)
    }
}
