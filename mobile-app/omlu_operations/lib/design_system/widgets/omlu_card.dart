import 'package:flutter/material.dart';
import '../colors.dart';
import '../radius.dart';
import '../shadows.dart';

class OmluCard extends StatelessWidget {
  const OmluCard({
    required this.child,
    super.key,
    this.padding = const EdgeInsets.all(16.0),
    this.onTap,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final decoration = BoxDecoration(
      color: OmluColors.surface,
      borderRadius: OmluRadius.borderLg,
      border: Border.all(color: borderColor ?? OmluColors.border, width: 1),
      boxShadow: OmluShadows.minimal,
    );

    if (onTap != null) {
      return Container(
        decoration: decoration,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: OmluRadius.borderLg,
            child: Padding(padding: padding, child: child),
          ),
        ),
      );
    }

    return Container(decoration: decoration, padding: padding, child: child);
  }
}
