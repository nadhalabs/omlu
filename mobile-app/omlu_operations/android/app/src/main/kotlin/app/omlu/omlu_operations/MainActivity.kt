package app.omlu.omlu_operations

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val downloadChannel = "app.omlu.operations/downloads"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
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
        request.addRequestHeader("User-Agent", System.getProperty("http.agent") ?: "OMLU Operations Android")

        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.enqueue(request)
    }
}
