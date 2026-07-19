import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/models/role_session.dart';
import '../core/realtime/realtime_client.dart';
import '../core/realtime/lifecycle_realtime_controller.dart';
import 'auth_provider.dart';

final realtimeClientProvider = Provider<RealtimeClient?>((ref) {
  final authState = ref.watch(authProvider);
  final config = ref.read(appConfigProvider);

  final session = authState.value;
  if (session == null) return null;

  // Determine WS channel based on role
  final channel = switch (session.role) {
    StaffRole.kitchen => 'kitchen',
    StaffRole.admin => 'admin',
    StaffRole.owner => 'operations',
    StaffRole.staff => 'operations',
  };

  final client = RealtimeClient(
    baseUrl: config.backendUrl,
    accessToken: session.accessToken,
    channel: channel,
  );
  final lifecycle = LifecycleRealtimeController(client)..attach();

  // Auto connect/disconnect based on provider lifecycle
  client.connect();
  ref.onDispose(() {
    lifecycle.detach();
    client.disconnect();
    client.dispose();
  });

  return client;
});

final realtimeEventStreamProvider = StreamProvider<RealtimeEvent>((ref) {
  final client = ref.watch(realtimeClientProvider);
  if (client == null) return const Stream.empty();
  return client.events;
});

final realtimeStateStreamProvider = StreamProvider<RealtimeConnectionState>((
  ref,
) {
  final client = ref.watch(realtimeClientProvider);
  if (client == null) return const Stream.empty();
  return client.states;
});
