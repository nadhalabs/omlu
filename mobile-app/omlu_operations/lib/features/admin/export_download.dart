import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../auth_provider.dart';
import '../../core/errors/user_facing_error.dart';

Future<void> downloadAdminExport(
  BuildContext context,
  WidgetRef ref, {
  required String path,
  required Map<String, String> query,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  messenger.showSnackBar(const SnackBar(content: Text('Downloading export…')));
  try {
    final download = await ref
        .read(operationsApiProvider)
        .downloadAdminExport(path, query: query);
    final directory = Directory('${Directory.systemTemp.path}/omlu_exports');
    await directory.create(recursive: true);
    final cutoff = DateTime.now().subtract(const Duration(days: 1));
    await for (final entity in directory.list()) {
      if (entity is File && (await entity.stat()).modified.isBefore(cutoff)) {
        await entity.delete();
      }
    }
    final file = File('${directory.path}/${download.fileName}');
    await file.writeAsBytes(download.bytes, flush: true);
    if (!context.mounted) return;
    messenger.hideCurrentSnackBar();
    final opened = await launchUrl(
      file.uri,
      mode: LaunchMode.externalApplication,
    );
    messenger.showSnackBar(
      SnackBar(
        content: Text(opened ? 'Export downloaded.' : 'Saved to ${file.path}'),
      ),
    );
  } catch (e) {
    if (!context.mounted) return;
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(content: Text(userFacingError(e))));
  }
}
