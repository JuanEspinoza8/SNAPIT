import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/modelos.dart';
import '../mapa/repositorio_mapa.dart';
import 'avisos.dart';
import 'modelos.dart';
import 'repositorio_avisos.dart';

/// Qué avisos recibe el vecino: el interruptor general, las categorías y sus
/// zonas habituales.
class PantallaAjustesAvisos extends ConsumerWidget {
  const PantallaAjustesAvisos({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usuario = ref.watch(sesionProvider).value;

    if (usuario == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (usuario.rol != Rol.vecino) {
      return Scaffold(
        appBar: AppBar(title: const Text('Avisos y zonas')),
        body: const Padding(
          padding: EdgeInsets.all(Espacio.lg),
          child: Center(
            child: Text(
              'Los avisos y las zonas habituales son solo para vecinos.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Avisos y zonas')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Espacio.lg),
          children: [
            _InterruptorGeneral(usuario),
            const SizedBox(height: Espacio.xl),
            const _Categorias(),
            const SizedBox(height: Espacio.xl),
            const _Zonas(),
          ],
        ),
      ),
    );
  }
}

/// Interruptor general: si está apagado no se guarda ningún aviso.
class _InterruptorGeneral extends ConsumerStatefulWidget {
  const _InterruptorGeneral(this.usuario);

  final Usuario usuario;

  @override
  ConsumerState<_InterruptorGeneral> createState() =>
      _InterruptorGeneralState();
}

class _InterruptorGeneralState extends ConsumerState<_InterruptorGeneral> {
  var _guardando = false;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: widget.usuario.notificacionesHabilitadas,
      onChanged: _guardando ? null : _cambiar,
      secondary: _guardando
          ? const SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.notifications_active_outlined),
      title: const Text('Recibir avisos'),
      subtitle: const Text(
        'Si lo apagás, no se guarda ningún aviso, ni siquiera en la app.',
      ),
    );
  }

  Future<void> _cambiar(bool habilitadas) async {
    setState(() => _guardando = true);
    try {
      final usuario = await ref
          .read(repositorioAvisosProvider)
          .actualizarNotificaciones(habilitadas);
      ref.read(sesionProvider.notifier).actualizarUsuario(usuario);
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }
}

/// Las categorías activas, con el estado de preferencia del vecino.
class _Categorias extends ConsumerWidget {
  const _Categorias();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categorias = ref.watch(categoriasProvider);
    final preferencias = ref.watch(preferenciasProvider);

    final Widget contenido;
    if (categorias.isLoading || preferencias.isLoading) {
      contenido = const Padding(
        padding: EdgeInsets.all(Espacio.lg),
        child: Center(child: CircularProgressIndicator()),
      );
    } else if (categorias.hasError || preferencias.hasError) {
      contenido = _Error(
        error: categorias.error ?? preferencias.error!,
        alReintentar: () {
          ref.invalidate(categoriasProvider);
          ref.invalidate(preferenciasProvider);
        },
      );
    } else {
      contenido = Column(
        children: [
          for (final preferencia in preferencias.value!)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: preferencia.habilitada,
              onChanged: (habilitada) =>
                  _cambiar(context, ref, preferencia.categoriaId, habilitada),
              title: Text(_nombre(categorias.value!, preferencia.categoriaId)),
            ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Titulo(
          'Categorías',
          'Elegí de qué temas querés recibir avisos.',
        ),
        const SizedBox(height: Espacio.sm),
        contenido,
      ],
    );
  }

  String _nombre(List<Categoria> categorias, int id) {
    for (final categoria in categorias) {
      if (categoria.id == id) return categoria.nombre;
    }
    return 'Categoría $id';
  }

  Future<void> _cambiar(
    BuildContext context,
    WidgetRef ref,
    int categoriaId,
    bool habilitada,
  ) async {
    try {
      await ref
          .read(preferenciasProvider.notifier)
          .cambiar(categoriaId, habilitada);
    } catch (error) {
      if (context.mounted) mostrarError(context, error);
    }
  }
}

/// Las zonas habituales: crear, editar, pausar y borrar.
class _Zonas extends ConsumerWidget {
  const _Zonas();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final zonas = ref.watch(zonasHabitualesProvider);

    final contenido = switch (zonas) {
      AsyncData(:final value) when value.isEmpty => Text(
        'Todavía no agregaste ninguna zona.',
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
      AsyncData(:final value) => Column(
        children: [
          for (final zona in value) _FilaZona(zona, key: ValueKey(zona.id)),
        ],
      ),
      AsyncError(:final error) when !zonas.isLoading => _Error(
        error: error,
        alReintentar: () => ref.invalidate(zonasHabitualesProvider),
      ),
      _ => const Padding(
        padding: EdgeInsets.all(Espacio.lg),
        child: Center(child: CircularProgressIndicator()),
      ),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Expanded(
              child: _Titulo(
                'Zonas habituales',
                'Recibí un aviso cuando aparezca un incidente nuevo cerca.',
              ),
            ),
            const SizedBox(width: Espacio.sm),
            FilledButton.icon(
              onPressed: () => context.push(Rutas.zonaHabitual),
              icon: const Icon(Icons.add_location_alt_outlined),
              label: const Text('Agregar'),
            ),
          ],
        ),
        const SizedBox(height: Espacio.md),
        contenido,
      ],
    );
  }
}

class _FilaZona extends ConsumerStatefulWidget {
  const _FilaZona(this.zona, {super.key});

  final ZonaHabitual zona;

  @override
  ConsumerState<_FilaZona> createState() => _FilaZonaState();
}

class _FilaZonaState extends ConsumerState<_FilaZona> {
  var _guardando = false;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.location_on_outlined),
      title: Text(widget.zona.nombre),
      subtitle: Text('Radio de ${widget.zona.radioMetros} m'),
      onTap: _guardando
          ? null
          : () => context.push(Rutas.zonaHabitual, extra: widget.zona),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Switch(
            value: widget.zona.activa,
            onChanged: _guardando ? null : _cambiarActiva,
          ),
          IconButton(
            tooltip: 'Borrar ${widget.zona.nombre}',
            onPressed: _guardando ? null : _borrar,
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
    );
  }

  Future<void> _cambiarActiva(bool activa) async {
    setState(() => _guardando = true);
    try {
      await ref
          .read(repositorioAvisosProvider)
          .actualizarZona(
            widget.zona.id,
            widget.zona.datos.copyWith(activa: activa),
          );
      ref.invalidate(zonasHabitualesProvider);
      await ref.read(zonasHabitualesProvider.future);
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _borrar() async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Borrar zona'),
        content: Text('¿Querés borrar “${widget.zona.nombre}”?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Borrar'),
          ),
        ],
      ),
    );

    if (confirmar != true || !mounted) return;

    setState(() => _guardando = true);
    try {
      await ref.read(repositorioAvisosProvider).borrarZona(widget.zona.id);
      ref.invalidate(zonasHabitualesProvider);
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.titulo, this.descripcion);

  final String titulo;
  final String descripcion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(titulo, style: tema.textTheme.titleMedium),
        const SizedBox(height: Espacio.xs),
        Text(
          descripcion,
          style: tema.textTheme.bodySmall?.copyWith(
            color: tema.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({required this.error, required this.alReintentar});

  final Object error;
  final VoidCallback alReintentar;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MensajeError(ErrorApi.desde(error).mensaje),
        const SizedBox(height: Espacio.sm),
        OutlinedButton(
          onPressed: alReintentar,
          child: const Text('Reintentar'),
        ),
      ],
    );
  }
}
