import 'package:flutter/widgets.dart';

import 'realtime_client.dart';

class LifecycleRealtimeController with WidgetsBindingObserver {
  LifecycleRealtimeController(this._client);

  final RealtimeClient _client;

  void attach() {
    WidgetsBinding.instance.addObserver(this);
  }

  void detach() {
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _client.connect();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _client.disconnect();
    }
  }
}
