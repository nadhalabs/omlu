import 'dart:async';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_exceptions.dart';
import '../../core/auth/flutter_tenant_scope.dart';
import '../../core/auth/native_auth_runtime.dart';
import '../../core/models/operations_models.dart';
import '../../core/storage/operations_data_cache.dart';
import '../auth_provider.dart';

enum SubmissionState { idle, submitting, success, error }

class CartItem {
  const CartItem({
    required this.menuItemId,
    required this.quantity,
    this.note,
    this.selectedOptions = const [],
  });

  final int menuItemId;
  final int quantity;
  final String? note;
  final List<MenuOptionSelection> selectedOptions;

  CartItem copyWith({int? quantity, String? note, bool clearNote = false}) {
    return CartItem(
      menuItemId: menuItemId,
      quantity: quantity ?? this.quantity,
      note: clearNote ? null : (note ?? this.note),
      selectedOptions: selectedOptions,
    );
  }
}

class CartState {
  const CartState({
    this.tableId,
    this.restaurantId,
    this.restaurantSlug,
    this.scope,
    this.items = const {},
    required this.idempotencyKey,
    this.submissionState = SubmissionState.idle,
    this.errorMessage,
    this.servedEntryReason,
  });

  final int? tableId;
  final int? restaurantId;
  final String? restaurantSlug;
  final FlutterTenantScope? scope;
  final Map<String, CartItem> items;
  final String idempotencyKey;
  final SubmissionState submissionState;
  final String? errorMessage;
  final String? servedEntryReason;
  bool get isServedEntry => servedEntryReason != null;

  bool get isEmpty => items.isEmpty;

  CartState copyWith({
    int? tableId,
    int? restaurantId,
    String? restaurantSlug,
    FlutterTenantScope? scope,
    Map<String, CartItem>? items,
    String? idempotencyKey,
    SubmissionState? submissionState,
    String? errorMessage,
    bool clearTable = false,
    String? servedEntryReason,
    bool clearServedEntry = false,
  }) {
    return CartState(
      tableId: clearTable ? null : (tableId ?? this.tableId),
      restaurantId: restaurantId ?? this.restaurantId,
      restaurantSlug: clearTable
          ? null
          : (restaurantSlug ?? this.restaurantSlug),
      scope: scope ?? this.scope,
      items: items ?? this.items,
      idempotencyKey: idempotencyKey ?? this.idempotencyKey,
      submissionState: submissionState ?? this.submissionState,
      errorMessage: errorMessage,
      servedEntryReason: clearServedEntry
          ? null
          : (servedEntryReason ?? this.servedEntryReason),
    );
  }
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier(
    this._ref, {
    required FlutterTenantScope? scope,
    required String? restaurantSlug,
    required OperationsDataCache cache,
    required NativeAuthRuntime authRuntime,
  }) : _cache = cache,
       _scope = scope,
       _restaurantSlug = restaurantSlug,
       super(
         CartState(
           restaurantId: scope?.restaurantId,
           restaurantSlug: restaurantSlug,
           scope: scope,
           idempotencyKey: _generateIdempotencyKey(),
         ),
       ) {
    if (scope != null) {
      unawaited(_restore());
      _unregisterCleanup = authRuntime.registerCleanup((_) => clearAll());
    }
  }

  final Ref _ref;
  final OperationsDataCache _cache;
  final FlutterTenantScope? _scope;
  final String? _restaurantSlug;
  void Function()? _unregisterCleanup;

  static String _generateIdempotencyKey() {
    final random = Random();
    final chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final suffix = List.generate(
      8,
      (index) => chars[random.nextInt(chars.length)],
    ).join();
    return 'send-order-${DateTime.now().millisecondsSinceEpoch}-$suffix';
  }

  void setTable(int tableId) {
    final scope = _scope;
    if (scope == null || _restaurantSlug == null) {
      throw StateError('Cannot create a cart before /me validation.');
    }
    if (state.tableId == tableId) return;
    state = CartState(
      tableId: tableId,
      restaurantId: scope.restaurantId,
      restaurantSlug: _restaurantSlug,
      scope: scope,
      idempotencyKey: _generateIdempotencyKey(),
    );
    _persist();
  }

  void setNormalEntry() {
    state = state.copyWith(clearServedEntry: true);
    _persist();
  }

  void setServedEntry(String reason) {
    state = state.copyWith(servedEntryReason: reason.trim());
    _persist();
  }

  void clear() {
    state = CartState(
      tableId: state.tableId,
      restaurantId: state.restaurantId,
      restaurantSlug: state.restaurantSlug,
      scope: state.scope,
      idempotencyKey: _generateIdempotencyKey(),
    );
    _persist();
  }

  void clearAll() {
    state = CartState(
      restaurantId: _scope?.restaurantId,
      restaurantSlug: _restaurantSlug,
      scope: _scope,
      idempotencyKey: _generateIdempotencyKey(),
    );
  }

  static String lineKey(
    int menuItemId,
    List<MenuOptionSelection> selectedOptions,
  ) {
    final options = [...selectedOptions]
      ..sort((a, b) {
        final group = a.groupId.compareTo(b.groupId);
        return group != 0 ? group : a.optionId.compareTo(b.optionId);
      });
    return '$menuItemId:${options.map((value) => '${value.groupId}-${value.optionId}-${value.quantity}').join(',')}';
  }

  int quantityForMenuItem(int menuItemId) => state.items.values
      .where((item) => item.menuItemId == menuItemId)
      .fold(0, (total, item) => total + item.quantity);

  void addItem(
    int menuItemId, {
    String? note,
    List<MenuOptionSelection> selectedOptions = const [],
  }) {
    final key = lineKey(menuItemId, selectedOptions);
    final current = state.items[key];
    final updated = Map<String, CartItem>.from(state.items);
    if (current == null) {
      updated[key] = CartItem(
        menuItemId: menuItemId,
        quantity: 1,
        note: note,
        selectedOptions: List.unmodifiable(selectedOptions),
      );
    } else {
      updated[key] = current.copyWith(
        quantity: current.quantity + 1,
        note: note,
      );
    }
    state = state.copyWith(items: updated);
    _persist();
  }

  void removeItem(
    int menuItemId, {
    List<MenuOptionSelection> selectedOptions = const [],
  }) {
    final key = lineKey(menuItemId, selectedOptions);
    final current = state.items[key];
    if (current == null) return;

    final updated = Map<String, CartItem>.from(state.items);
    if (current.quantity <= 1) {
      updated.remove(key);
    } else {
      updated[key] = current.copyWith(quantity: current.quantity - 1);
    }
    state = state.copyWith(items: updated);
    _persist();
  }

  void updateQuantity(String lineKey, int quantity) {
    if (quantity <= 0) {
      final updated = Map<String, CartItem>.from(state.items)..remove(lineKey);
      state = state.copyWith(items: updated);
      _persist();
      return;
    }
    final current = state.items[lineKey];
    if (current == null) return;

    final updated = Map<String, CartItem>.from(state.items);
    updated[lineKey] = current.copyWith(quantity: quantity);
    state = state.copyWith(items: updated);
    _persist();
  }

  void updateItemNote(String lineKey, String? note) {
    final current = state.items[lineKey];
    if (current == null) return;
    final updated = Map<String, CartItem>.from(state.items);
    updated[lineKey] = current.copyWith(
      note: note,
      clearNote: note == null || note.trim().isEmpty,
    );
    state = state.copyWith(items: updated);
    _persist();
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
          selectedOptions: cartItem.selectedOptions,
        );
      }).toList();

      final draft = StaffOrderDraft(
        items: draftItems,
        customerNote: 'Staff assisted order',
      );

      if (state.isServedEntry) {
        await api.createStaffServedItem(
          tableId: state.tableId!,
          draft: draft,
          reason: state.servedEntryReason!,
          idempotencyKey: state.idempotencyKey,
        );
      } else {
        await api.createStaffOrder(
          tableId: state.tableId!,
          draft: draft,
          idempotencyKey: state.idempotencyKey,
        );
      }

      state = state.copyWith(submissionState: SubmissionState.success);
      _persist();
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

  Future<void> _restore() async {
    final scope = _scope;
    if (scope == null) return;
    try {
      final cached = await _cache.read(
        'staff-cart-draft',
        identifier: 'active',
        maxAge: const Duration(days: 30),
      );
      if (!mounted || cached is! Map) return;
      final json = Map<String, Object?>.from(cached);
      if (json['restaurant_id'] != scope.restaurantId ||
          json['table_id'] is! int) {
        return;
      }
      final items = <String, CartItem>{};
      for (final raw in json['items'] as List? ?? const []) {
        final item = Map<String, Object?>.from(raw as Map);
        final selections = <MenuOptionSelection>[
          for (final rawOption in item['selected_options'] as List? ?? const [])
            MenuOptionSelection(
              groupId: (rawOption as Map)['group_id'] as int,
              optionId: rawOption['option_id'] as int,
              quantity: rawOption['quantity'] as int? ?? 1,
            ),
        ];
        final cartItem = CartItem(
          menuItemId: item['menu_item_id'] as int,
          quantity: item['quantity'] as int,
          note: item['item_note'] as String?,
          selectedOptions: selections,
        );
        items[lineKey(cartItem.menuItemId, selections)] = cartItem;
      }
      state = CartState(
        tableId: json['table_id'] as int,
        restaurantId: scope.restaurantId,
        restaurantSlug: _restaurantSlug,
        scope: scope,
        items: items,
        idempotencyKey:
            json['idempotency_key'] as String? ?? _generateIdempotencyKey(),
        servedEntryReason: json['served_entry_reason'] as String?,
      );
    } catch (_) {
      // A corrupt or old-authority draft is never allowed to repopulate state.
    }
  }

  void _persist() {
    if (_scope == null) return;
    unawaited(
      _cache
          .write('staff-cart-draft', {
            'restaurant_id': state.restaurantId,
            'restaurant_slug': state.restaurantSlug,
            'table_id': state.tableId,
            'idempotency_key': state.idempotencyKey,
            'served_entry_reason': state.servedEntryReason,
            'items': [
              for (final item in state.items.values)
                {
                  'menu_item_id': item.menuItemId,
                  'quantity': item.quantity,
                  'item_note': item.note,
                  'selected_options': [
                    for (final option in item.selectedOptions) option.toJson(),
                  ],
                },
            ],
          }, identifier: 'active')
          .catchError((_) {}),
    );
  }

  @override
  void dispose() {
    _unregisterCleanup?.call();
    super.dispose();
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  final session = ref.watch(authProvider).valueOrNull;
  return CartNotifier(
    ref,
    scope: session?.tenantScope,
    restaurantSlug: session?.restaurantSlug,
    cache: ref.watch(operationsDataCacheProvider),
    authRuntime: ref.watch(nativeAuthRuntimeProvider),
  );
});

final selectedTableIdProvider = StateProvider<int?>((ref) {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  return null;
});
