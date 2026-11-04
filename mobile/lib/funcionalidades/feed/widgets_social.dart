import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import 'social.dart';

/// El círculo con el número del vecino, que hace de foto de perfil.
class AvatarAutor extends StatelessWidget {
  const AvatarAutor(this.autor, {super.key, this.radio = 16});

  final Autor autor;
  final double radio;

  @override
  Widget build(BuildContext context) {
    final esquema = Theme.of(context).colorScheme;
    return ExcludeSemantics(
      child: CircleAvatar(
        radius: radio,
        backgroundColor: esquema.primary,
        foregroundColor: esquema.onPrimary,
        child: Text('${autor.numero}', style: TextStyle(fontSize: radio * 0.9)),
      ),
    );
  }
}

/// «♡ 7  💬 3», con el texto completo para TalkBack.
class ContadoresSociales extends StatelessWidget {
  const ContadoresSociales({
    super.key,
    required this.meGusta,
    required this.comentarios,
  });

  final int meGusta;
  final int comentarios;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final estilo = tema.textTheme.labelMedium?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    Widget contador(IconData icono, int cantidad) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icono, size: 18, color: tema.colorScheme.onSurfaceVariant),
        const SizedBox(width: Espacio.xs),
        Text('$cantidad', style: estilo),
      ],
    );

    // Un nodo propio: dentro de la tarjeta se leería pegado al resto del texto.
    return Semantics(
      container: true,
      label:
          '${meGusta == 1 ? '1 me gusta' : '$meGusta me gusta'}, '
          '${comentarios == 1 ? '1 comentario' : '$comentarios comentarios'}',
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            contador(Icons.favorite_border, meGusta),
            const SizedBox(width: Espacio.lg),
            contador(Icons.chat_bubble_outline, comentarios),
          ],
        ),
      ),
    );
  }
}

/// Los comentarios de un reporte o de un incidente, con un título y la
/// cantidad. Si no carga, deja reintentar sin perder el resto de la pantalla.
class SeccionComentarios extends ConsumerWidget {
  const SeccionComentarios({
    super.key,
    required this.titulo,
    required this.provider,
  });

  final String titulo;
  final FutureProvider<List<Comentario>> provider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final comentarios = ref.watch(provider);
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(switch (comentarios) {
          AsyncData(:final value) => '$titulo (${value.length})',
          _ => titulo,
        }, style: tema.textTheme.titleMedium),
        const SizedBox(height: Espacio.md),
        switch (comentarios) {
          AsyncData(:final value) when value.isEmpty => Text(
            'Todavía no hay comentarios.',
            style: secundario,
          ),
          AsyncData(:final value) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [for (final c in value) _Comentario(c)],
          ),
          AsyncError(:final error) when !comentarios.isLoading => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MensajeError(ErrorApi.desde(error).mensaje),
              const SizedBox(height: Espacio.sm),
              OutlinedButton(
                onPressed: () => ref.invalidate(provider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
          _ => const Padding(
            padding: EdgeInsets.all(Espacio.lg),
            child: Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Cargando los comentarios',
              ),
            ),
          ),
        },
      ],
    );
  }
}

class _Comentario extends StatelessWidget {
  const _Comentario(this.comentario);

  final Comentario comentario;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.labelSmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AvatarAutor(comentario.autor),
          const SizedBox(width: Espacio.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: Espacio.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      comentario.autor.nombre,
                      style: tema.textTheme.labelMedium,
                    ),
                    Text(
                      comentario.editado
                          ? '${haceCuanto(comentario.creadoEn)} · editado'
                          : haceCuanto(comentario.creadoEn),
                      style: secundario,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(comentario.texto),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
