import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/src/navigation_policy.dart';

void main() {
  group('NavigationPolicy', () {
    const policy = NavigationPolicy();
    final initialUrl = Uri.parse('https://omlu.example');

    test(
      'detects authentication routes that should not be restored by back',
      () {
        expect(
          policy.isAuthRoute(Uri.parse('https://omlu.example/login')),
          true,
        );
        expect(
          policy.isAuthRoute(Uri.parse('https://omlu.example/staff/login')),
          true,
        );
        expect(
          policy.isAuthRoute(Uri.parse('https://omlu.example/register')),
          true,
        );
        expect(
          policy.isAuthRoute(
            Uri.parse('https://omlu.example/staff/change-password'),
          ),
          true,
        );
        expect(
          policy.isAuthRoute(Uri.parse('https://omlu.example/staff/tables')),
          false,
        );
      },
    );

    test('detects authenticated workspace routes and role roots', () {
      expect(
        policy.isAuthenticatedWorkspace(
          Uri.parse('https://omlu.example/staff/tables'),
        ),
        true,
      );
      expect(
        policy.isAuthenticatedWorkspace(
          Uri.parse('https://omlu.example/admin/dashboard'),
        ),
        true,
      );
      expect(
        policy.isAuthenticatedWorkspace(
          Uri.parse('https://omlu.example/kitchen/cafe'),
        ),
        true,
      );
      expect(policy.isRoleRoot(Uri.parse('https://omlu.example/staff')), true);
      expect(
        policy.isRoleRoot(Uri.parse('https://omlu.example/admin/dashboard')),
        true,
      );
      expect(
        policy.isRoleRoot(Uri.parse('https://omlu.example/kitchen/cafe')),
        true,
      );
      expect(
        policy.isRoleRoot(Uri.parse('https://omlu.example/staff/tables/4')),
        false,
      );
    });

    test('resolves auth back fallback to the current role home', () {
      expect(
        policy
            .roleHomeFor(
              Uri.parse('https://omlu.example/staff/tables/4'),
              initialUrl,
            )
            .toString(),
        'https://omlu.example/staff',
      );
      expect(
        policy
            .roleHomeFor(
              Uri.parse('https://omlu.example/admin/staff'),
              initialUrl,
            )
            .toString(),
        'https://omlu.example/admin',
      );
      expect(
        policy
            .roleHomeFor(
              Uri.parse('https://omlu.example/kitchen/cafe/orders'),
              initialUrl,
            )
            .toString(),
        'https://omlu.example/kitchen/cafe',
      );
    });
  });
}
