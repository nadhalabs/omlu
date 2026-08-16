import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../features/auth_provider.dart';

enum UpdateRequirement { current, optional, mandatory, unavailable }

class AndroidReleaseMetadata {
  const AndroidReleaseMetadata({
    required this.version,
    required this.build,
    required this.minimumSupportedBuild,
    required this.apkUrl,
    required this.releaseNotes,
  });

  factory AndroidReleaseMetadata.fromJson(Map<String, Object?> json) {
    final version = json['version'];
    final build = json['build'];
    final minimum = json['minimum_supported_build'];
    final url = Uri.tryParse(json['apk_url']?.toString() ?? '');
    final notes = json['release_notes'];
    if (version is! String ||
        version.trim().isEmpty ||
        build is! int ||
        build < 1 ||
        minimum is! int ||
        minimum < 1 ||
        minimum > build ||
        url == null ||
        url.scheme != 'https' ||
        notes is! List) {
      throw const FormatException('Invalid Android release metadata.');
    }
    return AndroidReleaseMetadata(
      version: version,
      build: build,
      minimumSupportedBuild: minimum,
      apkUrl: url,
      releaseNotes: notes.whereType<String>().toList(growable: false),
    );
  }

  final String version;
  final int build;
  final int minimumSupportedBuild;
  final Uri apkUrl;
  final List<String> releaseNotes;

  UpdateRequirement requirementFor(int installedBuild) {
    if (installedBuild < minimumSupportedBuild) {
      return UpdateRequirement.mandatory;
    }
    if (installedBuild < build) return UpdateRequirement.optional;
    return UpdateRequirement.current;
  }
}

class AppUpdateState {
  const AppUpdateState({required this.requirement, this.metadata});

  const AppUpdateState.unavailable()
    : requirement = UpdateRequirement.unavailable,
      metadata = null;

  final UpdateRequirement requirement;
  final AndroidReleaseMetadata? metadata;
}

typedef MetadataLoader = Future<Map<String, Object?>> Function(Uri uri);

class AppUpdateChecker {
  AppUpdateChecker({
    required this.metadataUri,
    required this.installedBuild,
    MetadataLoader? loader,
  }) : _loader = loader ?? _loadJson;

  final Uri metadataUri;
  final int installedBuild;
  final MetadataLoader _loader;

  Future<AppUpdateState> check() async {
    try {
      final json = await _loader(
        metadataUri,
      ).timeout(const Duration(seconds: 4));
      final metadata = AndroidReleaseMetadata.fromJson(json);
      return AppUpdateState(
        requirement: metadata.requirementFor(installedBuild),
        metadata: metadata,
      );
    } catch (_) {
      return const AppUpdateState.unavailable();
    }
  }

  static Future<Map<String, Object?>> _loadJson(Uri uri) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(uri);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      final response = await request.close();
      if (response.statusCode != HttpStatus.ok) {
        throw const HttpException('Update metadata unavailable.');
      }
      final body = await utf8.decoder.bind(response).join();
      final decoded = jsonDecode(body);
      if (decoded is! Map) throw const FormatException('Expected object.');
      return Map<String, Object?>.from(decoded);
    } finally {
      client.close(force: true);
    }
  }
}

final appUpdateProvider = FutureProvider<AppUpdateState>((ref) async {
  final config = ref.read(appConfigProvider);
  final package = await PackageInfo.fromPlatform();
  final installedBuild = int.tryParse(package.buildNumber) ?? 0;
  final metadataUri = config.frontendUrl.replace(
    path: '/downloads/android-version.json',
    query: null,
    fragment: null,
  );
  return AppUpdateChecker(
    metadataUri: metadataUri,
    installedBuild: installedBuild,
  ).check();
});

class AppUpdateGate extends ConsumerStatefulWidget {
  const AppUpdateGate({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<AppUpdateGate> createState() => _AppUpdateGateState();
}

class _AppUpdateGateState extends ConsumerState<AppUpdateGate> {
  bool _dismissed = false;

  Future<void> _open(AndroidReleaseMetadata metadata) async {
    await launchUrl(metadata.apkUrl, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final update = ref.watch(appUpdateProvider).valueOrNull;
    if (update?.requirement == UpdateRequirement.mandatory &&
        update?.metadata != null) {
      final metadata = update!.metadata!;
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(OmluSpacing.lg),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.system_update_rounded,
                    size: 64,
                    color: OmluColors.accent,
                  ),
                  const SizedBox(height: OmluSpacing.md),
                  Text('Update OMLU', style: OmluTypography.h1),
                  const SizedBox(height: OmluSpacing.xs),
                  const Text(
                    'OMLU needs to be updated before you can continue.',
                    textAlign: TextAlign.center,
                    style: OmluTypography.bodyLarge,
                  ),
                  const SizedBox(height: OmluSpacing.lg),
                  FilledButton.icon(
                    onPressed: () => _open(metadata),
                    icon: const Icon(Icons.download_rounded),
                    label: const Text('Update'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    if (!_dismissed &&
        update?.requirement == UpdateRequirement.optional &&
        update?.metadata != null) {
      final metadata = update!.metadata!;
      return Column(
        children: [
          MaterialBanner(
            content: Text(
              'Update available · OMLU ${metadata.version}',
              style: OmluTypography.bodyMedium,
            ),
            leading: const Icon(Icons.system_update_rounded),
            actions: [
              TextButton(
                onPressed: () => setState(() => _dismissed = true),
                child: const Text('Later'),
              ),
              FilledButton(
                onPressed: () => _open(metadata),
                child: const Text('Update'),
              ),
            ],
          ),
          Expanded(child: widget.child),
        ],
      );
    }
    return widget.child;
  }
}
