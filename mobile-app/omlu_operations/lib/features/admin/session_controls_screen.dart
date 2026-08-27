import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../auth_provider.dart';
import '../staff/tables_provider.dart';

final activeSessionsProvider = FutureProvider<List<Object?>>((ref) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return ref.watch(operationsApiProvider).fetchActiveSessions();
});

final sessionParticipantsProvider =
    FutureProvider.family<Map<String, Object?>, String>((ref, token) {
      ref.watch(authProvider).valueOrNull?.tenantScope;
      return ref.watch(operationsApiProvider).fetchSessionParticipants(token);
    });

class SessionControlsScreen extends ConsumerStatefulWidget {
  const SessionControlsScreen({super.key});

  @override
  ConsumerState<SessionControlsScreen> createState() =>
      _SessionControlsScreenState();
}

class _SessionControlsScreenState extends ConsumerState<SessionControlsScreen> {
  String? _selectedToken;
  final Set<String> _busy = {};

  Future<void> _run(String key, Future<void> Function() action) async {
    if (_busy.contains(key)) return;
    setState(() => _busy.add(key));
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(error))));
      }
    } finally {
      if (mounted) setState(() => _busy.remove(key));
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessions = ref.watch(activeSessionsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dining sessions', style: OmluTypography.h2),
        actions: [
          IconButton(
            tooltip: 'Refresh sessions',
            onPressed: () => ref.invalidate(activeSessionsProvider),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: sessions.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(
          message: userFacingError(error),
          onRetry: () => ref.invalidate(activeSessionsProvider),
        ),
        data: (raw) {
          final items = [
            for (final value in raw)
              if (value is Map) Map<String, Object?>.from(value),
          ];
          if (items.isEmpty) {
            return const Center(child: Text('No active dining sessions.'));
          }
          final wide = useSplitView(MediaQuery.sizeOf(context).width);
          final selected = items.where((item) {
            return _token(item) == _selectedToken;
          }).firstOrNull;
          final list = _SessionList(
            items: items,
            selectedToken: _selectedToken,
            onSelected: (item) {
              final token = _token(item);
              if (wide) {
                setState(() => _selectedToken = token);
              } else {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        _SessionDetail(item: item, busy: _busy, run: _run),
                  ),
                );
              }
            },
          );
          if (!wide) return list;
          return Row(
            children: [
              SizedBox(width: 360, child: list),
              const VerticalDivider(width: 1),
              Expanded(
                child: selected == null
                    ? const Center(
                        child: Text('Select a session to manage it.'),
                      )
                    : _SessionDetail(item: selected, busy: _busy, run: _run),
              ),
            ],
          );
        },
      ),
    );
  }
}

String _token(Map<String, Object?> item) =>
    (item['session_token'] ?? item['public_token'] ?? '').toString();

class _SessionList extends StatelessWidget {
  const _SessionList({
    required this.items,
    required this.onSelected,
    this.selectedToken,
  });
  final List<Map<String, Object?>> items;
  final String? selectedToken;
  final ValueChanged<Map<String, Object?>> onSelected;

  @override
  Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.all(OmluSpacing.md),
    itemCount: items.length,
    separatorBuilder: (_, _) => const SizedBox(height: OmluSpacing.sm),
    itemBuilder: (_, index) {
      final item = items[index];
      final token = _token(item);
      return OmluCard(
        onTap: () => onSelected(item),
        child: ListTile(
          selected: token == selectedToken,
          contentPadding: EdgeInsets.zero,
          leading: const CircleAvatar(
            child: Icon(Icons.table_restaurant_rounded),
          ),
          title: Text(
            'Table ${item['table_number'] ?? '—'}',
            style: OmluTypography.h3,
          ),
          subtitle: Text(
            '${item['status'] ?? 'active'} · ${item['participant_count'] ?? 0} customers',
          ),
          trailing: const Icon(Icons.chevron_right_rounded),
        ),
      );
    },
  );
}

class _SessionDetail extends ConsumerWidget {
  const _SessionDetail({
    required this.item,
    required this.busy,
    required this.run,
  });
  final Map<String, Object?> item;
  final Set<String> busy;
  final Future<void> Function(String, Future<void> Function()) run;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final token = _token(item);
    final participants = ref.watch(sessionParticipantsProvider(token));
    return Scaffold(
      appBar: AppBar(title: Text('Table ${item['table_number'] ?? '—'}')),
      body: participants.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(
          message: userFacingError(error),
          onRetry: () => ref.invalidate(sessionParticipantsProvider(token)),
        ),
        data: (data) {
          final people = data['participants'] as List? ?? const [];
          return ListView(
            padding: const EdgeInsets.all(OmluSpacing.md),
            children: [
              OmluCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Customer join code', style: OmluTypography.label),
                    const SizedBox(height: OmluSpacing.xs),
                    SelectableText(
                      '${data['join_code'] ?? '—'}',
                      style: OmluTypography.h1,
                    ),
                    const SizedBox(height: OmluSpacing.sm),
                    OutlinedButton.icon(
                      onPressed: busy.contains('rotate')
                          ? null
                          : () => run('rotate', () async {
                              await ref
                                  .read(operationsApiProvider)
                                  .rotateSessionJoinCode(token);
                              ref.invalidate(
                                sessionParticipantsProvider(token),
                              );
                            }),
                      icon: const Icon(Icons.sync_lock_rounded),
                      label: const Text('Rotate join code'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: OmluSpacing.md),
              Text(
                'Connected customers (${people.length})',
                style: OmluTypography.h3,
              ),
              const SizedBox(height: OmluSpacing.sm),
              for (final value in people)
                if (value is Map)
                  Card(
                    child: ListTile(
                      title: Text('${value['label'] ?? 'Customer device'}'),
                      subtitle: Text(
                        value['revoked_at'] == null
                            ? 'Connected'
                            : 'Access revoked',
                      ),
                      trailing: value['revoked_at'] != null
                          ? null
                          : TextButton(
                              onPressed: busy.contains('${value['public_id']}')
                                  ? null
                                  : () => run('${value['public_id']}', () async {
                                      await ref
                                          .read(operationsApiProvider)
                                          .revokeSessionParticipant(
                                            sessionToken: token,
                                            participantId:
                                                '${value['public_id']}',
                                            reason:
                                                'Revoked by restaurant administrator',
                                          );
                                      ref.invalidate(
                                        sessionParticipantsProvider(token),
                                      );
                                    }),
                              child: const Text('Revoke'),
                            ),
                    ),
                  ),
              const SizedBox(height: OmluSpacing.lg),
              OutlinedButton.icon(
                onPressed: busy.contains('close')
                    ? null
                    : () => run('close', () async {
                        await ref
                            .read(operationsApiProvider)
                            .closeEmptySession(token);
                        ref.invalidate(activeSessionsProvider);
                        await ref
                            .read(tablesProvider.notifier)
                            .fetchTables(silent: true);
                        if (context.mounted && Navigator.of(context).canPop()) {
                          Navigator.of(context).pop();
                        }
                      }),
                icon: const Icon(Icons.event_seat_outlined),
                label: const Text('Close empty session'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(OmluSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.cloud_off_rounded,
            size: 48,
            color: OmluColors.textSecondary,
          ),
          const SizedBox(height: OmluSpacing.sm),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: OmluSpacing.md),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    ),
  );
}
