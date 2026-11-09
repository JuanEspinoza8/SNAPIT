import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/repositorio_auth.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/tema/tema_app.dart';
import 'modelos.dart';
import 'repositorio_recorrido.dart';

Future<void> mostrarElegirPerfilMovilidad(BuildContext context) {
  return showDialog<void>(
    context: context,
    builder: (_) => const _DialogoPerfilMovilidad(),
  );
}

class _DialogoPerfilMovilidad extends ConsumerStatefulWidget {
  const _DialogoPerfilMovilidad();

  @override
  ConsumerState<_DialogoPerfilMovilidad> createState() =>
      _DialogoPerfilMovilidadState();
}

class _DialogoPerfilMovilidadState
    extends ConsumerState<_DialogoPerfilMovilidad> {
  var _guardando = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final perfiles = ref.watch(perfilesProvider);
    final perfilId = ref.watch(
      sesionProvider.select((sesion) => sesion.value?.perfilMovilidadId),
    );

    return AlertDialog(
      title: const Text('Perfil de movilidad'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_guardando) const LinearProgressIndicator(),
            if (_error case final error?) ...[
              const SizedBox(height: Espacio.sm),
              MensajeError(error),
            ],
            const SizedBox(height: Espacio.sm),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: _contenido(perfiles, perfilId),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _guardando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cerrar'),
        ),
      ],
    );
  }

  Widget _contenido(AsyncValue<List<PerfilMovilidad>> perfiles, int? perfilId) {
    return switch (perfiles) {
      AsyncValue(:final value?) => ListView(
        shrinkWrap: true,
        children: [
          _OpcionPerfil(
            nombre: 'Sin perfil',
            elegido: perfilId == null,
            alTocar: _guardando ? null : () => _elegir(null),
          ),
          for (final perfil in value)
            _OpcionPerfil(
              nombre: perfil.nombre,
              elegido: perfilId == perfil.id,
              alTocar: _guardando ? null : () => _elegir(perfil.id),
            ),
        ],
      ),
      AsyncValue(:final error?) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          MensajeError(
            'No se pudieron cargar los perfiles: '
            '${ErrorApi.desde(error).mensaje}',
          ),
          const SizedBox(height: Espacio.md),
          OutlinedButton(
            onPressed: () => ref.invalidate(perfilesProvider),
            child: const Text('Reintentar'),
          ),
        ],
      ),
      _ => const Padding(
        padding: EdgeInsets.all(Espacio.lg),
        child: Center(child: CircularProgressIndicator()),
      ),
    };
  }

  Future<void> _elegir(int? nuevo) async {
    final actual = ref.read(sesionProvider).value?.perfilMovilidadId;
    if (nuevo == actual) {
      Navigator.of(context).pop();
      return;
    }

    setState(() {
      _guardando = true;
      _error = null;
    });

    try {
      final usuario = await ref
          .read(repositorioAuthProvider)
          .actualizarPerfilMovilidad(nuevo);
      ref.read(sesionProvider.notifier).actualizarUsuario(usuario);
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) setState(() => _error = ErrorApi.desde(error).mensaje);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }
}

class _OpcionPerfil extends StatelessWidget {
  const _OpcionPerfil({
    required this.nombre,
    required this.elegido,
    required this.alTocar,
  });

  final String nombre;
  final bool elegido;
  final VoidCallback? alTocar;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        elegido ? Icons.check_circle : Icons.circle_outlined,
        color: elegido ? tema.colorScheme.primary : null,
      ),
      title: Text(nombre),
      selected: elegido,
      onTap: alTocar,
    );
  }
}
