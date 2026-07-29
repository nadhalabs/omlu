import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_client.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/api/operations_api.dart';
import 'package:omlu_operations/core/auth/auth_repository.dart';
import 'package:omlu_operations/core/models/operations_models.dart';
import 'package:omlu_operations/core/models/role_session.dart';
import 'package:omlu_operations/core/realtime/realtime_client.dart';
import 'package:omlu_operations/core/storage/token_storage.dart';
import 'package:omlu_operations/features/auth_provider.dart';
import 'package:omlu_operations/features/realtime_connection_provider.dart';
import 'package:omlu_operations/features/staff/cart_provider.dart';
import 'package:omlu_operations/features/staff/tables_provider.dart';

import 'test_auth_fixtures.dart';

class _AuthMock extends AuthStateNotifier {
  _AuthMock(RoleSession session, AuthRepository repository)
    : super(repository) {
    state = AsyncData<RoleSession?>(session);
  }

  @override
  Future<void> restoreSession() async {}
}

void main() {
  group('EmptyTableReport model', () {
    test('parses an open report from table-list JSON', () {
      final table = StaffTableSummary.fromJson({
        'id': 12,
        'table_number': '12',
        'has_open_session': true,
        'session_token': 'session-current',
        'empty_table_report': {
          'reported_by_name': 'Asha',
          'reported_at': '2026-07-30T10:15:00Z',
        },
      });

      expect(table.emptyTableReport, isNotNull);
      expect(table.emptyTableReport!.status, 'open');
      expect(table.emptyTableReport!.reportedByName, 'Asha');
      expect(
        table.emptyTableReport!.reportedAt,
        DateTime.parse('2026-07-30T10:15:00Z'),
      );
    });

    test('missing, null, and old cached report data remain safe', () {
      for (final value in <Object?>[null, 'legacy-value', 2]) {
        final json = <String, Object?>{'id': 12, 'table_number': '12'};
        if (value != null) json['empty_table_report'] = value;
        final table = StaffTableSummary.fromJson(json);
        expect(table.emptyTableReport, isNull);
      }
    });

    test('optional report fields preserve null safety', () {
      final report = EmptyTableReport.fromJson(const {'status': 'open'});
      expect(report.status, 'open');
      expect(report.reportedByName, isNull);
      expect(report.reportedAt, isNull);
    });

    test('detail response reads the canonical top-level report', () {
      final table = StaffTableSummary.fromDetailJson({
        'table': {'id': 12, 'table_number': '12', 'has_open_session': true},
        'session': {
          'id': 100,
          'session_token': 'session-current',
          'status': 'open',
          'orders': <Object?>[],
        },
        'empty_table_report': {
          'reported_by_name': 'Asha',
          'reported_at': '2026-07-30T10:15:00Z',
        },
      });
      expect(table.emptyTableReport?.reportedByName, 'Asha');
    });
  });

  group('reportTableEmpty API', () {
    test('sends the canonical authenticated POST and parses success', () async {
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
                'status': 'open',
                'session_token': 'session-current',
                'reported_by_name': 'Asha',
                'reported_at': '2026-07-30T10:15:00Z',
              },
            );
          },
        ),
      );

      final report = await api.reportTableEmpty(
        tableId: 12,
        sessionToken: 'session-current',
      );
      expect(captured?.method, 'POST');
      expect(captured?.uri.path, '/staff/tables/12/empty-table-report');
      expect(captured?.headers['Authorization'], 'Bearer staff-token');
      expect(captured?.body, const <String, Object?>{
        'session_token': 'session-current',
      });
      expect(report.sessionToken, 'session-current');
      expect(report.reportedByName, 'Asha');
    });

    test(
      'preserves duplicate, permission, closed, and server failures',
      () async {
        Future<void> expectStatus(int status, Matcher matcher) async {
          final api = OperationsApi(
            ApiClient(
              baseUrl: Uri.parse('https://api.example'),
              transport: (_) async => ApiResponse(
                statusCode: status,
                body: const {'detail': 'controlled failure'},
              ),
            ),
          );
          await expectLater(
            api.reportTableEmpty(tableId: 12, sessionToken: 'session-current'),
            throwsA(matcher),
          );
        }

        await expectStatus(409, isA<ConflictException>());
        await expectStatus(403, isA<PermissionDeniedException>());
        await expectStatus(404, isA<NotFoundException>());
        await expectStatus(500, isA<ApiException>());
      },
    );

    test(
      'network failure does not produce a false successful report',
      () async {
        final api = OperationsApi(
          ApiClient(
            baseUrl: Uri.parse('https://api.example'),
            transport: (_) =>
                throw const ApiException('Network request failed.'),
          ),
        );
        await expectLater(
          api.reportTableEmpty(tableId: 12, sessionToken: 'session-current'),
          throwsA(isA<ApiException>()),
        );
      },
    );
  });

  group('empty-table state and realtime reconciliation', () {
    late StreamController<RealtimeEvent> events;
    late ProviderContainer container;
    late Map<String, Object?> tableJson;
    late int listFetches;
    late int reportPosts;

    setUp(() {
      events = StreamController<RealtimeEvent>.broadcast();
      listFetches = 0;
      reportPosts = 0;
      tableJson = {
        'id': 12,
        'table_number': '12',
        'state': 'occupied',
        'has_open_session': true,
        'session_token': 'session-current',
        'session_status': 'open',
        'active_order_count': 1,
        'current_bill_amount': '120.00',
        'attention': <Object?>[],
        'bill_requested': false,
        'empty_table_report': null,
      };
      final client = ApiClient(
        baseUrl: Uri.parse('https://api.example'),
        transport: (request) async {
          if (request.uri.path == '/staff/tables') {
            listFetches++;
            return ApiResponse(
              statusCode: 200,
              body: {
                'items': [Map<String, Object?>.from(tableJson)],
              },
            );
          }
          if (request.uri.path == '/staff/tables/12') {
            return ApiResponse(
              statusCode: 200,
              body: {
                'table': Map<String, Object?>.from(tableJson),
                'session': tableJson['has_open_session'] == true
                    ? {
                        'id': 100,
                        'session_token': tableJson['session_token'],
                        'status': 'open',
                        'orders': <Object?>[],
                      }
                    : null,
                'empty_table_report': tableJson['empty_table_report'],
              },
            );
          }
          if (request.uri.path == '/staff/tables/12/empty-table-report') {
            reportPosts++;
            tableJson['empty_table_report'] = {
              'status': 'open',
              'session_token': 'session-current',
              'reported_by_name': 'Asha',
              'reported_at': '2026-07-30T10:15:00Z',
            };
            return ApiResponse(
              statusCode: 201,
              body: tableJson['empty_table_report'],
            );
          }
          return const ApiResponse(
            statusCode: 404,
            body: {'detail': 'Not found'},
          );
        },
      );
      final repository = testAuthRepository(client, MemoryTokenStorage());
      final session = RoleSession(
        accessToken: 'token',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        profile: const StaffProfile(
          name: 'Asha',
          email: 'asha@example.com',
          role: StaffRole.staff,
          status: 'active',
          mustChangePassword: false,
          restaurantName: 'OMLU',
          restaurantSlug: 'omlu',
        ),
        tenantScope: testTenantScope,
      );
      final dependencies = testAuthenticatedCache();
      container = ProviderContainer(
        overrides: [
          authProvider.overrideWith((ref) => _AuthMock(session, repository)),
          operationsApiProvider.overrideWithValue(OperationsApi(client)),
          nativeAuthRuntimeProvider.overrideWithValue(dependencies.runtime),
          operationsDataCacheProvider.overrideWithValue(dependencies.cache),
          realtimeEventStreamProvider.overrideWith((ref) => events.stream),
          realtimeStateStreamProvider.overrideWith(
            (ref) => const Stream.empty(),
          ),
        ],
      );
    });

    tearDown(() async {
      container.dispose();
      await events.close();
    });

    Future<void> settle() async {
      await Future<void>.delayed(const Duration(milliseconds: 30));
    }

    RealtimeEvent event(
      String type, {
      int restaurantId = 1,
      String sessionToken = 'session-current',
    }) => RealtimeEvent(
      id: '$type-$restaurantId-$sessionToken',
      type: type,
      timestamp: DateTime.parse('2026-07-30T10:16:00Z'),
      restaurantId: restaurantId,
      state: {'table_id': 12, 'session_token': sessionToken},
    );

    test(
      'reporting updates state immediately and blocks repeated taps',
      () async {
        container.read(tablesProvider);
        await container.read(tablesProvider.notifier).fetchTables(silent: true);
        final notifier = container.read(emptyTableReportProvider(12).notifier);

        expect(await notifier.submit('session-current'), isTrue);
        expect(container.read(emptyTableReportProvider(12)).value, isNotNull);
        expect(
          container
              .read(tablesProvider)
              .value
              ?.single
              .emptyTableReport
              ?.reportedByName,
          'Asha',
        );
        expect(reportPosts, 1);
      },
    );

    test(
      'dismissal clears report while foreign and old-session events do not',
      () async {
        final reportSubscription = container.listen(
          emptyTableReportProvider(12),
          (_, _) {},
        );
        addTearDown(reportSubscription.close);
        tableJson['empty_table_report'] = {
          'reported_by_name': 'Asha',
          'reported_at': '2026-07-30T10:15:00Z',
        };
        container.read(selectedTableIdProvider.notifier).state = 12;
        container.read(tablesProvider);
        await container.read(tablesProvider.notifier).fetchTables(silent: true);
        expect(container.read(emptyTableReportProvider(12)).value, isNotNull);
        final before = listFetches;

        events.add(event('empty_table.dismissed', restaurantId: 99));
        events.add(event('empty_table.dismissed', sessionToken: 'session-old'));
        await settle();
        expect(listFetches, before);
        expect(container.read(emptyTableReportProvider(12)).value, isNotNull);

        tableJson['empty_table_report'] = null;
        events.add(event('empty_table.dismissed'));
        await settle();
        expect(container.read(emptyTableReportProvider(12)).value, isNull);
      },
    );

    test(
      'forced closure removes selected stale session idempotently',
      () async {
        container.read(selectedTableIdProvider.notifier).state = 12;
        container.read(tablesProvider);
        await container.read(tablesProvider.notifier).fetchTables(silent: true);
        tableJson['has_open_session'] = false;
        tableJson['session_token'] = null;

        final closure = event('session.force_closed');
        events.add(closure);
        events.add(closure);
        await settle();

        expect(container.read(selectedTableIdProvider), isNull);
        expect(
          container.read(forcedSessionClosureNoticeProvider),
          'This table session was closed by the owner or admin.',
        );
      },
    );
  });
}
