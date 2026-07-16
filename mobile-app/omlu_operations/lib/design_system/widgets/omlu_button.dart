import 'package:flutter/material.dart';
import '../colors.dart';
import '../radius.dart';
import '../typography.dart';

class OmluButton extends StatelessWidget {
  const OmluButton({
    required this.text,
    required this.onPressed,
    super.key,
    this.isLoading = false,
    this.isFullWidth = true,
    this.backgroundColor = OmluColors.accent,
    this.textColor = OmluColors.textOnAccent,
  });

  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isFullWidth;
  final Color backgroundColor;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    final buttonContent = AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: isLoading
          ? SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(textColor),
              ),
            )
          : Text(text, style: OmluTypography.button.copyWith(color: textColor)),
    );

    final elevatedButton = ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: backgroundColor,
        foregroundColor: textColor,
        disabledBackgroundColor: backgroundColor.withOpacity(0.5),
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: OmluRadius.borderMd),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
        minimumSize: const Size(
          88,
          48,
        ), // Conforms to 48px minimum touch target height
      ),
      child: buttonContent,
    );

    if (isFullWidth) {
      return SizedBox(width: double.infinity, child: elevatedButton);
    }
    return elevatedButton;
  }
}
