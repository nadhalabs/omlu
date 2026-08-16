import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/update/app_update.dart';

Map<String, Object?> metadata({int build = 3, int minimum = 2}) => {
  'version': '1.0.2',
  'build': build,
  'minimum_supported_build': minimum,
  'apk_url': 'https://omlu.in/downloads/omlu.apk',
  'release_notes': <String>['Safer kitchen cancellations'],
};

void main() {
  final uri = Uri.parse('https://omlu.in/downloads/android-version.json');

  test('classifies current, optional and mandatory builds', () {
    final release = AndroidReleaseMetadata.fromJson(metadata());
    expect(release.requirementFor(3), UpdateRequirement.current);
    expect(release.requirementFor(2), UpdateRequirement.optional);
    expect(release.requirementFor(1), UpdateRequirement.mandatory);
  });

  test('checker returns current metadata', () async {
    final result = await AppUpdateChecker(
      metadataUri: uri,
      installedBuild: 3,
      loader: (_) async => metadata(),
    ).check();
    expect(result.requirement, UpdateRequirement.current);
  });

  test('malformed and unavailable metadata do not block use', () async {
    final malformed = await AppUpdateChecker(
      metadataUri: uri,
      installedBuild: 3,
      loader: (_) async => {'build': 'wrong'},
    ).check();
    final unavailable = await AppUpdateChecker(
      metadataUri: uri,
      installedBuild: 3,
      loader: (_) async => throw Exception('offline'),
    ).check();
    expect(malformed.requirement, UpdateRequirement.unavailable);
    expect(unavailable.requirement, UpdateRequirement.unavailable);
  });

  test(
    'metadata timeout does not block use',
    () async {
      final result = await AppUpdateChecker(
        metadataUri: uri,
        installedBuild: 3,
        loader: (_) => Completer<Map<String, Object?>>().future,
      ).check();
      expect(result.requirement, UpdateRequirement.unavailable);
    },
    timeout: const Timeout(Duration(seconds: 6)),
  );
}
