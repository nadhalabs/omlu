import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/user_facing_error.dart';
import '../../core/layout/responsive_layout.dart';
import '../../core/models/role_session.dart';
import '../../design_system/spacing.dart';
import '../../design_system/typography.dart';
import '../auth_provider.dart';

final managedStaffProvider = FutureProvider<List<Map<String, Object?>>>((
  ref,
) async {
  ref.watch(authProvider).valueOrNull?.tenantScope;
  final values = await ref.watch(operationsApiProvider).fetchStaffAccounts();
  return [for (final value in values) Map<String, Object?>.from(value as Map)];
});

class StaffManagementScreen extends ConsumerStatefulWidget {
  const StaffManagementScreen({super.key});
  @override
  ConsumerState<StaffManagementScreen> createState() =>
      _StaffManagementScreenState();
}

class _StaffManagementScreenState extends ConsumerState<StaffManagementScreen> {
  Map<String, Object?>? _selected;
  String _query = '';

  Future<void> _edit([Map<String, Object?>? staff]) async {
    final changed = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => _StaffForm(staff: staff)));
    if (changed == true) {
      ref.invalidate(managedStaffProvider);
      setState(() => _selected = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(managedStaffProvider);
    final wide = useSplitView(MediaQuery.sizeOf(context).width);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Staff & permissions', style: OmluTypography.h2),
        actions: [
          IconButton(
            onPressed: () => ref.invalidate(managedStaffProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(),
        icon: const Icon(Icons.person_add),
        label: const Text('Staff'),
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(userFacingError(e))),
        data: (staff) {
          final filtered = staff
              .where(
                (s) => '${s['name']} ${s['username']} ${s['role']}'
                    .toLowerCase()
                    .contains(_query),
              )
              .toList();
          final list = Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(OmluSpacing.md),
                child: TextField(
                  decoration: const InputDecoration(
                    prefixIcon: Icon(Icons.search),
                    labelText: 'Search staff',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (v) =>
                      setState(() => _query = v.trim().toLowerCase()),
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? const Center(child: Text('No staff accounts match.'))
                    : ListView.separated(
                        padding: const EdgeInsets.only(bottom: 96),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final person = filtered[i];
                          return ListTile(
                            selected: _selected?['id'] == person['id'],
                            leading: CircleAvatar(
                              child: Text(
                                '${person['name'] ?? '?'}'
                                    .substring(0, 1)
                                    .toUpperCase(),
                              ),
                            ),
                            title: Text(
                              '${person['name']}',
                              style: OmluTypography.h3,
                            ),
                            subtitle: Text(
                              '@${person['username'] ?? '—'} · ${_roleLabel('${person['role']}')}',
                            ),
                            trailing: _StatusChip(
                              active: person['status'] == 'active',
                            ),
                            onTap: () => wide
                                ? setState(() => _selected = person)
                                : _edit(person),
                          );
                        },
                      ),
              ),
            ],
          );
          if (!wide) return list;
          return Row(
            children: [
              Expanded(flex: 3, child: list),
              const VerticalDivider(width: 1),
              Expanded(
                flex: 2,
                child: _selected == null
                    ? const Center(child: Text('Select a staff account.'))
                    : _StaffDetail(
                        staff: _selected!,
                        edit: () => _edit(_selected),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

String _roleLabel(String role) => switch (role) {
  'owner' => 'Owner · full restaurant control',
  'admin' => 'Admin · operations and management',
  'kitchen' => 'Kitchen · KDS only',
  _ => 'Staff · tables and orders',
};

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.active});
  final bool active;
  @override
  Widget build(BuildContext context) =>
      Chip(label: Text(active ? 'Active' : 'Inactive'));
}

class _StaffDetail extends StatelessWidget {
  const _StaffDetail({required this.staff, required this.edit});
  final Map<String, Object?> staff;
  final VoidCallback edit;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(OmluSpacing.lg),
    children: [
      Text('${staff['name']}', style: OmluTypography.h1),
      Text('@${staff['username'] ?? '—'}'),
      const SizedBox(height: 16),
      Text(_roleLabel('${staff['role']}'), style: OmluTypography.bodyLarge),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.devices),
        title: Text('${staff['active_session_count'] ?? 0} active sessions'),
      ),
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.history),
        title: Text('Last active: ${staff['last_active_at'] ?? 'Never'}'),
      ),
      FilledButton.icon(
        onPressed: edit,
        icon: const Icon(Icons.manage_accounts),
        label: const Text('Manage account'),
      ),
    ],
  );
}

class _StaffForm extends ConsumerStatefulWidget {
  const _StaffForm({this.staff});
  final Map<String, Object?>? staff;
  @override
  ConsumerState<_StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends ConsumerState<_StaffForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: widget.staff?['name']?.toString(),
  );
  late final _username = TextEditingController(
    text: widget.staff?['username']?.toString(),
  );
  final _email = TextEditingController();
  final _secret = TextEditingController();
  late String _role = widget.staff?['role']?.toString() ?? 'staff';
  late String _status = widget.staff?['status']?.toString() ?? 'active';
  bool _busy = false;

  bool get _editing => widget.staff != null;
  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final api = ref.read(operationsApiProvider);
      if (_editing) {
        await api.updateStaffAccount(widget.staff!['id'] as int, {
          'role': _role,
          'status': _status,
          'reason': 'Updated by restaurant administrator',
        });
      } else {
        await api.createStaffAccount({
          'name': _name.text.trim(),
          'username': _username.text.trim(),
          'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
          'role': _role,
          if (_role == 'staff') 'pin': _secret.text.trim(),
          if (_role == 'staff') 'confirm_pin': _secret.text.trim(),
          if (_role != 'staff') 'temporary_password': _secret.text,
        });
      }
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

  Future<void> _resetPassword() async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Set temporary password'),
        content: TextField(
          controller: controller,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'At least 6 characters'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value == null || value.length < 6 || _busy) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .resetStaffPassword(widget.staff!['id'] as int, value);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Temporary password set. Active sessions were invalidated by the server.',
            ),
          ),
        );
      }
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

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove staff access?'),
        content: Text(
          '${widget.staff?['name']} will no longer be able to sign in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove access'),
          ),
        ],
      ),
    );
    if (ok != true || _busy) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(operationsApiProvider)
          .deleteStaffAccount(widget.staff!['id'] as int);
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
  Widget build(BuildContext context) {
    final actorRole = ref.watch(authProvider).valueOrNull?.role;
    final canAssignAdmin = actorRole == StaffRole.owner;
    return Scaffold(
      appBar: AppBar(
        title: Text(_editing ? 'Manage staff' : 'Add staff'),
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
            if (!_editing) ...[
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Display name *'),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Enter a name.' : null,
              ),
              TextFormField(
                controller: _username,
                autocorrect: false,
                decoration: const InputDecoration(labelText: 'Username *'),
                validator: (v) => v == null || v.trim().length < 3
                    ? 'Use at least 3 characters.'
                    : null,
              ),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email (optional)',
                ),
              ),
            ],
            DropdownButtonFormField<String>(
              initialValue: _role,
              decoration: const InputDecoration(labelText: 'Role'),
              items: [
                const DropdownMenuItem(
                  value: 'staff',
                  child: Text('Staff — tables and orders'),
                ),
                const DropdownMenuItem(
                  value: 'kitchen',
                  child: Text('Kitchen — KDS only'),
                ),
                if (canAssignAdmin)
                  const DropdownMenuItem(
                    value: 'admin',
                    child: Text('Admin — restaurant management'),
                  ),
              ],
              onChanged: _busy ? null : (v) => setState(() => _role = v!),
            ),
            if (!_editing)
              TextFormField(
                controller: _secret,
                obscureText: true,
                keyboardType: _role == 'staff'
                    ? TextInputType.number
                    : TextInputType.visiblePassword,
                decoration: InputDecoration(
                  labelText: _role == 'staff'
                      ? 'PIN *'
                      : 'Temporary password *',
                ),
                validator: (v) => _role == 'staff'
                    ? (v == null || !RegExp(r'^\d{4,6}$').hasMatch(v)
                          ? 'Use a 4–6 digit PIN.'
                          : null)
                    : (v == null || v.length < 6
                          ? 'Use at least 6 characters.'
                          : null),
              ),
            if (_editing)
              DropdownButtonFormField<String>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: 'Account status'),
                items: const [
                  DropdownMenuItem(value: 'active', child: Text('Active')),
                  DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
                ],
                onChanged: _busy ? null : (v) => setState(() => _status = v!),
              ),
            const SizedBox(height: OmluSpacing.md),
            Text('Permissions', style: OmluTypography.h3),
            Text(_roleLabel(_role)),
            if (_editing) ...[
              const Divider(height: 32),
              OutlinedButton.icon(
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        try {
                          await ref
                              .read(operationsApiProvider)
                              .revokeStaffSessions(widget.staff!['id'] as int);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'All active sessions signed out.',
                                ),
                              ),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(userFacingError(e))),
                            );
                          }
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                icon: const Icon(Icons.logout),
                label: const Text('Sign out all devices'),
              ),
              if (_role != 'staff')
                OutlinedButton.icon(
                  onPressed: _busy ? null : _resetPassword,
                  icon: const Icon(Icons.password),
                  label: const Text('Reset password'),
                ),
              TextButton.icon(
                onPressed: _busy ? null : _remove,
                icon: const Icon(Icons.person_remove),
                label: const Text('Remove access'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
