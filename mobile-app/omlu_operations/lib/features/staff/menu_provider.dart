import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/operations_api.dart';
import '../../core/models/operations_models.dart';
import '../../core/storage/operations_data_cache.dart';
import '../auth_provider.dart';

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.price,
    required this.isAvailable,
    this.description,
    this.imageUrl,
    this.optionGroups = const [],
  });

  factory MenuItem.fromJson(Map<String, Object?> json) {
    return MenuItem(
      id: readRequiredId(json['id'] ?? json['menu_item_id'], 'menu_item_id'),
      name: readString(json['name_en'] ?? json['name']),
      price: readDouble(json['price']),
      isAvailable:
          json['is_available'] as bool? ?? json['available'] as bool? ?? true,
      description: (json['description'] ?? json['description_en']) == null
          ? null
          : readString(json['description'] ?? json['description_en']),
      imageUrl: (json['image_url'] ?? json['image']) == null
          ? null
          : readString(json['image_url'] ?? json['image']),
      optionGroups: [
        for (final raw in json['option_groups'] as List? ?? const [])
          if (raw is Map)
            MenuOptionGroup.fromJson(Map<String, Object?>.from(raw)),
      ],
    );
  }

  final int id;
  final String name;
  final double price;
  final bool isAvailable;
  final String? description;
  final String? imageUrl;
  final List<MenuOptionGroup> optionGroups;

  double previewUnitPrice(List<MenuOptionSelection> selections) {
    double? variantPrice;
    var addons = 0.0;
    for (final selection in selections) {
      for (final group in optionGroups) {
        if (group.id != selection.groupId) continue;
        for (final option in group.options) {
          if (option.id != selection.optionId) continue;
          if (group.type == 'variant') {
            variantPrice = option.priceEffect;
          } else {
            addons += option.priceEffect * selection.quantity;
          }
        }
      }
    }
    return (variantPrice ?? price) + addons;
  }
}

class MenuOptionValue {
  const MenuOptionValue({
    required this.id,
    required this.groupId,
    required this.name,
    required this.priceEffect,
    required this.available,
    required this.displayOrder,
  });

  factory MenuOptionValue.fromJson(Map<String, Object?> json) =>
      MenuOptionValue(
        id: readRequiredId(json['id'], 'option_id'),
        groupId: readRequiredId(json['group_id'], 'option_group_id'),
        name: readString(json['name']),
        priceEffect: readDouble(json['price_delta']),
        available: json['available'] as bool? ?? true,
        displayOrder: readInt(json['display_order']),
      );

  final int id;
  final int groupId;
  final String name;
  final double priceEffect;
  final bool available;
  final int displayOrder;
}

class MenuOptionGroup {
  const MenuOptionGroup({
    required this.id,
    required this.name,
    required this.type,
    required this.required,
    required this.minimumSelections,
    required this.maximumSelections,
    required this.displayOrder,
    required this.options,
  });

  factory MenuOptionGroup.fromJson(Map<String, Object?> json) =>
      MenuOptionGroup(
        id: readRequiredId(json['id'], 'option_group_id'),
        name: readString(json['name']),
        type: readString(json['type'], fallback: 'addon'),
        required: json['required'] as bool? ?? false,
        minimumSelections: readInt(json['minimum_selections']),
        maximumSelections: readInt(json['maximum_selections'], fallback: 1),
        displayOrder: readInt(json['display_order']),
        options: [
          for (final raw in json['options'] as List? ?? const [])
            if (raw is Map)
              MenuOptionValue.fromJson(Map<String, Object?>.from(raw)),
        ],
      );

  int get effectiveMinimum =>
      required && minimumSelections < 1 ? 1 : minimumSelections;
  bool get isSingleSelect => type == 'variant' || maximumSelections == 1;

  final int id;
  final String name;
  final String type;
  final bool required;
  final int minimumSelections;
  final int maximumSelections;
  final int displayOrder;
  final List<MenuOptionValue> options;
}

class MenuCategory {
  const MenuCategory({
    required this.id,
    required this.name,
    required this.items,
  });

  factory MenuCategory.fromJson(Map<String, Object?> json) {
    final rawItems =
        json['items'] as List? ?? json['menu_items'] as List? ?? const [];
    return MenuCategory(
      id: readRequiredId(json['id'], 'category_id'),
      name: readString(json['name_en'] ?? json['name']),
      items: parseMenuItems(rawItems),
    );
  }

  final int id;
  final String name;
  final List<MenuItem> items;
}

List<MenuItem> parseMenuItems(List rawItems) {
  final items = <MenuItem>[];
  for (var index = 0; index < rawItems.length; index++) {
    try {
      final raw = rawItems[index];
      if (raw is! Map) {
        throw const FormatException('Menu item is not an object');
      }
      items.add(MenuItem.fromJson(Map<String, Object?>.from(raw)));
    } catch (error) {
      if (kDebugMode) {
        debugPrint(
          'OMLU menu: skipped malformed item at index $index (${error.runtimeType})',
        );
      }
    }
  }
  return items;
}

List<MenuCategory> parseMenuCategories(Object? rawValue) {
  if (rawValue is! List) {
    throw const FormatException('menu_categories must be a list');
  }
  final categories = <MenuCategory>[];
  for (var index = 0; index < rawValue.length; index++) {
    try {
      final raw = rawValue[index];
      if (raw is! Map) {
        throw const FormatException('Menu category is not an object');
      }
      categories.add(MenuCategory.fromJson(Map<String, Object?>.from(raw)));
    } catch (error) {
      if (kDebugMode) {
        debugPrint(
          'OMLU menu: skipped malformed category at index $index (${error.runtimeType})',
        );
      }
    }
  }
  if (kDebugMode) {
    final itemCount = categories.fold<int>(
      0,
      (total, category) => total + category.items.length,
    );
    debugPrint(
      'OMLU menu: parsed ${categories.length} categories and $itemCount items',
    );
  }
  return categories;
}

class MenuViewData {
  const MenuViewData({
    required this.categories,
    this.isRefreshing = false,
    this.showingCached = false,
    this.refreshWarning = false,
  });

  final List<MenuCategory> categories;
  final bool isRefreshing;
  final bool showingCached;
  final bool refreshWarning;

  MenuViewData copyWith({
    List<MenuCategory>? categories,
    bool? isRefreshing,
    bool? showingCached,
    bool? refreshWarning,
  }) => MenuViewData(
    categories: categories ?? this.categories,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    showingCached: showingCached ?? this.showingCached,
    refreshWarning: refreshWarning ?? this.refreshWarning,
  );
}

class MenuNotifier extends StateNotifier<AsyncValue<MenuViewData>> {
  MenuNotifier({
    required OperationsDataCache cache,
    required this.api,
    required this.tableId,
    required this.restaurantScope,
    bool startLoading = true,
  }) : _cache = cache,
       super(const AsyncValue.loading()) {
    if (startLoading) load();
  }

  final OperationsDataCache _cache;
  final OperationsApi api;
  final int tableId;
  final String restaurantScope;
  int _requestVersion = 0;
  bool _requestInFlight = false;

  String get _cacheKey => 'menu_${restaurantScope}_$tableId';

  Future<void> load({bool background = false}) async {
    if (_requestInFlight) return;
    _requestInFlight = true;
    final requestVersion = ++_requestVersion;
    var current = state.valueOrNull;

    if (current == null) {
      final cached = await _cache.read(
        _cacheKey,
        maxAge: const Duration(days: 30),
      );
      if (cached != null) {
        try {
          final categories = parseMenuCategories(cached);
          current = MenuViewData(
            categories: categories,
            showingCached: true,
            isRefreshing: true,
          );
          if (mounted) state = AsyncValue.data(current);
        } catch (_) {
          // Invalid cache is ignored; the authoritative request still runs.
        }
      }
    } else if (background) {
      state = AsyncValue.data(
        current.copyWith(isRefreshing: true, refreshWarning: false),
      );
    }

    try {
      if (kDebugMode) {
        debugPrint(
          'OMLU menu: requesting /staff/tables/$tableId for restaurant $restaurantScope',
        );
      }
      final detail = await api.fetchStaffTableDetail(tableId);
      final rawCategories = detail['menu_categories'];
      final categories = parseMenuCategories(rawCategories);
      if (requestVersion != _requestVersion || !mounted) return;
      await _cache.write(_cacheKey, rawCategories);
      state = AsyncValue.data(MenuViewData(categories: categories));
    } catch (error, stackTrace) {
      if (requestVersion != _requestVersion || !mounted) return;
      final retained = state.valueOrNull ?? current;
      if (kDebugMode) {
        debugPrint(
          'OMLU menu: load failed for restaurant $restaurantScope (${error.runtimeType})',
        );
      }
      state = retained == null
          ? AsyncValue.error(error, stackTrace)
          : AsyncValue.data(
              retained.copyWith(
                isRefreshing: false,
                showingCached: true,
                refreshWarning: true,
              ),
            );
    } finally {
      if (requestVersion == _requestVersion) _requestInFlight = false;
    }
  }

  Future<void> retry() => load();
  Future<void> refreshInBackground() => load(background: true);
}

// Scoped detail loader for a specific table session
final tableDetailProvider = FutureProvider.family<Map<String, Object?>, int>((
  ref,
  tableId,
) async {
  final api = ref.watch(operationsApiProvider);
  return api.fetchStaffTableDetail(tableId);
});

// Parsed category list for a selected table
final menuCategoriesProvider = FutureProvider.family<List<MenuCategory>, int>((
  ref,
  tableId,
) async {
  final detail = await ref.watch(tableDetailProvider(tableId).future);
  final rawCategories = detail['menu_categories'] as List? ?? const [];
  return parseMenuCategories(rawCategories);
});

final menuViewProvider = StateNotifierProvider.autoDispose
    .family<MenuNotifier, AsyncValue<MenuViewData>, int>((ref, tableId) {
      final session = ref.watch(authProvider).valueOrNull;
      final scope = session?.restaurantSlug;
      if (scope == null || scope.isEmpty) {
        return MenuNotifier(
          cache: ref.watch(operationsDataCacheProvider),
          api: ref.watch(operationsApiProvider),
          tableId: tableId,
          restaurantScope: 'authentication-pending',
          startLoading: false,
        );
      }
      return MenuNotifier(
        cache: ref.watch(operationsDataCacheProvider),
        api: ref.watch(operationsApiProvider),
        tableId: tableId,
        restaurantScope: scope,
      );
    });
