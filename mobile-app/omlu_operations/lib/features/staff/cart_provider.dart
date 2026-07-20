import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_exceptions.dart';
import '../../core/models/operations_models.dart';
import '../auth_provider.dart';

enum SubmissionState { idle, submitting, success, error }

class CartItem {
  const CartItem({required this.menuItemId, required this.quantity, this.note});

  final int menuItemId;
  final int quantity;
  final String? note;

  CartItem copyWith({int? quantity, String? note, bool clearNote = false}) {
    return CartItem(
      menuItemId: menuItemId,
      quantity: quantity ?? this.quantity,
      note: clearNote ? null : (note ?? this.note),
    );
  }
}

class CartState {
  const CartState({
    this.tableId,
    this.restaurantSlug,
    this.items = const {},
    required this.idempotencyKey,
    this.submissionState = SubmissionState.idle,
    this.errorMessage,
  });

  final int? tableId;
  final String? restaurantSlug;
  final Map<int, CartItem> items;
  final String idempotencyKey;
  final SubmissionState submissionState;
  final String? errorMessage;

  bool get isEmpty => items.isEmpty;

  CartState copyWith({
    int? tableId,
    String? restaurantSlug,
    Map<int, CartItem>? items,
    String? idempotencyKey,
    SubmissionState? submissionState,
    String? errorMessage,
    bool clearTable = false,
  }) {
    return CartState(
      tableId: clearTable ? null : (tableId ?? this.tableId),
      restaurantSlug: clearTable
          ? null
          : (restaurantSlug ?? this.restaurantSlug),
      items: items ?? this.items,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey,
      submissionState: submissionState ?? this.submissionState,
      errorMessage: errorMessage,
    );
  }
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier(this._ref)
    : super(CartState(idempotencyKey: _generateIdempotencyKey()));

  final Ref _ref;

  static String _generateIdempotencyKey() {
    final random = Random();
    final chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final suffix = List.generate(
      8,
      (index) => chars[random.nextInt(chars.length)],
    ).join();
    return 'send-order-${DateTime.now().millisecondsSinceEpoch}-$suffix';
  }

  void setTable(int tableId, String restaurantSlug) {
    if (state.tableId == tableId) return;
    state = state.copyWith(tableId: tableId, restaurantSlug: restaurantSlug);
  }

  void clear() {
    state = CartState(
      tableId: state.tableId,
      restaurantSlug: state.restaurantSlug,
      idempotencyKey: _generateIdempotencyKey(),
    );
  }

  void clearAll() {
    state = CartState(idempotencyKey: _generateIdempotencyKey());
  }

  void addItem(int menuItemId, {String? note}) {
    final current = state.items[menuItemId];
    final updated = Map<int, CartItem>.from(state.items);
    if (current == null) {
      updated[menuItemId] = CartItem(
        menuItemId: menuItemId,
        quantity: 1,
        note: note,
      );
    } else {
      updated[menuItemId] = current.copyWith(
        quantity: current.quantity + 1,
        note: note,
      );
    }
    state = state.copyWith(items: updated);
  }

  void removeItem(int menuItemId) {
    final current = state.items[menuItemId];
    if (current == null) return;

    final updated = Map<int, CartItem>.from(state.items);
    if (current.quantity <= 1) {
      updated.remove(menuItemId);
    } else {
      updated[menuItemId] = current.copyWith(quantity: current.quantity - 1);
    }
    state = state.copyWith(items: updated);
  }

  void updateQuantity(int menuItemId, int quantity) {
    if (quantity <= 0) {
      final updated = Map<int, CartItem>.from(state.items)..remove(menuItemId);
      state = state.copyWith(items: updated);
      return;
    }
    final current = state.items[menuItemId];
    if (current == null) return;

    final updated = Map<int, CartItem>.from(state.items);
    updated[menuItemId] = current.copyWith(quantity: quantity);
    state = state.copyWith(items: updated);
  }

  void updateItemNote(int menuItemId, String? note) {
    final current = state.items[menuItemId];
    if (current == null) return;
    final updated = Map<int, CartItem>.from(state.items);
    updated[menuItemId] = current.copyWith(
      note: note,
      clearNote: note == null || note.trim().isEmpty,
    );
    state = state.copyWith(items: updated);
  }

  Future<void> submitOrder() async {
    if (state.tableId == null || state.items.isEmpty) return;
    if (state.submissionState == SubmissionState.submitting) return;

    state = state.copyWith(submissionState: SubmissionState.submitting);

    try {
      final api = _ref.read(operationsApiProvider);

      final draftItems = state.items.values.map((cartItem) {
        return OrderItemDraft(
          menuItemId: cartItem.menuItemId,
          quantity: cartItem.quantity,
          itemNote: cartItem.note,
        );
      }).toList();

      final draft = StaffOrderDraft(
        items: draftItems,
        customerNote: 'Staff assisted order',
      );

      await api.createStaffOrder(
        tableId: state.tableId!,
        draft: draft,
        idempotencyKey: state.idempotencyKey,
      );

      state = state.copyWith(submissionState: SubmissionState.success);
    } catch (e) {
      state = state.copyWith(
        submissionState: SubmissionState.error,
        errorMessage: e is PermissionDeniedException
            ? 'This action was not completed because Staff operations were locked.'
            : 'Could not send the order. Check the connection and try again.',
      );
      rethrow;
    }
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier(ref);
});

final selectedTableIdProvider = StateProvider<int?>((ref) => null);
