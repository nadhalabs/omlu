import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/operations_api.dart';

void main() {
  test('history requests are bounded, filtered, and tenant-derived', () async {
    late ApiRequest captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          captured = request;
          return const ApiResponse(
            statusCode: 200,
            body: {'items': [], 'page': 2, 'page_size': 25, 'total': 0},
          );
        },
      ),
    );
    await api.fetchHistory(
      resource: 'bills',
      preset: 'last_7_days',
      status: 'paid',
      paymentMethod: 'counter_upi',
      page: 2,
    );
    expect(captured.uri.path, '/admin/history/bills');
    expect(captured.uri.queryParameters, containsPair('page_size', '25'));
    expect(captured.uri.queryParameters, containsPair('page', '2'));
    expect(
      captured.uri.queryParameters,
      containsPair('payment_method', 'counter_upi'),
    );
    expect(captured.uri.queryParameters, isNot(contains('restaurant_id')));
  });

  test(
    'operational lock requires explicit active-operations confirmation',
    () async {
      late ApiRequest captured;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async {
            captured = request;
            return const ApiResponse(statusCode: 200, body: {'locked': true});
          },
        ),
      );
      await api.setAllStaffLocked(
        locked: true,
        reason: 'Emergency maintenance',
        confirmActiveOperations: true,
      );
      expect(captured.uri.path, '/admin/staff/operations/lock');
      expect(captured.method, 'POST');
      expect(captured.body, {
        'reason': 'Emergency maintenance',
        'confirm_active_operations': true,
      });
    },
  );

  test('Print Bridge list unwraps secure installation envelope', () async {
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          expect(request.uri.path, '/print-bridge/installations');
          return const ApiResponse(
            statusCode: 200,
            body: {
              'installations': [
                {'installation_id': 'bridge-1', 'status': 'paired'},
              ],
            },
          );
        },
      ),
    );
    final installations = await api.fetchPrintBridgeInstallations();
    expect(installations, hasLength(1));
    expect((installations.first as Map)['installation_id'], 'bridge-1');
  });

  test('failed print retry is scoped only by server job identifier', () async {
    late ApiRequest captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          captured = request;
          return const ApiResponse(
            statusCode: 200,
            body: {'id': 44, 'status': 'pending'},
          );
        },
      ),
    );
    await api.retryKitchenPrintJob(44);
    expect(captured.uri.path, '/print-bridge/kitchen-jobs/44/retry');
    expect(captured.body, isNull);
  });

  test('GST register uses authoritative paginated backend endpoint', () async {
    late ApiRequest captured;
    final api = OperationsApi(
      ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          captured = request;
          return const ApiResponse(statusCode: 200, body: {'items': []});
        },
      ),
    );
    await api.fetchGstRegister(
      resource: 'sales-register',
      preset: 'this_month',
      page: 3,
    );
    expect(captured.uri.path, '/admin/gst/sales-register');
    expect(captured.uri.queryParameters, containsPair('limit', '25'));
    expect(captured.uri.queryParameters, containsPair('page', '3'));
  });
}
