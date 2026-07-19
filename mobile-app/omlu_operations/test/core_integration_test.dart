import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';

void main() {
  group('AuthRepository', () {
    test(
      'logs in, stores token, detects role home, and refreshes profile',
      () async {
        final requests = <ApiRequest>[];
        final client = ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          transport: (request) async {
            requests.add(request);
            if (request.uri.path == '/auth/staff/login') {
              return const ApiResponse(
                statusCode: 200,
                body: {
                  'access_token': 'token-123',
                  'expires_in': 3600,
                  'staff': {
                    'name': 'Kai',
                    'username': 'kai',
                    'email': 'kai@example.com',
                    'role': 'kitchen',
                    'status': 'active',
                    'must_change_password': false,
                    'restaurant_name': 'Demo',
                    'restaurant_slug': 'demo',
                  },
                },
              );
            }
            return const ApiResponse(
              statusCode: 200,
              body: {
                'name': 'Kai',
                'username': 'kai',
                'email': 'kai@example.com',
                'role': 'kitchen',
                'status': 'active',
                'must_change_password': false,
                'restaurant_name': 'Demo',
                'restaurant_slug': 'demo',
              },
            );
          },
        );
        final storage = MemoryTokenStorage();
        final auth = AuthRepository(apiClient: client, tokenStorage: storage);

        final session = await auth.login(
          restaurantSlug: 'demo',
          login: 'kai',
          password: 'secret',
        );
        final restored = await auth.restore();

        expect(session.home, OperationsHome.kitchen);
        expect(restored?.role, StaffRole.kitchen);
        expect(requests.last.headers['Authorization'], 'Bearer token-123');
      },
    );

    test('clears revoked session on restore', () async {
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        accessToken: 'revoked',
        transport: (_) async => const ApiResponse(
          statusCode: 401,
          body: {'detail': 'Staff session has been revoked'},
        ),
      );
      final storage = MemoryTokenStorage();
      await storage.save(
        RoleSession(
          accessToken: 'revoked',
          expiresAt: DateTime.now().add(const Duration(hours: 1)),
          profile: const StaffProfile(
            name: 'A',
            email: 'a@example.com',
            role: StaffRole.staff,
            status: 'active',
            mustChangePassword: false,
            restaurantName: 'Demo',
            restaurantSlug: 'demo',
          ),
        ),
      );

      final auth = AuthRepository(apiClient: client, tokenStorage: storage);

      expect(await auth.restore(), isNull);
      expect(await storage.read(), isNull);
    });
  });

  group('ApiClient and OperationsApi', () {
    test('maps invalid-role access to PermissionDeniedException', () async {
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (_) async => const ApiResponse(
          statusCode: 403,
          body: {'detail': 'Operation not permitted for this role'},
        ),
      );

      expect(
        client.getJson('/staff/tables'),
        throwsA(isA<PermissionDeniedException>()),
      );
    });

    test('sends idempotency key for staff order creation', () async {
      ApiRequest? captured;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          accessToken: 'staff-token',
          transport: (request) async {
            captured = request;
            return const ApiResponse(
              statusCode: 201,
              body: {
                'order_number': 'SO-1',
                'public_token': 'public',
                'status': 'pending',
                'subtotal': '120.00',
                'dining_session_token': 'session',
              },
            );
          },
        ),
      );

      final order = await api.createStaffOrder(
        tableId: 12,
        idempotencyKey: 'send-order-123',
        draft: const StaffOrderDraft(
          items: [OrderItemDraft(menuItemId: 1, quantity: 2)],
        ),
      );

      expect(order.diningSessionToken, 'session');
      expect(captured?.headers['Idempotency-Key'], 'send-order-123');
      expect(captured?.headers['Authorization'], 'Bearer staff-token');
    });

    test('requests staff table bill through bill-request route', () async {
      ApiRequest? captured;
      final api = OperationsApi(
        ApiClient(
          baseUrl: Uri.parse('https://api.example'),
          accessToken: 'staff-token',
          transport: (request) async {
            captured = request;
            return const ApiResponse(
              statusCode: 201,
              body: {'id': 42, 'request_type': 'bill', 'status': 'pending'},
            );
          },
        ),
      );

      final response = await api.requestTableBill(12);

      expect(response['request_type'], 'bill');
      expect(captured?.method, 'POST');
      expect(captured?.uri.path, '/staff/tables/12/bill-request');
    });

    test(
      'records only backend-confirmed Cash or UPI counter payment',
      () async {
        final requests = <ApiRequest>[];
        final api = OperationsApi(
          ApiClient(
            baseUrl: Uri.parse('https://api.example'),
            accessToken: 'staff-token',
            transport: (request) async {
              requests.add(request);
              return const ApiResponse(
                statusCode: 200,
                body: {
                  'bill_number': 'BILL-12',
                  'status': 'paid',
                  'payment_method': 'counter_upi',
                  'total_amount': '567.00',
                },
              );
            },
          ),
        );

        final paid = await api.confirmCounterPayment(
          billNumber: 'BILL-12',
          method: 'counter_upi',
        );

        expect(paid['status'], 'paid');
        expect(
          requests.single.uri.path,
          '/staff/bills/BILL-12/confirm-counter-payment',
        );
        expect(requests.single.body, {'method': 'counter_upi'});
        expect(
          () => api.confirmCounterPayment(
            billNumber: 'BILL-12',
            method: 'counter_card',
          ),
          throwsArgumentError,
        );
      },
    );
  });

  group('Realtime', () {
    test('reconnect policy backs off exponentially', () {
      const policy = ReconnectPolicy(jitterRatio: 0);

      expect(policy.delayForAttempt(1), const Duration(milliseconds: 500));
      expect(policy.delayForAttempt(2), const Duration(milliseconds: 1000));
      expect(policy.delayForAttempt(3), const Duration(milliseconds: 2000));
    });
  });
}
