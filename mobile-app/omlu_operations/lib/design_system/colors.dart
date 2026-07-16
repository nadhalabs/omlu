import 'package:flutter/material.dart';

class OmluColors {
  const OmluColors._();

  // Primary palette
  static const Color accent = Color(0xFFE91E63); // One strong OMLU pink accent
  static const Color accentDark = Color(0xFFC2185B);
  static const Color background = Color(
    0xFFFFF2F2,
  ); // Warm light pink background
  static const Color surface = Colors.white; // White card surface

  // Text colors
  static const Color textPrimary = Color(
    0xFF2C1A1D,
  ); // Dark warm brown/charcoal
  static const Color textSecondary = Color(0xFF8C7376); // Warm grey
  static const Color textOnAccent = Colors.white;

  // Borders and dividers
  static const Color border = Color(0xFFF7DFDF); // Soft border color
  static const Color divider = Color(0xFFEAD4D4);

  // Status colors (Table statuses)
  static const Color statusAvailable = Color(0xFF2E7D32); // Deep green
  static const Color statusOrdering = Color(0xFF1565C0); // Deep blue
  static const Color statusPreparing = Color(0xFFEF6C00); // Dark orange
  static const Color statusReady = Color(0xFF6A1B9A); // Deep purple
  static const Color statusNeedsBill = Color(0xFFC2185B); // Crimson/Red-pink
}
