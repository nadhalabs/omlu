import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/models/role_session.dart';
import '../features/auth_provider.dart';
import '../src/omlu_webview_app.dart';
import 'app.dart';

// Placeholder screen imports (these will be updated when the features are built)
import '../features/staff/staff_shell.dart';
import '../features/kitchen/kitchen_screen.dart';
import '../features/owner/owner_screen.dart';
import '../features/admin/admin_screen.dart';
import '../features/onboarding/role_guide.dart';
import '../features/staff/staff_lock_screen.dart';

class RoleRouter extends ConsumerWidget {
  const RoleRouter({required this.session, super.key});

  final RoleSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final useWebView = ref.watch(webViewFallbackProvider);

    if (useWebView) {
      final config = ref.read(appConfigProvider);
      return OmluWebViewShell(config: config);
    }

    return switch (session.role) {
      StaffRole.staff => StaffAccessGate(
        child: RoleGuideGate(session: session, child: const StaffShell()),
      ),
      StaffRole.kitchen => RoleGuideGate(session: session, child: const KitchenScreen()),
      StaffRole.owner => const OwnerScreen(),
      StaffRole.admin => const AdminScreen(),
    };
  }
}
