import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../design_system/colors.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';

final adminCategoriesProvider = FutureProvider<List<Map<String, Object?>>>((
  ref,
) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  final values = await ref.watch(operationsApiProvider).fetchAdminCategories();
  return [for (final value in values) Map<String, Object?>.from(value as Map)];
});

final adminMenuItemsProvider =
    FutureProvider.family<List<Map<String, Object?>>, int?>((
      ref,
      categoryId,
    ) async {
      ref.watch(authProvider).valueOrNull?.tenantScope;
      final values = await ref
          .watch(operationsApiProvider)
          .fetchAdminMenuItems(categoryId: categoryId);
      return [
        for (final value in values) Map<String, Object?>.from(value as Map),
      ];
    });

class MenuManagementScreen extends ConsumerStatefulWidget {
  const MenuManagementScreen({super.key});
  @override
  ConsumerState<MenuManagementScreen> createState() =>
      _MenuManagementScreenState();
}

class _MenuManagementScreenState extends ConsumerState<MenuManagementScreen> {
  int? _categoryId;
  Map<String, Object?>? _selectedItem;
  String _search = '';
  Timer? _searchTimer;

  @override
  void dispose() {
    _searchTimer?.cancel();
    super.dispose();
  }

  void _reload() {
    ref.invalidate(adminCategoriesProvider);
    ref.invalidate(adminMenuItemsProvider);
  }

  Future<void> _categoryForm([Map<String, Object?>? category]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CategoryForm(category: category),
    );
    if (saved == true) _reload();
  }

  Future<void> _itemForm([Map<String, Object?>? item]) async {
    final categories =
        ref.read(adminCategoriesProvider).valueOrNull ?? const [];
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _MenuItemForm(
          item: item,
          categories: categories,
          initialCategoryId: _categoryId,
        ),
      ),
    );
    if (saved == true) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final categoriesState = ref.watch(adminCategoriesProvider);
    final itemsState = ref.watch(adminMenuItemsProvider(_categoryId));
    final wide = useSplitView(MediaQuery.sizeOf(context).width);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Menu management', style: OmluTypography.h2),
        actions: [
          IconButton(
            tooltip: 'Variants and add-ons',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const ModifierManagementScreen(),
              ),
            ),
            icon: const Icon(Icons.tune_rounded),
          ),
          IconButton(
            tooltip: 'Refresh menu',
            onPressed: _reload,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _itemForm(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Menu item'),
      ),
      body: categoriesState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            _Retry(message: userFacingError(error), retry: _reload),
        data: (categories) {
          final categoryPane = Column(
            children: [
              ListTile(
                title: Text('Categories', style: OmluTypography.h3),
                trailing: IconButton(
                  tooltip: 'Add category',
                  onPressed: () => _categoryForm(),
                  icon: const Icon(Icons.add_rounded),
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    ListTile(
                      selected: _categoryId == null,
                      leading: const Icon(Icons.restaurant_menu_rounded),
                      title: const Text('All items'),
                      onTap: () => setState(() {
                        _categoryId = null;
                        _selectedItem = null;
                      }),
                    ),
                    for (final category in categories)
                      ListTile(
                        selected: _categoryId == category['id'],
                        title: Text('${category['name_en']}'),
                        subtitle: Text(
                          '${category['item_count'] ?? 0} items${category['is_active'] == false ? ' · Hidden' : ''}',
                        ),
                        onTap: () => setState(() {
                          _categoryId = category['id'] as int;
                          _selectedItem = null;
                        }),
                        trailing: IconButton(
                          tooltip: 'Edit category',
                          onPressed: () => _categoryForm(category),
                          icon: const Icon(Icons.edit_outlined),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          );
          final itemPane = Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(OmluSpacing.md),
                child: TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search_rounded),
                    labelText: 'Search menu',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    _searchTimer?.cancel();
                    _searchTimer = Timer(const Duration(milliseconds: 250), () {
                      if (mounted) {
                        setState(() => _search = value.trim().toLowerCase());
                      }
                    });
                  },
                ),
              ),
              Expanded(
                child: itemsState.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (error, _) =>
                      _Retry(message: userFacingError(error), retry: _reload),
                  data: (items) {
                    final shown = items
                        .where(
                          (item) =>
                              '${item['name_en']} ${item['category_name']}'
                                  .toLowerCase()
                                  .contains(_search),
                        )
                        .toList();
                    if (shown.isEmpty) {
                      return const Center(
                        child: Text('No menu items match this view.'),
                      );
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.fromLTRB(
                        OmluSpacing.md,
                        0,
                        OmluSpacing.md,
                        96,
                      ),
                      itemCount: shown.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, index) {
                        final item = shown[index];
                        return ListTile(
                          selected: _selectedItem?['id'] == item['id'],
                          minVerticalPadding: 14,
                          title: Text(
                            '${item['name_en']}',
                            style: OmluTypography.h3,
                          ),
                          subtitle: Text(
                            '${item['category_name']} · ₹${item['price']}',
                          ),
                          leading: Icon(
                            item['is_available'] == false
                                ? Icons.remove_circle_outline
                                : Icons.check_circle,
                            color: item['is_available'] == false
                                ? OmluColors.textSecondary
                                : OmluColors.statusAvailable,
                          ),
                          trailing: Switch(
                            value: item['is_available'] != false,
                            onChanged: (value) async {
                              try {
                                await ref
                                    .read(operationsApiProvider)
                                    .setMenuItemAvailability(
                                      item['id'] as int,
                                      value,
                                    );
                                ref.invalidate(adminMenuItemsProvider);
                              } catch (error) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(userFacingError(error)),
                                    ),
                                  );
                                }
                              }
                            },
                          ),
                          onTap: () => wide
                              ? setState(() => _selectedItem = item)
                              : _itemForm(item),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          );
          if (!wide) return itemPane;
          return Row(
            children: [
              SizedBox(width: 260, child: categoryPane),
              const VerticalDivider(width: 1),
              Expanded(flex: 3, child: itemPane),
              const VerticalDivider(width: 1),
              Expanded(
                flex: 2,
                child: _selectedItem == null
                    ? const Center(child: Text('Select an item to edit it.'))
                    : _ItemPreview(
                        item: _selectedItem!,
                        edit: () => _itemForm(_selectedItem),
                      ),
              ),
            ],
          );
        },
      ),
      drawer: wide
          ? null
          : Drawer(
              child: SafeArea(
                child: categoriesState.valueOrNull == null
                    ? const SizedBox()
                    : Column(
                        children: [
                          Expanded(
                            child: ListView(
                              children: [
                                ListTile(
                                  title: const Text('All items'),
                                  onTap: () {
                                    setState(() => _categoryId = null);
                                    Navigator.pop(context);
                                  },
                                ),
                                for (final category
                                    in categoriesState.valueOrNull!)
                                  ListTile(
                                    title: Text('${category['name_en']}'),
                                    onTap: () {
                                      setState(
                                        () =>
                                            _categoryId = category['id'] as int,
                                      );
                                      Navigator.pop(context);
                                    },
                                  ),
                              ],
                            ),
                          ),
                          ListTile(
                            leading: const Icon(Icons.add),
                            title: const Text('Add category'),
                            onTap: () {
                              Navigator.pop(context);
                              _categoryForm();
                            },
                          ),
                        ],
                      ),
              ),
            ),
    );
  }
}

class _ItemPreview extends StatelessWidget {
  const _ItemPreview({required this.item, required this.edit});
  final Map<String, Object?> item;
  final VoidCallback edit;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(OmluSpacing.lg),
    children: [
      Text('${item['name_en']}', style: OmluTypography.h1),
      Text(
        '${item['category_name']} · ₹${item['price']}',
        style: OmluTypography.bodyLarge,
      ),
      const SizedBox(height: OmluSpacing.md),
      Text('${item['description_en'] ?? 'No description'}'),
      const SizedBox(height: OmluSpacing.lg),
      FilledButton.icon(
        onPressed: edit,
        icon: const Icon(Icons.edit_rounded),
        label: const Text('Edit item'),
      ),
    ],
  );
}

class _CategoryForm extends ConsumerStatefulWidget {
  const _CategoryForm({this.category});
  final Map<String, Object?>? category;
  @override
  ConsumerState<_CategoryForm> createState() => _CategoryFormState();
}

class _CategoryFormState extends ConsumerState<_CategoryForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(
    text: widget.category?['name_en']?.toString(),
  );
  late final TextEditingController _nameMl = TextEditingController(
    text: widget.category?['name_ml']?.toString(),
  );
  late final TextEditingController _order = TextEditingController(
    text: '${widget.category?['display_order'] ?? 0}',
  );
  late bool _active = widget.category?['is_active'] != false;
  bool _busy = false;

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .saveAdminCategory(
            id: widget.category?['id'] as int?,
            values: {
              'name_en': _name.text.trim(),
              'name_ml': _nameMl.text.trim(),
              'is_active': _active,
              'display_order': int.parse(_order.text),
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete category?'),
        content: const Text(
          'Deletion is allowed only when the category has no menu items.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || _busy) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .deleteAdminCategory(widget.category!['id'] as int);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(
      left: 20,
      right: 20,
      bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: Form(
      key: _form,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            widget.category == null ? 'New category' : 'Edit category',
            style: OmluTypography.h2,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Category name *'),
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Enter a category name.' : null,
          ),
          TextFormField(
            controller: _nameMl,
            decoration: const InputDecoration(
              labelText: 'Malayalam name (optional)',
            ),
          ),
          TextFormField(
            controller: _order,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Display order'),
            validator: (value) => (int.tryParse(value ?? '') ?? -1) < 0
                ? 'Enter zero or a positive number.'
                : null,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Active'),
            value: _active,
            onChanged: _busy ? null : (v) => setState(() => _active = v),
          ),
          Row(
            children: [
              if (widget.category != null)
                TextButton(
                  onPressed: _busy ? null : _delete,
                  child: const Text('Delete'),
                ),
              const Spacer(),
              TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Saving…' : 'Save'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _MenuItemForm extends ConsumerStatefulWidget {
  const _MenuItemForm({
    this.item,
    required this.categories,
    this.initialCategoryId,
  });
  final Map<String, Object?>? item;
  final List<Map<String, Object?>> categories;
  final int? initialCategoryId;
  @override
  ConsumerState<_MenuItemForm> createState() => _MenuItemFormState();
}

class _MenuItemFormState extends ConsumerState<_MenuItemForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: widget.item?['name_en']?.toString(),
  );
  late final _description = TextEditingController(
    text: widget.item?['description_en']?.toString(),
  );
  late final _price = TextEditingController(
    text: widget.item?['price']?.toString(),
  );
  late final _hsn = TextEditingController(
    text: widget.item?['hsn_sac_code']?.toString(),
  );
  late final _image = TextEditingController(
    text: widget.item?['image_url']?.toString(),
  );
  late final _order = TextEditingController(
    text: '${widget.item?['display_order'] ?? 0}',
  );
  late int? _categoryId =
      widget.item?['category_id'] as int? ??
      widget.initialCategoryId ??
      (widget.categories.isEmpty ? null : widget.categories.first['id'] as int);
  late bool _available = widget.item?['is_available'] != false;
  bool _busy = false;

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .saveAdminMenuItem(
            id: widget.item?['id'] as int?,
            values: {
              'category_id': _categoryId,
              'name_en': _name.text.trim(),
              'description_en': _description.text.trim(),
              'price': double.parse(_price.text),
              'hsn_sac_code': _hsn.text.trim(),
              'image_url': _image.text.trim(),
              'is_available': _available,
              'display_order': int.parse(_order.text),
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete menu item?'),
        content: Text(
          '${widget.item?['name_en']} will be removed from the menu. Historical orders remain unchanged.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || _busy) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .deleteAdminMenuItem(widget.item!['id'] as int);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.item == null ? 'New menu item' : 'Edit menu item'),
      actions: [
        TextButton(
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Saving…' : 'Save'),
        ),
      ],
    ),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(OmluSpacing.md),
        children: [
          DropdownButtonFormField<int>(
            initialValue: _categoryId,
            decoration: const InputDecoration(labelText: 'Category *'),
            items: [
              for (final c in widget.categories)
                DropdownMenuItem(
                  value: c['id'] as int,
                  child: Text('${c['name_en']}'),
                ),
            ],
            onChanged: _busy ? null : (v) => setState(() => _categoryId = v),
            validator: (v) => v == null ? 'Choose a category.' : null,
          ),
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Item name *'),
            validator: (v) =>
                v == null || v.trim().isEmpty ? 'Enter an item name.' : null,
          ),
          TextFormField(
            controller: _description,
            decoration: const InputDecoration(labelText: 'Description'),
            maxLines: 3,
          ),
          TextFormField(
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Price *',
              prefixText: '₹ ',
            ),
            validator: (v) {
              final n = double.tryParse(v ?? '');
              return n == null || n < 0
                  ? 'Enter a valid non-negative price.'
                  : null;
            },
          ),
          TextFormField(
            controller: _hsn,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'HSN/SAC code'),
            validator: (v) =>
                v != null &&
                    v.trim().isNotEmpty &&
                    !RegExp(r'^[A-Za-z0-9]{2,20}$').hasMatch(v.trim())
                ? 'Use 2–20 letters or numbers.'
                : null,
          ),
          TextFormField(
            controller: _image,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(labelText: 'Image URL'),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return null;
              final uri = Uri.tryParse(v.trim());
              return uri != null &&
                      (uri.scheme == 'https' || uri.scheme == 'http')
                  ? null
                  : 'Enter an HTTP or HTTPS URL.';
            },
          ),
          TextFormField(
            controller: _order,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Display order'),
            validator: (value) => (int.tryParse(value ?? '') ?? -1) < 0
                ? 'Enter zero or a positive number.'
                : null,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Available for ordering'),
            value: _available,
            onChanged: _busy ? null : (v) => setState(() => _available = v),
          ),
          if (widget.item != null) ...[
            const Divider(),
            ListTile(
              leading: const Icon(Icons.tune_rounded),
              title: const Text('Portions, variants and add-ons'),
              subtitle: const Text(
                'Manage modifier groups and attach them to this item',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ModifierManagementScreen(
                    itemId: widget.item!['id'] as int,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _busy ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              label: const Text('Delete menu item'),
            ),
          ],
        ],
      ),
    ),
  );
}

final optionGroupsProvider = FutureProvider<List<Map<String, Object?>>>((
  ref,
) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  final values = await ref.watch(operationsApiProvider).fetchOptionGroups();
  return [for (final value in values) Map<String, Object?>.from(value as Map)];
});

class ModifierManagementScreen extends ConsumerWidget {
  const ModifierManagementScreen({this.itemId, super.key});
  final int? itemId;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(optionGroupsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(itemId == null ? 'Variants & add-ons' : 'Attach modifiers'),
      ),
      floatingActionButton: itemId == null
          ? FloatingActionButton.extended(
              onPressed: () async {
                final changed = await showModalBottomSheet<bool>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => const _GroupForm(),
                );
                if (changed == true) ref.invalidate(optionGroupsProvider);
              },
              icon: const Icon(Icons.add),
              label: const Text('Group'),
            )
          : null,
      body: groups.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Retry(
          message: userFacingError(e),
          retry: () => ref.invalidate(optionGroupsProvider),
        ),
        data: (items) => items.isEmpty
            ? const Center(child: Text('No variants or add-ons configured.'))
            : ListView.builder(
                padding: const EdgeInsets.all(OmluSpacing.md),
                itemCount: items.length,
                itemBuilder: (_, index) {
                  final group = items[index];
                  final options = group['options'] as List? ?? const [];
                  return Card(
                    child: ExpansionTile(
                      title: Text('${group['name']}', style: OmluTypography.h3),
                      subtitle: Text(
                        '${group['type'] == 'variant' ? 'Portion / variant' : 'Add-on'} · ${options.length} options',
                      ),
                      trailing: itemId == null
                          ? IconButton(
                              tooltip: 'Edit modifier group',
                              icon: const Icon(Icons.edit_outlined),
                              onPressed: () async {
                                final changed =
                                    await showModalBottomSheet<bool>(
                                      context: context,
                                      isScrollControlled: true,
                                      builder: (_) => _GroupForm(group: group),
                                    );
                                if (changed == true) {
                                  ref.invalidate(optionGroupsProvider);
                                }
                              },
                            )
                          : FilledButton(
                              onPressed: () async {
                                try {
                                  await ref
                                      .read(operationsApiProvider)
                                      .attachOptionGroup(
                                        itemId!,
                                        group['id'] as int,
                                      );
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Modifier group attached.',
                                        ),
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(userFacingError(e)),
                                      ),
                                    );
                                  }
                                }
                              },
                              child: const Text('Attach'),
                            ),
                      children: [
                        for (final value in options)
                          if (value is Map)
                            ListTile(
                              title: Text('${value['name']}'),
                              subtitle: Text('+₹${value['price_delta']}'),
                              trailing: value['available'] == false
                                  ? const Text('Unavailable')
                                  : const Icon(Icons.edit_outlined),
                              onTap: itemId != null
                                  ? null
                                  : () async {
                                      final changed =
                                          await showModalBottomSheet<bool>(
                                            context: context,
                                            isScrollControlled: true,
                                            builder: (_) => _OptionForm(
                                              groupId: group['id'] as int,
                                              option: Map<String, Object?>.from(
                                                value,
                                              ),
                                            ),
                                          );
                                      if (changed == true) {
                                        ref.invalidate(optionGroupsProvider);
                                      }
                                    },
                            ),
                        if (itemId == null)
                          ListTile(
                            leading: const Icon(Icons.add),
                            title: const Text('Add option'),
                            onTap: () async {
                              final changed = await showModalBottomSheet<bool>(
                                context: context,
                                isScrollControlled: true,
                                builder: (_) =>
                                    _OptionForm(groupId: group['id'] as int),
                              );
                              if (changed == true) {
                                ref.invalidate(optionGroupsProvider);
                              }
                            },
                          ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _GroupForm extends ConsumerStatefulWidget {
  const _GroupForm({this.group});
  final Map<String, Object?>? group;
  @override
  ConsumerState<_GroupForm> createState() => _GroupFormState();
}

class _GroupFormState extends ConsumerState<_GroupForm> {
  late final _name = TextEditingController(
    text: widget.group?['name']?.toString(),
  );
  late String _type = widget.group?['type']?.toString() ?? 'variant';
  late final _order = TextEditingController(
    text: '${widget.group?['display_order'] ?? 0}',
  );
  late bool _active = widget.group?['active'] != false;
  bool _busy = false;
  Future<void> _save() async {
    if (_busy || _name.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .saveOptionGroup(
            id: widget.group?['id'] as int?,
            values: {
              'name': _name.text.trim(),
              'type': _type,
              'required': _type == 'variant',
              'minimum_selections': _type == 'variant' ? 1 : 0,
              'maximum_selections': 1,
              'active': _active,
              'display_order': int.tryParse(_order.text) ?? 0,
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(
      left: 20,
      right: 20,
      bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.group == null ? 'New modifier group' : 'Edit modifier group',
          style: OmluTypography.h2,
        ),
        TextField(
          controller: _name,
          decoration: const InputDecoration(labelText: 'Name'),
        ),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'variant', label: Text('Portion / variant')),
            ButtonSegment(value: 'addon', label: Text('Add-on')),
          ],
          selected: {_type},
          onSelectionChanged: (v) => setState(() => _type = v.first),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Active'),
          value: _active,
          onChanged: _busy ? null : (value) => setState(() => _active = value),
        ),
        TextField(
          controller: _order,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Display order'),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Saving…' : 'Save group'),
        ),
      ],
    ),
  );
}

class _OptionForm extends ConsumerStatefulWidget {
  const _OptionForm({required this.groupId, this.option});
  final int groupId;
  final Map<String, Object?>? option;
  @override
  ConsumerState<_OptionForm> createState() => _OptionFormState();
}

class _OptionFormState extends ConsumerState<_OptionForm> {
  late final _name = TextEditingController(
    text: widget.option?['name']?.toString(),
  );
  late final _price = TextEditingController(
    text: widget.option?['price_delta']?.toString() ?? '0',
  );
  late final _order = TextEditingController(
    text: '${widget.option?['display_order'] ?? 0}',
  );
  late bool _available = widget.option?['available'] != false;
  bool _busy = false;
  Future<void> _save() async {
    final amount = double.tryParse(_price.text);
    if (_busy || _name.text.trim().isEmpty || amount == null || amount < 0) {
      return;
    }
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .saveMenuOption(
            id: widget.option?['id'] as int?,
            values: {
              if (widget.option == null) 'group_id': widget.groupId,
              'name': _name.text.trim(),
              'price_delta': amount,
              'available': _available,
              'display_order': int.tryParse(_order.text) ?? 0,
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    if (_busy || widget.option == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete option?'),
        content: const Text(
          'Options used by historical orders will be made unavailable instead of destroying history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .deleteMenuOption(widget.option!['id'] as int);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(
      left: 20,
      right: 20,
      bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          widget.option == null ? 'New option' : 'Edit option',
          style: OmluTypography.h2,
        ),
        TextField(
          controller: _name,
          decoration: const InputDecoration(labelText: 'Option name'),
        ),
        TextField(
          controller: _price,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Additional price',
            prefixText: '₹ ',
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Available'),
          value: _available,
          onChanged: _busy
              ? null
              : (value) => setState(() => _available = value),
        ),
        TextField(
          controller: _order,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Display order'),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            if (widget.option != null)
              TextButton(
                onPressed: _busy ? null : _delete,
                child: const Text('Delete'),
              ),
            const Spacer(),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save option'),
            ),
          ],
        ),
      ],
    ),
  );
}

class _Retry extends StatelessWidget {
  const _Retry({required this.message, required this.retry});
  final String message;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 12),
        FilledButton(onPressed: retry, child: const Text('Retry')),
      ],
    ),
  );
}
