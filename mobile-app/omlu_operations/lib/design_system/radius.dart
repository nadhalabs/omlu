import 'package:flutter/material.dart';

class OmluRadius {
  const OmluRadius._();

  static const double sm = 8.0;
  static const double md = 12.0;
  static const double lg = 16.0; // Standard for white cards
  static const double xl = 24.0;
  static const double circular = 99.0;

  static BorderRadius get borderSm => BorderRadius.circular(sm);
  static BorderRadius get borderMd => BorderRadius.circular(md);
  static BorderRadius get borderLg => BorderRadius.circular(lg);
  static BorderRadius get borderXl => BorderRadius.circular(xl);
  static BorderRadius get borderCircular => BorderRadius.circular(circular);
}
