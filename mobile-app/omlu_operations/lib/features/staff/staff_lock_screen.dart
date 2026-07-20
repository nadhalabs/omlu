import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../auth_provider.dart';
import 'staff_access_provider.dart';
import 'staff_shell.dart';

class StaffAccessGate extends ConsumerWidget {
  const StaffAccessGate({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final access = ref.watch(staffAccessProvider);
    ref.listen(staffAccessProvider, (previous, next) {
      if (next.operationsRestored && !next.loading) {
        ref.read(staffTabProvider.notifier).state = 0;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Staff operations restored')),
            );
            ref.read(staffAccessProvider.notifier).acknowledgeRestoreMessage();
          }
        });
      }
    });

    if (access.loading && !access.locked) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (access.locked) return StaffLockScreen(access: access);
    return child;
  }
}

class StaffLockScreen extends ConsumerWidget {
  const StaffLockScreen({required this.access, super.key});

  final StaffAccessState access;

  String get _title => switch (access.kind) {
    StaffLockKind.restaurantClosed => 'Restaurant operations are closed',
    StaffLockKind.global => 'Restaurant Staff operations are locked',
    StaffLockKind.individual => 'Staff operations are locked',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lockedAt = access.lockedAt;
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: OmluColors.background,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('OMLU Staff', style: OmluTypography.h2),
                    const SizedBox(height: OmluSpacing.xxl),
                    const Icon(Icons.lock_rounded, size: 72, color: OmluColors.accent),
                    const SizedBox(height: OmluSpacing.lg),
                    Text(_title, textAlign: TextAlign.center, style: OmluTypography.h1),
                    const SizedBox(height: OmluSpacing.md),
                    Text(
                      'Operational actions are currently disabled.',
                      textAlign: TextAlign.center,
                      style: OmluTypography.bodyLarge,
                    ),
                    const SizedBox(height: OmluSpacing.lg),
                    if (access.lockedBy != null)
                      _DetailRow(label: 'Locked by', value: access.lockedBy!),
                    if (access.reason != null)
                      _DetailRow(label: 'Reason', value: access.reason!),
                    if (lockedAt != null)
                      _DetailRow(
                        label: 'Locked at',
                        value: TimeOfDay.fromDateTime(lockedAt.toLocal()).format(context),
                      ),
                    const SizedBox(height: OmluSpacing.lg),
                    Text(
                      'Contact the restaurant owner or administrator.',
                      textAlign: TextAlign.center,
                      style: OmluTypography.bodyMedium.copyWith(color: OmluColors.textSecondary),
                    ),
                    const SizedBox(height: OmluSpacing.xl),
                    OmluButton(
                      text: access.loading ? 'Refreshing…' : 'Refresh status',
                      isLoading: access.loading,
                      onPressed: () => ref.read(staffAccessProvider.notifier).refreshAuthoritative(),
                    ),
                    const SizedBox(height: OmluSpacing.sm),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      onPressed: access.loading ? null : () => ref.read(authProvider.notifier).logout(),
                      child: const Text('Sign out'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: OmluSpacing.xs),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 92, child: Text('$label:', style: OmluTypography.label)),
        Expanded(child: Text(value, style: OmluTypography.bodyMedium)),
      ],
    ),
  );
}
