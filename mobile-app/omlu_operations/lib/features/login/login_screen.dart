import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/radius.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_text_field.dart';
import '../auth_provider.dart';
import 'package:url_launcher/url_launcher.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.errorMessage});

  final String? errorMessage;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _slugController = TextEditingController();
  final _loginController = TextEditingController();
  final _passwordController = TextEditingController();

  String? _localError;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _localError = widget.errorMessage;
  }

  @override
  void dispose() {
    _slugController.dispose();
    _loginController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _localError = null;
    });

    try {
      await ref
          .read(authProvider.notifier)
          .login(
            restaurantSlug: _slugController.text.trim(),
            login: _loginController.text.trim(),
            password: _passwordController.text,
          );
    } catch (e) {
      if (mounted) {
        setState(() {
          _localError = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: OmluColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(OmluSpacing.lg),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header/Logo
                const Icon(
                  Icons.restaurant_rounded,
                  size: 64,
                  color: OmluColors.accent,
                ),
                const SizedBox(height: OmluSpacing.md),
                Text(
                  'OMLU',
                  style: OmluTypography.h1.copyWith(
                    color: OmluColors.textPrimary,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: OmluSpacing.xs),
                Text(
                  'Restaurant Login',
                  style: OmluTypography.bodyMedium.copyWith(
                    color: OmluColors.textSecondary,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: OmluSpacing.xl),

                // Login Form Card
                OmluCard(
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_localError != null) ...[
                          Container(
                            padding: const EdgeInsets.all(OmluSpacing.md),
                            decoration: BoxDecoration(
                              color: Colors.red.shade50,
                              borderRadius: OmluRadius.borderMd,
                              border: Border.all(color: Colors.red.shade200),
                            ),
                            child: Text(
                              _localError!,
                              style: OmluTypography.bodySmall.copyWith(
                                color: Colors.red.shade900,
                              ),
                            ),
                          ),
                          const SizedBox(height: OmluSpacing.md),
                        ],
                        OmluTextField(
                          label: 'Restaurant username',
                          controller: _slugController,
                          hintText: 'nadha-cafe',
                          validator: (val) {
                            if (val == null || val.trim().isEmpty) {
                              return 'Restaurant username is required';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: OmluSpacing.md),
                        OmluTextField(
                          label: 'Personal username',
                          controller: _loginController,
                          hintText: 'e.g. nadha',
                          validator: (val) {
                            if (val == null || val.trim().isEmpty) {
                              return 'Personal username is required';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: OmluSpacing.xs),
                        Text(
                          'Use the username and 6-digit PIN given by your restaurant manager.',
                          style: OmluTypography.bodySmall.copyWith(color: OmluColors.textSecondary),
                        ),
                        const SizedBox(height: OmluSpacing.md),
                        OmluTextField(
                          label: '6-digit PIN',
                          controller: _passwordController,
                          hintText: '••••••',
                          obscureText: true,
                          textInputAction: TextInputAction.done,
                          validator: (val) {
                            if (val == null || val.isEmpty) {
                              return 'PIN is required';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: OmluSpacing.lg),
                        OmluButton(
                          text: 'Login',
                          isLoading: _submitting,
                          onPressed: _submit,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: OmluSpacing.xl),

                TextButton(
                  onPressed: () => launchUrl(Uri.parse('https://omlu.vercel.app/register')),
                  child: const Text('New to OMLU? Create Restaurant'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
