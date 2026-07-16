import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'app_config.dart';

class OmluOperationsApp extends StatelessWidget {
  const OmluOperationsApp({required this.config, super.key});

  final AppConfig config;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OMLU Operations',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD97706),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: OmluWebViewShell(config: config),
    );
  }
}

class OmluWebViewShell extends StatefulWidget {
  const OmluWebViewShell({required this.config, super.key});

  final AppConfig config;

  @override
  State<OmluWebViewShell> createState() => _OmluWebViewShellState();
}

class _OmluWebViewShellState extends State<OmluWebViewShell> {
  static const MethodChannel _downloads = MethodChannel(
    'app.omlu.operations/downloads',
  );

  late final WebViewController _controller;
  late final StreamSubscription<List<ConnectivityResult>>
  _connectivitySubscription;

  bool _isLoading = true;
  bool _isOffline = false;
  String? _connectionError;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    _controller = _buildController();
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen(
      _handleConnectivityChange,
    );
    _checkInitialConnectivity();
    unawaited(_controller.loadRequest(widget.config.initialUrl));
  }

  @override
  void dispose() {
    _connectivitySubscription.cancel();
    super.dispose();
  }

  WebViewController _buildController() {
    final controller =
        WebViewController(onPermissionRequest: _handleWebPermissionRequest)
          ..setJavaScriptMode(JavaScriptMode.unrestricted)
          ..setBackgroundColor(Colors.white)
          ..setNavigationDelegate(
            NavigationDelegate(
              onProgress: (progress) {
                if (mounted) setState(() => _progress = progress);
              },
              onPageStarted: (_) {
                if (!mounted) return;
                setState(() {
                  _isLoading = true;
                  _connectionError = null;
                });
              },
              onPageFinished: (_) {
                if (!mounted) return;
                setState(() {
                  _isLoading = false;
                  _progress = 100;
                });
              },
              onWebResourceError: (error) {
                if (error.isForMainFrame == false) return;
                if (!mounted) return;
                setState(() {
                  _isLoading = false;
                  _connectionError = error.description;
                });
              },
              onNavigationRequest: _handleNavigation,
            ),
          );

    if (controller.platform is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(false);
      final androidController = controller.platform as AndroidWebViewController;
      unawaited(androidController.setMediaPlaybackRequiresUserGesture(false));
    }

    return controller;
  }

  Future<void> _checkInitialConnectivity() async {
    final results = await Connectivity().checkConnectivity();
    _handleConnectivityChange(results);
  }

  void _handleConnectivityChange(List<ConnectivityResult> results) {
    final offline = results.every(
      (result) => result == ConnectivityResult.none,
    );
    final wasOffline = _isOffline;
    if (mounted) setState(() => _isOffline = offline);
    if (wasOffline && !offline) {
      unawaited(_controller.reload());
    }
  }

  FutureOr<NavigationDecision> _handleNavigation(NavigationRequest request) {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.prevent;

    if (widget.config.isExternalScheme(uri)) {
      unawaited(_openExternal(uri));
      return NavigationDecision.prevent;
    }

    if (widget.config.isDownload(uri)) {
      unawaited(_download(uri));
      return NavigationDecision.prevent;
    }

    if (widget.config.isAllowedInWebView(uri)) {
      return NavigationDecision.navigate;
    }

    unawaited(_openExternal(uri));
    return NavigationDecision.prevent;
  }

  Future<void> _handleWebPermissionRequest(
    WebViewPermissionRequest request,
  ) async {
    final permissions = <Permission>{};
    if (request.types.contains(WebViewPermissionResourceType.camera)) {
      permissions.add(Permission.camera);
    }
    if (request.types.contains(WebViewPermissionResourceType.microphone)) {
      permissions.add(Permission.microphone);
    }

    if (permissions.isEmpty) {
      await request.deny();
      return;
    }

    final statuses = await permissions.toList().request();
    final granted = statuses.values.every((status) => status.isGranted);
    if (granted) {
      await request.grant();
    } else {
      await request.deny();
    }
  }

  Future<void> _openExternal(Uri uri) async {
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _download(Uri uri) async {
    try {
      await _downloads.invokeMethod<void>('download', <String, String>{
        'url': uri.toString(),
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Download started')));
      }
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not start download: $error')),
      );
    }
  }

  Future<void> _retry() async {
    final results = await Connectivity().checkConnectivity();
    _handleConnectivityChange(results);
    if (results.every((result) => result == ConnectivityResult.none)) return;
    setState(() {
      _connectionError = null;
      _isLoading = true;
    });
    await _controller.reload();
  }

  Future<void> _handleBackPressed() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return;
    }
    if (!mounted) return;
    final shouldExit = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Exit OMLU?'),
        content: const Text('Do you want to close OMLU Operations?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Exit'),
          ),
        ],
      ),
    );
    if (shouldExit == true) {
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final showOffline = _isOffline;
    final showError = _connectionError != null && !showOffline;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) =>
          unawaited(_handleBackPressed()),
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          top: false,
          bottom: false,
          child: Stack(
            children: [
              Positioned.fill(child: WebViewWidget(controller: _controller)),
              if (_isLoading && !showOffline && !showError)
                _LoadingOverlay(progress: _progress),
              if (showOffline)
                _StatusScreen(
                  title: 'You are offline',
                  message:
                      'Check your connection. OMLU will reload when the network returns.',
                  actionLabel: 'Retry',
                  onRetry: _retry,
                ),
              if (showError)
                _StatusScreen(
                  title: 'Connection error',
                  message: _connectionError!,
                  actionLabel: 'Retry',
                  onRetry: _retry,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadingOverlay extends StatelessWidget {
  const _LoadingOverlay({required this.progress});

  final int progress;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.white,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text('Loading OMLU... $progress%'),
          ],
        ),
      ),
    );
  }
}

class _StatusScreen extends StatelessWidget {
  const _StatusScreen({
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onRetry,
  });

  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.white,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off_rounded, size: 52),
              const SizedBox(height: 16),
              Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton(onPressed: onRetry, child: Text(actionLabel)),
            ],
          ),
        ),
      ),
    );
  }
}
