import 'package:flutter_test/flutter_test.dart';
import 'package:omlu_operations/core/layout/responsive_layout.dart';

void main() {
  test('admin navigation responds to available width boundaries', () {
    expect(omluLayoutClass(375), OmluLayoutClass.phone);
    expect(usePersistentNavigation(599), isFalse);
    expect(omluLayoutClass(600), OmluLayoutClass.tablet);
    expect(usePersistentNavigation(800), isTrue);
    expect(omluLayoutClass(1000), OmluLayoutClass.tablet);
    expect(omluLayoutClass(1001), OmluLayoutClass.expanded);
  });

  test('operational detail becomes persistent only with useful width', () {
    expect(useSplitView(759), isFalse);
    expect(useSplitView(760), isTrue);
    expect(useSplitView(1280), isTrue);
  });
}
