import 'package:flutter/material.dart';
import '../colors.dart';
import '../radius.dart';
import '../typography.dart';

class OmluTextField extends StatelessWidget {
  const OmluTextField({
    required this.label,
    required this.controller,
    super.key,
    this.hintText,
    this.obscureText = false,
    this.keyboardType = TextInputType.text,
    this.textInputAction = TextInputAction.next,
    this.prefixIcon,
    this.validator,
  });

  final String label;
  final TextEditingController controller;
  final String? hintText;
  final bool obscureText;
  final TextInputType keyboardType;
  final TextInputAction textInputAction;
  final Widget? prefixIcon;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: OmluTypography.label),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          style: OmluTypography.bodyLarge,
          validator: validator,
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: OmluTypography.bodyMedium.copyWith(
              color: OmluColors.textSecondary.withValues(alpha: 0.6),
            ),
            prefixIcon: prefixIcon,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            filled: true,
            fillColor: Colors.white,
            enabledBorder: OutlineInputBorder(
              borderRadius: OmluRadius.borderMd,
              borderSide: const BorderSide(color: OmluColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: OmluRadius.borderMd,
              borderSide: const BorderSide(
                color: OmluColors.accent,
                width: 1.5,
              ),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: OmluRadius.borderMd,
              borderSide: const BorderSide(color: Colors.red, width: 1),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: OmluRadius.borderMd,
              borderSide: const BorderSide(color: Colors.red, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}
