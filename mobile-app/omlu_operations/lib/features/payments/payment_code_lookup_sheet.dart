import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design_system/colors.dart';
import '../../core/errors/user_facing_error.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../../design_system/widgets/omlu_button.dart';
import '../../design_system/widgets/omlu_card.dart';
import '../auth_provider.dart';
import 'pending_bill_review_screen.dart';

class PaymentCodeLookupSheet extends ConsumerStatefulWidget {
  const PaymentCodeLookupSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: OmluColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const PaymentCodeLookupSheet(),
    );
  }

  @override
  ConsumerState<PaymentCodeLookupSheet> createState() =>
      _PaymentCodeLookupSheetState();
}

class _PaymentCodeLookupSheetState
    extends ConsumerState<PaymentCodeLookupSheet> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  bool _loading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onCodeChanged);
  }

  @override
  void dispose() {
    _controller.removeListener(_onCodeChanged);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onCodeChanged() {
    if (_errorMessage != null) {
      setState(() => _errorMessage = null);
    } else {
      setState(() {});
    }
  }

  String get _normalizedCode =>
      _controller.text
          .replaceAll(
            RegExp(r'[^2346789ABCDEFGHJKLMNPQRTUVWXYZ]', caseSensitive: false),
            '',
          )
          .toUpperCase();

  bool get _isValidLength =>
      RegExp(r'^[2346789ABCDEFGHJKLMNPQRTUVWXYZ]{6}$')
          .hasMatch(_normalizedCode);

  Future<void> _submit() async {
    if (!_isValidLength || _loading) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final api = ref.read(operationsApiProvider);
      final result = await api.lookupPendingPaymentCode(_normalizedCode);
      if (!mounted) return;
      Navigator.of(context).pop();

      // Navigate to the full pending bill review screen
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => PendingBillReviewScreen(
            billNumber: result.billNumber,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorMessage = userFacingError(error);
      });
    }
  }

  void _clear() {
    _controller.clear();
    setState(() => _errorMessage = null);
    _focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final charCount = _normalizedCode.length;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        OmluSpacing.md,
        0,
        OmluSpacing.md,
        OmluSpacing.md + bottomInset,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.qr_code_scanner_rounded,
                color: OmluColors.accent,
                size: 28,
              ),
              const SizedBox(width: OmluSpacing.sm),
              const Expanded(
                child: Text('Enter payment code', style: OmluTypography.h2),
              ),
            ],
          ),
          const SizedBox(height: OmluSpacing.xs),
          const Text(
            'Ask the customer for the 6-character code shown on their bill.',
            style: OmluTypography.bodyMedium,
          ),
          const SizedBox(height: OmluSpacing.lg),

          // 6-Character Input Container
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: _errorMessage != null
                    ? Colors.red
                    : _focusNode.hasFocus
                        ? OmluColors.accent
                        : OmluColors.borderStrong,
                width: _focusNode.hasFocus || _errorMessage != null ? 2 : 1,
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    autofocus: true,
                    textCapitalization: TextCapitalization.characters,
                    keyboardType: TextInputType.text,
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => _submit(),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                        RegExp(r'[2346789ABCDEFGHJKLMNPQRTUVWXYZabcdefghjklmnpqrtuvwxyz\s\-]'),
                      ),
                      LengthLimitingTextInputFormatter(10),
                    ],
                    style: OmluTypography.h1.copyWith(
                      letterSpacing: 6.0,
                      fontFamily: 'monospace',
                      color: OmluColors.accentDark,
                    ),
                    decoration: const InputDecoration(
                      hintText: 'ABC234',
                      hintStyle: TextStyle(
                        color: OmluColors.disabledText,
                        letterSpacing: 6.0,
                      ),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                if (charCount > 0)
                  IconButton(
                    icon: const Icon(Icons.cancel_rounded, color: OmluColors.textSecondary),
                    onPressed: _clear,
                    tooltip: 'Clear code',
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _isValidLength
                        ? OmluColors.statusAvailable.withValues(alpha: 0.12)
                        : OmluColors.surfaceMuted,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '$charCount / 6',
                    style: OmluTypography.bodySmall.copyWith(
                      fontWeight: FontWeight.bold,
                      color: _isValidLength
                          ? OmluColors.statusAvailable
                          : OmluColors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),

          if (_errorMessage != null) ...[
            const SizedBox(height: OmluSpacing.md),
            OmluCard(
              color: Colors.red.shade50,
              borderColor: Colors.red.shade200,
              child: Row(
                children: [
                  Icon(Icons.error_outline_rounded, color: Colors.red.shade700),
                  const SizedBox(width: OmluSpacing.sm),
                  Expanded(
                    child: Text(
                      _errorMessage!,
                      style: OmluTypography.bodyMedium.copyWith(
                        color: Colors.red.shade900,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: OmluSpacing.lg),
          OmluButton(
            text: _loading ? 'Finding bill…' : 'Find bill',
            isLoading: _loading,
            onPressed: _isValidLength && !_loading ? _submit : null,
          ),
          const SizedBox(height: OmluSpacing.sm),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}
