import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/api/api_exceptions.dart';
import 'package:omlu_operations/core/errors/user_facing_error.dart';
import 'package:omlu_operations/core/printing/printer_adapter.dart';

void main() {
  test('maps network, timeout, permission and unknown failures', () {
    expect(
      userFacingError(const ApiException('Network request failed.')),
      "You're offline. Check your connection and try again.",
    );
    expect(
      userFacingError(TimeoutException('slow')),
      'OMLU is taking longer than expected. Try again.',
    );
    expect(
      userFacingError(const PermissionDeniedException('internal detail')),
      "You don't have permission to do that.",
    );
    expect(
      userFacingError(Exception('SQL connection URL leaked')),
      'Something went wrong. Please try again.',
    );
  });

  test('maps cancellation conflicts to operational guidance', () {
    expect(
      userFacingError(
        const ConflictException(
          'Items cannot be cancelled while the order is preparing.',
        ),
        context: ErrorContext.itemCancellation,
      ),
      'Preparation has already started. Please ask the kitchen or manager for help.',
    );
    expect(
      userFacingError(
        const ConflictException('This order item is already cancelled.'),
        context: ErrorContext.itemCancellation,
      ),
      'This item has already been cancelled.',
    );
  });

  test('makes post-issue print failure explicit', () {
    expect(
      userFacingError(
        const PrinterException('connection failed'),
        context: ErrorContext.issueAndPrint,
      ),
      contains('bill was issued successfully but printing failed'),
    );
  });
}
