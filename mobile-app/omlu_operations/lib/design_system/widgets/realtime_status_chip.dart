import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/realtime/realtime_client.dart';
import '../../features/realtime_connection_provider.dart';
import '../colors.dart';
import '../radius.dart';
import '../typography.dart';

class RealtimeStatusChip extends ConsumerWidget {
  const RealtimeStatusChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(realtimeStateStreamProvider).valueOrNull;
    final (label, color) = switch (state) {
      RealtimeConnectionState.connected => ('Live', OmluColors.statusAvailable),
      RealtimeConnectionState.connecting => (
        'Syncing',
        OmluColors.statusOrdering,
      ),
      RealtimeConnectionState.reconnecting => (
        'Reconnecting',
        OmluColors.statusPreparing,
      ),
      _ => ('Offline', OmluColors.textSecondary),
    };
    return Semantics(
      label: 'Realtime connection $label',
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: OmluRadius.borderCircular,
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: OmluTypography.label.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
