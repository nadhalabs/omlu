import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';
import 'settings_management_screen.dart';

final kitchenPrintJobsProvider =
    FutureProvider.family<List<Map<String, Object?>>, String?>((
      ref,
      status,
    ) async {
      ref.watch(authProvider).valueOrNull?.tenantScope;
      final values = await ref
          .watch(operationsApiProvider)
          .fetchKitchenPrintJobs(status: status);
      return [
        for (final value in values) Map<String, Object?>.from(value as Map),
      ];
    });

class PrintBridgeAdminScreen extends ConsumerStatefulWidget {
  const PrintBridgeAdminScreen({super.key});
  @override
  ConsumerState<PrintBridgeAdminScreen> createState() =>
      _PrintBridgeAdminScreenState();
}

class _PrintBridgeAdminScreenState
    extends ConsumerState<PrintBridgeAdminScreen> {
  String? _status;
  Map<String, Object?>? _selected;
  final Set<int> _retrying = {};
  void _refresh() {
    ref.invalidate(printInstallationsProvider);
    ref.invalidate(kitchenPrintJobsProvider);
  }

  Future<void> _retry(int id) async {
    if (_retrying.contains(id)) return;
    setState(() => _retrying.add(id));
    try {
      await ref.read(operationsApiProvider).retryKitchenPrintJob(id);
      _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
    } finally {
      if (mounted) setState(() => _retrying.remove(id));
    }
  }

  Future<void> _revoke(Map<String, Object?> bridge) async {
    final id = '${bridge['installation_id'] ?? ''}';
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Revoke Print Bridge?'),
        content: const Text(
          'This installation will immediately lose printer authorization. It must complete secure pairing again before printing.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Revoke'),
          ),
        ],
      ),
    );
    if (ok != true || id.isEmpty) return;
    try {
      await ref.read(operationsApiProvider).revokePrintBridgeInstallation(id);
      _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final installations = ref.watch(printInstallationsProvider);
    final jobs = ref.watch(kitchenPrintJobsProvider(_status));
    final wide = useSplitView(MediaQuery.sizeOf(context).width);
    final list = ListView(
      padding: const EdgeInsets.all(OmluSpacing.md),
      children: [
        Text('Installations', style: OmluTypography.h2),
        installations.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text(userFacingError(e)),
          data: (items) => items.isEmpty
              ? const Card(
                  child: ListTile(
                    title: Text('No Print Bridge paired'),
                    subtitle: Text(
                      'Initial pairing remains in the trusted desktop/browser bridge flow.',
                    ),
                  ),
                )
              : Column(
                  children: [
                    for (final bridge in items)
                      Card(
                        child: ListTile(
                          onTap: () {
                            if (wide) {
                              setState(() => _selected = bridge);
                            } else {
                              Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => _BridgeDetail(
                                    bridge: bridge,
                                    revoke: () => _revoke(bridge),
                                  ),
                                ),
                              );
                            }
                          },
                          leading: Icon(
                            bridge['status'] == 'paired'
                                ? Icons.check_circle
                                : Icons.link_off,
                            color: bridge['status'] == 'paired'
                                ? OmluColors.statusAvailable
                                : Colors.orange,
                          ),
                          title: Text(
                            '${bridge['device_name'] ?? bridge['installation_id'] ?? 'Print Bridge'}',
                          ),
                          subtitle: Text(
                            '${bridge['status'] ?? 'unknown'} · Last used ${bridge['last_used_at'] ?? 'never'}',
                          ),
                          trailing: const Icon(Icons.chevron_right),
                        ),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Text('Kitchen print jobs', style: OmluTypography.h2),
            ),
            DropdownButton<String?>(
              value: _status,
              hint: const Text('All'),
              items: const [
                DropdownMenuItem(value: null, child: Text('All')),
                DropdownMenuItem(value: 'failed', child: Text('Failed')),
                DropdownMenuItem(value: 'pending', child: Text('Pending')),
                DropdownMenuItem(value: 'printed', child: Text('Printed')),
              ],
              onChanged: (v) => setState(() => _status = v),
            ),
          ],
        ),
        jobs.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text(userFacingError(e)),
          data: (items) => items.isEmpty
              ? const Card(
                  child: ListTile(title: Text('No print jobs in this view.')),
                )
              : Column(
                  children: [
                    for (final job in items)
                      Card(
                        child: ListTile(
                          leading: Icon(
                            job['status'] == 'failed'
                                ? Icons.error
                                : job['status'] == 'printed'
                                ? Icons.check_circle
                                : Icons.schedule,
                            color: job['status'] == 'failed'
                                ? Colors.red
                                : null,
                          ),
                          title: Text(
                            'Kitchen job #${job['id']} · ${job['document_type'] ?? 'ticket'}',
                          ),
                          subtitle: Text(
                            '${job['status']} · retries ${job['retry_count'] ?? 0}${job['failure_message'] == null ? '' : '\n${job['failure_message']}'}',
                          ),
                          trailing: job['status'] == 'failed'
                              ? FilledButton.tonal(
                                  onPressed: _retrying.contains(job['id'])
                                      ? null
                                      : () => _retry(job['id'] as int),
                                  child: Text(
                                    _retrying.contains(job['id'])
                                        ? 'Retrying…'
                                        : 'Retry',
                                  ),
                                )
                              : null,
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('Print Bridge administration'),
        actions: [
          IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: wide
          ? Row(
              children: [
                Expanded(flex: 3, child: list),
                const VerticalDivider(width: 1),
                Expanded(
                  flex: 2,
                  child: _selected == null
                      ? const Center(child: Text('Select an installation.'))
                      : _BridgeDetail(
                          bridge: _selected!,
                          revoke: () => _revoke(_selected!),
                        ),
                ),
              ],
            )
          : list,
    );
  }
}

class _BridgeDetail extends StatelessWidget {
  const _BridgeDetail({required this.bridge, required this.revoke});
  final Map<String, Object?> bridge;
  final VoidCallback revoke;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(OmluSpacing.lg),
    children: [
      Text(
        '${bridge['device_name'] ?? 'Print Bridge'}',
        style: OmluTypography.h1,
      ),
      for (final entry in bridge.entries)
        if (!entry.key.toLowerCase().contains('credential'))
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(entry.key.replaceAll('_', ' ')),
            trailing: SizedBox(
              width: 180,
              child: Text('${entry.value ?? '—'}', textAlign: TextAlign.end),
            ),
          ),
      const SizedBox(height: 16),
      FilledButton.tonalIcon(
        onPressed: bridge['status'] == 'revoked' ? null : revoke,
        icon: const Icon(Icons.link_off),
        label: const Text('Revoke installation'),
      ),
      const Padding(
        padding: EdgeInsets.only(top: 12),
        child: Text(
          'Secure pairing and re-pairing require the existing Print Bridge challenge flow and are intentionally not reimplemented in Flutter.',
        ),
      ),
    ],
  );
}
