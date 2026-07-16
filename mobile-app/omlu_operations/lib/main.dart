import 'package:flutter/material.dart';

import 'src/app_config.dart';
import 'src/omlu_webview_app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(OmluOperationsApp(config: AppConfig.fromEnvironment()));
}
