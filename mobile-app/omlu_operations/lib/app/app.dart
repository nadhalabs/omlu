import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../design_system/colors.dart';
import '../design_system/typography.dart';
import '../features/auth_provider.dart';
import '../features/login/login_screen.dart';
import 'role_router.dart';

final webViewFallbackProvider = StateProvider<bool>((ref) => false);

class OmluNativeApp extends ConsumerWidget {
  const OmluNativeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    return MaterialApp(
      title: 'OMLU',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        scaffoldBackgroundColor: OmluColors.background,
        primaryColor: OmluColors.accent,
        colorScheme: ColorScheme.fromSeed(
          seedColor: OmluColors.accent,
          primary: OmluColors.accent,
          surface: OmluColors.background,
        ),
        useMaterial3: true,
      ),
      home: authState.when(
        data: (session) {
          if (session == null) {
            return const LoginScreen();
          }
          return RoleRouter(session: session);
        },
        loading: () => const SplashScreen(message: 'Restoring session...'),
        error: (err, st) => LoginScreen(errorMessage: err.toString()),
      ),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({required this.message, super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OmluColors.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(OmluColors.accent),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              style: OmluTypography.bodyMedium.copyWith(
                color: OmluColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
