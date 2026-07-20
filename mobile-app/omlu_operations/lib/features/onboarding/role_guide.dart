import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/models/role_session.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';

const _storage = FlutterSecureStorage();

List<String> guideSteps(StaffRole role) => role == StaffRole.kitchen
    ? ['Check new orders', 'Tap Start Preparing', 'Tap Mark Ready']
    : ['Open a table', 'Add or check orders', 'Serve food and send the bill to the counter'];

Future<void> showRoleHelp(BuildContext context, StaffRole role) {
  final sections = role == StaffRole.kitchen
      ? const {
          'How to start preparing': ['Open New.', 'Check the items and notes.', 'Tap Start Preparing.'],
          'How to mark an order ready': ['Open Preparing.', 'Check every item is complete.', 'Tap Mark Ready.'],
          'If the internet disconnects': ['Keep the current screen open.', 'Wait for Live to return.', 'Tap Retry if the board does not refresh.'],
        }
      : const {
          'How to add an order': ['Open Tables and choose a table.', 'Choose items and quantities.', 'Review, then tap Send to Kitchen.'],
          'How to mark food served': ['Open the table with Food Ready.', 'Check the ready items.', 'Tap Mark Served.'],
          'How to respond to a request': ['Open Requests.', 'Help the customer.', 'Tap Resolve.'],
          'How to send a bill to the counter': ['Open the table and View Bill.', 'Check the amount due.', 'Tap Send Bill to Counter.'],
        };
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          Text('${role == StaffRole.kitchen ? 'Kitchen' : 'Staff'} Help', style: OmluTypography.h1),
          const SizedBox(height: OmluSpacing.md),
          for (final section in sections.entries) ...[
            Text(section.key, style: OmluTypography.h2),
            const SizedBox(height: OmluSpacing.xs),
            for (var i = 0; i < section.value.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('${i + 1}. ${section.value[i]}', style: OmluTypography.bodyMedium),
              ),
            const SizedBox(height: OmluSpacing.md),
          ],
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: OmluColors.accent),
            onPressed: () => Navigator.pop(context),
            child: const Text('Done'),
          ),
        ],
      ),
    ),
  );
}

class RoleGuideGate extends StatefulWidget {
  const RoleGuideGate({required this.session, required this.child, super.key});

  final RoleSession session;
  final Widget child;

  @override
  State<RoleGuideGate> createState() => _RoleGuideGateState();
}

class _RoleGuideGateState extends State<RoleGuideGate> {
  int? _page;
  late final String _key;

  @override
  void initState() {
    super.initState();
    _key = 'guide_v1_${widget.session.restaurantSlug}_${widget.session.profile.username ?? widget.session.profile.email}_${widget.session.role.name}';
    _load();
  }

  Future<void> _load() async {
    try {
      final seen = await _storage.read(key: _key);
      if (mounted) setState(() => _page = seen == 'done' ? -1 : 0);
    } catch (_) {
      if (mounted) setState(() => _page = -1);
    }
  }

  Future<void> _finish() async {
    setState(() => _page = -1);
    try { await _storage.write(key: _key, value: 'done'); } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_page == null || _page == -1) return widget.child;
    final steps = guideSteps(widget.session.role);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(alignment: Alignment.centerRight, child: TextButton(onPressed: _finish, child: const Text('Skip'))),
              const Spacer(),
              Icon(widget.session.role == StaffRole.kitchen ? Icons.soup_kitchen_rounded : Icons.table_restaurant_rounded, size: 72, color: OmluColors.accent),
              const SizedBox(height: OmluSpacing.lg),
              Text('${_page! + 1}. ${steps[_page!]}', textAlign: TextAlign.center, style: OmluTypography.h1),
              const SizedBox(height: OmluSpacing.md),
              Text(widget.session.role == StaffRole.kitchen ? 'OMLU Kitchen keeps every order moving.' : 'OMLU Staff keeps table service simple.', textAlign: TextAlign.center, style: OmluTypography.bodyMedium),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: OmluColors.accent),
                onPressed: _page == steps.length - 1 ? _finish : () => setState(() => _page = _page! + 1),
                child: Text(_page == steps.length - 1 ? 'Start using OMLU' : 'Next'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
