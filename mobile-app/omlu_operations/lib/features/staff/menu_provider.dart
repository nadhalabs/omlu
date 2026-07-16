import 'package:flutter_riverpod/flutter_riverpod.dart';
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
      id: json['id'] as int? ?? json['menu_item_id'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      price: (json['price'] ?? '0.00').toString(),
      isAvailable:
          json['is_available'] as bool? ?? json['available'] as bool? ?? true,
      description: json['description'] as String?,
      imageUrl: json['image_url'] as String? ?? json['image'] as String?,
      optionGroups: json['option_groups'] as List? ?? const [],
    );
  }

  final int id;
  final String name;
  final String price;
  final bool isAvailable;
  final String? description;
  final String? imageUrl;
  final List<dynamic> optionGroups;
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
      id: json['id'] as int? ?? 0,
      name: json['name'] as String? ?? '',
      items: [
        for (final item in rawItems)
          MenuItem.fromJson(Map<String, Object?>.from(item as Map)),
      ],
    );
  }

  final int id;
  final String name;
  final List<MenuItem> items;
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
  return [
    for (final cat in rawCategories)
      MenuCategory.fromJson(Map<String, Object?>.from(cat as Map)),
  ];
});
