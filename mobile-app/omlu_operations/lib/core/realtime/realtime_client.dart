import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../api/backend_selection_manager.dart';
import '../auth/flutter_tenant_scope.dart';
import '../auth/native_auth_runtime.dart';

enum RealtimeConnectionState {
  disconnected,
  connecting,
  connected,
  reconnecting,
}

class RealtimeEvent {
  const RealtimeEvent({
    required this.id,
    required this.type,
    required this.timestamp,
    required this.state,
    this.restaurantId,
    this.resourceId,
  });

  factory RealtimeEvent.fromJson(Map<String, Object?> json) {
    return RealtimeEvent(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      timestamp: DateTime.parse(json['timestamp'] as String),
      restaurantId: json['restaurant_id'] as int?,
      resourceId: json['resource_id']?.toString(),
      state: Map<String, Object?>.from((json['state'] as Map?) ?? const {}),
    );
  }

  final String id;
  final String type;
  final DateTime timestamp;
  final int? restaurantId;
  final String? resourceId;
  final Map<String, Object?> state;
}

class ReconnectPolicy {
  const ReconnectPolicy({
    this.initialDelay = const Duration(milliseconds: 500),
    this.maxDelay = const Duration(seconds: 30),
    this.multiplier = 2,
    this.jitterRatio = 0.2,
    Random? random,
  }) : _random = random;

  final Duration initialDelay;
  final Duration maxDelay;
  final double multiplier;
  final double jitterRatio;
  final Random? _random;

  Duration delayForAttempt(int attempt) {
    final exponent = max(0, attempt - 1);
    final baseMs = initialDelay.inMilliseconds * pow(multiplier, exponent);
    final cappedMs = min(baseMs, maxDelay.inMilliseconds).round();
    final random = _random ?? Random();
    final jitter = (cappedMs * jitterRatio * random.nextDouble()).round();
    return Duration(milliseconds: cappedMs + jitter);
  }
}

typedef WebSocketConnector = Future<WebSocket> Function(Uri uri);

class RealtimeClient {
  RealtimeClient({
    required Uri baseUrl,
    Uri Function()? baseUrlSupplier,
    required String accessToken,
    required String channel,
    ReconnectPolicy reconnectPolicy = const ReconnectPolicy(),
    WebSocketConnector? connector,
    NativeAuthRuntime? authRuntime,
    FlutterTenantScope? tenantScope,
    BackendSelectionManager? backendSelectionManager,
  })  : _baseUrl = baseUrl,
        _baseUrlSupplier = baseUrlSupplier,
        _accessToken = accessToken,
        _channel = channel,
        _reconnectPolicy = reconnectPolicy,
        _connector = connector ?? ((uri) => WebSocket.connect(uri.toString())),
        _authRuntime = authRuntime,
        _tenantScope = tenantScope,
        _backendSelectionManager = backendSelectionManager;

  final Uri _baseUrl;
  final Uri Function()? _baseUrlSupplier;
  final String _accessToken;
  final String _channel;
  final ReconnectPolicy _reconnectPolicy;
  final WebSocketConnector _connector;
  final NativeAuthRuntime? _authRuntime;
  final FlutterTenantScope? _tenantScope;
  final BackendSelectionManager? _backendSelectionManager;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final _states = StreamController<RealtimeConnectionState>.broadcast();
  final Set<String> _seenEventIds = <String>{};

  WebSocket? _socket;
  bool _closedByClient = false;
  bool _opening = false;
  int _attempt = 0;
  Timer? _reconnectTimer;

  Stream<RealtimeEvent> get events => _events.stream;
  Stream<RealtimeConnectionState> get states => _states.stream;

  Future<void> connect() async {
    if (_socket != null || _opening) return;
    _closedByClient = false;
    await _open(RealtimeConnectionState.connecting);
  }

  Future<void> disconnect() async {
    _closedByClient = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _socket?.close();
    _socket = null;
    _states.add(RealtimeConnectionState.disconnected);
  }

  Future<void> dispose() async {
    await disconnect();
    await _events.close();
    await _states.close();
  }

  Future<void> _open(RealtimeConnectionState state) async {
    if (_opening || _socket != null || _closedByClient) return;
    _opening = true;
    _states.add(state);
    try {
      _socket = await _connector(_staffWsUri());
      _socket?.pingInterval = const Duration(seconds: 20);
      _attempt = 0;
      _states.add(RealtimeConnectionState.connected);
      unawaited(_listen());
    } catch (_) {
      _opening = false;
      await _scheduleReconnect();
    } finally {
      _opening = false;
    }
  }

  Future<void> _listen() async {
    final socket = _socket;
    if (socket == null) return;
    try {
      await for (final message in socket) {
        _handleMessage(message);
      }
    } finally {
      if (identical(_socket, socket)) _socket = null;
      if (!_closedByClient) {
        await _scheduleReconnect();
      }
    }
  }

  void _handleMessage(Object? message) {
    final runtime = _authRuntime;
    final scope = _tenantScope;
    if (runtime != null &&
        (scope == null || runtime.scope != scope || !runtime.isActive)) {
      return;
    }
    if (message is! String) return;
    final decoded = jsonDecode(message);
    if (decoded is! Map) return;
    final type = decoded['type'];
    if (type == 'heartbeat' || type == 'connection.ready') return;
    final event = RealtimeEvent.fromJson(Map<String, Object?>.from(decoded));
    if (scope != null &&
        event.restaurantId != null &&
        event.restaurantId != scope.restaurantId) {
      return;
    }
    if (event.id.isEmpty || _seenEventIds.contains(event.id)) return;
    _seenEventIds.add(event.id);
    if (_seenEventIds.length > 500) {
      _seenEventIds.remove(_seenEventIds.first);
    }
    _events.add(event);
  }

  Future<void> _scheduleReconnect() async {
    if (_closedByClient) return;
    _attempt += 1;
    _states.add(RealtimeConnectionState.reconnecting);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_reconnectPolicy.delayForAttempt(_attempt), () {
      _reconnectTimer = null;
      if (!_closedByClient) {
        unawaited(_open(RealtimeConnectionState.reconnecting));
      }
    });
  }

  Uri _staffWsUri() {
    final baseUrl = _backendSelectionManager?.activeBackendUrl ??
        (_baseUrlSupplier != null ? _baseUrlSupplier() : _baseUrl);
    final scheme = baseUrl.scheme == 'https' ? 'wss' : 'ws';
    return baseUrl.replace(
      scheme: scheme,
      path: _joinPath(baseUrl.path, '/ws/staff'),
      queryParameters: {'token': _accessToken, 'channel': _channel},
    );
  }

  static String _joinPath(String basePath, String path) {
    final cleanBase = basePath.endsWith('/')
        ? basePath.substring(0, basePath.length - 1)
        : basePath;
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return '$cleanBase$cleanPath';
  }
}
