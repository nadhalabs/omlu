import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exceptions.dart';
import '../../core/models/role_session.dart';
import '../../core/storage/key_value_storage.dart';
import '../../design_system/colors.dart';
import '../../design_system/radius.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../../design_system/widgets/omlu_text_field.dart';
import '../auth_provider.dart';

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
  final KeyValueStorage _preferenceStorage = SecureKeyValueStorage();

  EntryMode _entryMode = EntryMode.ownerAdmin;
  String? _localError;
  bool _submitting = false;
  bool _obscurePassword = true;

  static const _lastModeStorageKey = 'omlu_last_entry_mode';

  @override
  void initState() {
    super.initState();
    _localError = widget.errorMessage;
    _loadLastEntryMode();
  }

  Future<void> _loadLastEntryMode() async {
    final savedMode = await _preferenceStorage.read(_lastModeStorageKey);
    if (savedMode != null && mounted) {
      final mode = EntryMode.values.firstWhere(
        (m) => m.name == savedMode,
        orElse: () => EntryMode.ownerAdmin,
      );
      setState(() {
        _entryMode = mode;
      });
    }
  }

  @override
  void dispose() {
    _slugController.dispose();
    _loginController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String get _modeDescription => switch (_entryMode) {
    EntryMode.ownerAdmin =>
      'Billing, payments, printer setup and restaurant operations.',
    EntryMode.staffPin => 'Tables, orders and customer service.',
    EntryMode.kitchenDevice => 'Receive and update kitchen tickets.',
  };

  String get _usernameLabel => switch (_entryMode) {
    EntryMode.ownerAdmin => 'Username or Email',
    EntryMode.staffPin => 'Staff username',
    EntryMode.kitchenDevice => 'Kitchen username',
  };

  String get _usernameHint => switch (_entryMode) {
    EntryMode.ownerAdmin => 'e.g. owner@example.com or owner1',
    EntryMode.staffPin => 'e.g. nadha',
    EntryMode.kitchenDevice => 'e.g. kitchen-pos',
  };

  String get _passwordLabel => switch (_entryMode) {
    EntryMode.ownerAdmin => 'Password',
    EntryMode.staffPin => '6-digit PIN',
    EntryMode.kitchenDevice => '6-digit PIN',
  };

  String get _passwordHint => switch (_entryMode) {
    EntryMode.ownerAdmin => '••••••••',
    EntryMode.staffPin || EntryMode.kitchenDevice => '••••••',
  };

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _localError = null;
    });

    try {
      await ref.read(authProvider.notifier).login(
        restaurantSlug: _slugController.text.trim(),
        login: _loginController.text.trim(),
        password: _passwordController.text,
        entryMode: _entryMode,
      );
      await _preferenceStorage.write(_lastModeStorageKey, _entryMode.name);
    } catch (e) {
      if (mounted) {
        final errStr = e.toString();
        String displayMsg;
        if (e is AuthenticationException) {
          displayMsg = e.message;
        } else if (errStr.contains('Invalid restaurant credentials') ||
            errStr.contains('401') ||
            errStr.contains('Malformed login response')) {
          displayMsg = 'The email/username or password is incorrect.';
        } else if (errStr.contains('suspended') || errStr.contains('inactive')) {
          displayMsg =
              'This account is currently unavailable. Contact the restaurant owner.';
        } else if (errStr.contains('SocketException') ||
            errStr.contains('connection')) {
          displayMsg =
              'Could not connect to OMLU. Check the connection and try again.';
        } else {
          displayMsg = 'The email/username or password is incorrect.';
        }
        setState(() {
          _localError = displayMsg;
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
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(
                    Icons.restaurant_rounded,
                    size: 56,
                    color: OmluColors.accent,
                  ),
                  const SizedBox(height: OmluSpacing.sm),
                  Text(
                    'OMLU Operations',
                    style: OmluTypography.h1.copyWith(
                      color: OmluColors.textPrimary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: OmluSpacing.lg),

                  // Mode Selector Tabs
                  SegmentedButton<EntryMode>(
                    segments: const [
                      ButtonSegment(
                        value: EntryMode.ownerAdmin,
                        label: Text('Owner / Admin'),
                        icon: Icon(Icons.admin_panel_settings_rounded),
                      ),
                      ButtonSegment(
                        value: EntryMode.staffPin,
                        label: Text('Staff PIN'),
                        icon: Icon(Icons.badge_rounded),
                      ),
                      ButtonSegment(
                        value: EntryMode.kitchenDevice,
                        label: Text('Kitchen'),
                        icon: Icon(Icons.soup_kitchen_rounded),
                      ),
                    ],
                    selected: {_entryMode},
                    onSelectionChanged: (selected) {
                      setState(() {
                        _entryMode = selected.first;
                        _localError = null;
                      });
                    },
                  ),
                  const SizedBox(height: OmluSpacing.md),

                  // Mode Explanation Card
                  Container(
                    padding: const EdgeInsets.all(OmluSpacing.md),
                    decoration: BoxDecoration(
                      color: OmluColors.accentSoft.withValues(alpha: 0.3),
                      borderRadius: OmluRadius.borderMd,
                      border: Border.all(
                        color: OmluColors.accent.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Text(
                      _modeDescription,
                      style: OmluTypography.bodyMedium.copyWith(
                        color: OmluColors.textPrimary,
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: OmluSpacing.md),

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
                                  fontWeight: FontWeight.w600,
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
                            label: _usernameLabel,
                            controller: _loginController,
                            hintText: _usernameHint,
                            validator: (val) {
                              if (val == null || val.trim().isEmpty) {
                                return '$_usernameLabel is required';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: OmluSpacing.md),
                          OmluTextField(
                            label: _passwordLabel,
                            controller: _passwordController,
                            hintText: _passwordHint,
                            obscureText: _entryMode == EntryMode.ownerAdmin
                                ? _obscurePassword
                                : true,
                            textInputAction: TextInputAction.done,
                            suffixIcon: _entryMode == EntryMode.ownerAdmin
                                ? IconButton(
                                    icon: Icon(
                                      _obscurePassword
                                          ? Icons.visibility_off_rounded
                                          : Icons.visibility_rounded,
                                      color: OmluColors.textSecondary,
                                    ),
                                    onPressed: () {
                                      setState(() {
                                        _obscurePassword = !_obscurePassword;
                                      });
                                    },
                                  )
                                : null,
                            validator: (val) {
                              if (val == null || val.isEmpty) {
                                return '$_passwordLabel is required';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: OmluSpacing.lg),
                          OmluButton(
                            text: 'Sign In',
                            isLoading: _submitting,
                            onPressed: _submit,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: OmluSpacing.xl),

                  TextButton(
                    onPressed: () => launchUrl(
                      Uri.parse('https://omlu.vercel.app/register'),
                    ),
                    child: const Text('New to OMLU? Create Restaurant'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
