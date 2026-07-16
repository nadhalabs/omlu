import 'package:flutter/material.dart';

class OmluRouter {
  const OmluRouter._();

  static Route<T> fadeRoute<T>(Widget page) {
    return PageRouteBuilder<T>(
      pageBuilder: (context, animation, secondaryAnimation) => page,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(opacity: animation, child: child);
      },
      transitionDuration: const Duration(milliseconds: 150),
      reverseTransitionDuration: const Duration(milliseconds: 150),
    );
  }

  static void push<T>(BuildContext context, Widget page) {
    Navigator.of(context).push(fadeRoute<T>(page));
  }

  static void pushReplacement(BuildContext context, Widget page) {
    Navigator.of(context).pushReplacement(fadeRoute(page));
  }

  static void pop(BuildContext context) {
    Navigator.of(context).pop();
  }
}
