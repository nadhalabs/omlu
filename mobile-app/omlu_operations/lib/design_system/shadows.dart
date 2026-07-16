import 'package:flutter/material.dart';

class OmluShadows {
  const OmluShadows._();

  static List<BoxShadow> get minimal => [
    BoxShadow(
      color: Colors.black.withOpacity(0.04),
      blurRadius: 10,
      offset: const Offset(0, 4),
    ),
  ];

  static List<BoxShadow> get none => const [];
}
