import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';

final staffOperationsProvider = FutureProvider<Map<String, Object?>>((ref) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return ref.watch(operationsApiProvider).fetchStaffOperations();
});

class OperationalControlsScreen extends ConsumerStatefulWidget {
  const OperationalControlsScreen({super.key});
  @override
  ConsumerState<OperationalControlsScreen> createState() =>
      _OperationalControlsScreenState();
}

class _OperationalControlsScreenState
    extends ConsumerState<OperationalControlsScreen> {
  bool _busy = false;
  Future<void> _status(String value) async {
    if (_busy) return;
    final consequential = value != 'open';
    final ok =
        !consequential ||
        await showDialog<bool>(
              context: context,
              builder: (_) => AlertDialog(
                title: Text(
                  value == 'closing'
                      ? 'Start closing restaurant?'
                      : 'Close restaurant?',
                ),
                content: Text(
                  value == 'closing'
                      ? 'New operational work may be restricted while existing service is completed.'
                      : 'Confirm only after current restaurant operations have been reviewed.',
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Confirm'),
                  ),
                ],
              ),
            ) ==
            true;
    if (!ok) return;
    await _run(
      () => ref
          .read(operationsApiProvider)
          .updateRestaurantOperatingStatus(value),
    );
  }

  Future<void> _lock(bool locked, Map<String, Object?> current) async {
    if (_busy) return;
    String? reason;
    if (locked) {
      final controller = TextEditingController();
      reason = await showDialog<String>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Lock staff operations?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'This is reversible, but staff will be unable to continue normal operations until unlocked.',
              ),
              TextField(
                controller: controller,
                decoration: const InputDecoration(labelText: 'Reason'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: const Text('Lock operations'),
            ),
          ],
        ),
      );
      controller.dispose();
      if (reason == null) return;
    }
    try {
      await _run(
        () => ref
            .read(operationsApiProvider)
            .setAllStaffLocked(locked: locked, reason: reason),
      );
    } catch (_) {
      if (!mounted || !locked) return;
      final active = [
        'active_sessions',
        'unserved_orders',
        'pending_requests',
        'bills_waiting_for_payment',
        'occupied_tables',
      ].any((key) => (int.tryParse('${current[key]}') ?? 0) > 0);
      if (!active) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Active operations detected'),
          content: const Text(
            'The server reports active tables, orders, requests, sessions, or unpaid bills. Lock staff access anyway? Existing business records will not be deleted.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep open'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Lock anyway'),
            ),
          ],
        ),
      );
      if (confirmed == true) {
        await _run(
          () => ref
              .read(operationsApiProvider)
              .setAllStaffLocked(
                locked: true,
                reason: reason,
                confirmActiveOperations: true,
              ),
        );
      }
    }
  }

  Future<void> _run(Future<Object?> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(staffOperationsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Operational status updated.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
      rethrow;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(staffOperationsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Operational controls', style: OmluTypography.h2),
        actions: [
          IconButton(
            onPressed: () => ref.invalidate(staffOperationsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(userFacingError(e))),
        data: (data) {
          final status = '${data['operating_status'] ?? 'open'}';
          final locked = data['locked'] == true;
          return ListView(
            padding: const EdgeInsets.all(OmluSpacing.lg),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Restaurant status', style: OmluTypography.h2),
                      const SizedBox(height: 12),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                            value: 'open',
                            icon: Icon(Icons.lock_open),
                            label: Text('Open'),
                          ),
                          ButtonSegment(
                            value: 'closing',
                            icon: Icon(Icons.schedule),
                            label: Text('Closing'),
                          ),
                          ButtonSegment(
                            value: 'closed',
                            icon: Icon(Icons.lock),
                            label: Text('Closed'),
                          ),
                        ],
                        selected: {status},
                        onSelectionChanged: _busy
                            ? null
                            : (v) => _status(v.first),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: SwitchListTile(
                  value: locked,
                  onChanged: _busy ? null : (v) => _lock(v, data),
                  secondary: Icon(
                    locked ? Icons.phonelink_lock : Icons.devices,
                    color: locked ? Colors.red : OmluColors.statusAvailable,
                  ),
                  title: const Text('Staff operational lock'),
                  subtitle: Text(
                    locked
                        ? 'Staff operations are locked${data['reason'] == null ? '' : ': ${data['reason']}'}'
                        : 'Staff can use operational screens',
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text('Current workload', style: OmluTypography.h2),
              GridView.count(
                crossAxisCount: MediaQuery.sizeOf(context).width >= 700 ? 3 : 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 1.8,
                children: [
                  for (final metric in [
                    ('Active sessions', 'active_sessions'),
                    ('Unserved orders', 'unserved_orders'),
                    ('Requests', 'pending_requests'),
                    ('Bills awaiting', 'bills_waiting_for_payment'),
                    ('Occupied tables', 'occupied_tables'),
                  ])
                    Card(
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${data[metric.$2] ?? 0}',
                              style: OmluTypography.h2,
                            ),
                            Text(metric.$1, textAlign: TextAlign.center),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              const ListTile(
                leading: Icon(Icons.admin_panel_settings_outlined),
                title: Text('Platform recovery actions are not available here'),
                subtitle: Text(
                  'Cross-tenant and platform-superadmin recovery remains intentionally excluded from the restaurant app.',
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
