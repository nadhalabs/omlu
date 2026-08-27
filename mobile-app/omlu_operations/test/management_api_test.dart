import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/api/operations_api.dart';

void main() {
  test(
    'menu item write uses authenticated tenant-derived admin route',
    () async {
      late ApiRequest captured;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          accessToken: 'token',
          transport: (request) async {
            captured = request;
            return const ApiResponse(statusCode: 201, body: {'id': 4});
          },
        ),
      );

      await api.saveAdminMenuItem(
        values: {'category_id': 2, 'name_en': 'Masala Dosa', 'price': 90.0},
      );

      expect(captured.method, 'POST');
      expect(captured.uri.path, '/admin/menu-items');
      expect(captured.body, isNot(contains('restaurant_id')));
      expect((captured.body as Map)['category_id'], 2);
    },
  );

  test('restaurant settings patch never accepts a UI restaurant id', () async {
    late ApiRequest captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          captured = request;
          return const ApiResponse(
            statusCode: 200,
            body: {'kitchen_mode': 'direct_print'},
          );
        },
      ),
    );

    await api.updateRestaurantSettings({'kitchen_mode': 'direct_print'});
    expect(captured.uri.path, '/admin/settings');
    expect(captured.method, 'PATCH');
    expect(captured.body, {'kitchen_mode': 'direct_print'});
  });

  test('staff creation preserves server role authority payload', () async {
    late ApiRequest captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          captured = request;
          return const ApiResponse(statusCode: 201, body: {'id': 7});
        },
      ),
    );
    await api.createStaffAccount({
      'name': 'Chef',
      'username': 'chef1',
      'role': 'kitchen',
      'temporary_password': 'secret1',
    });
    expect(captured.uri.path, '/admin/staff');
    expect((captured.body as Map)['role'], 'kitchen');
    expect(captured.body, isNot(contains('restaurant_id')));
  });

  test('backend validation field and message are exposed', () async {
    final client = ApiClient(
      baseUrl: Uri.parse('https://api.example'),
      transport: (_) async => const ApiResponse(
        statusCode: 422,
        body: {
          'detail': [
            {
              'loc': ['body', 'google_review_url'],
              'msg': 'Use an HTTPS Google Review or Google Maps URL.',
              'type': 'value_error',
            },
          ],
        },
      ),
    );

    expect(
      () => client.patchJson(
        '/admin/settings',
        body: {'google_review_url': 'http://example.com'},
      ),
      throwsA(
        isA<ValidationException>().having(
          (e) => e.message,
          'message',
          contains('google_review_url: Use an HTTPS'),
        ),
      ),
    );
  });
}
