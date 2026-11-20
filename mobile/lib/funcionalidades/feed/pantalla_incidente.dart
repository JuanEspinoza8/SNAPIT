import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/modelos.dart';
import '../mapa/repositorio_mapa.dart';
import 'carrusel_fotos.dart';
import 'ficha_problema.dart';
import 'social.dart';
import 'visor_fotos.dart';
import 'widgets_social.dart';

/// La ficha del problema (el incidente): sus fotos (el antes y el después, si
/// se resolvió), en qué está su atención, sus datos y dónde está. Si lo
/// reportó más de un vecino, la lista de esos reportes. Al final, los
/// comentarios sobre el problema en general (#152); los me gusta y los
/// comentarios de cada foto van en su publicación.
class PantallaIncidente extends ConsumerWidget {
  const PantallaIncidente(this.id, {super.key});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ficha = ref.watch(fichaProvider(id));
    return Scaffold(
      appBar: AppBar(
        // Al volver del ingreso se puede llegar acá sin nada debajo.
        leading: context.canPop()
            ? null
            : IconButton(
                tooltip: 'Ir al inicio',
                icon: const Icon(Icons.home_outlined),
                onPressed: () => context.go(Rutas.principal),
              ),
        title: Text(ficha.value?.categoriaNombre ?? 'Incidente'),
      ),
      body: SafeArea(
        child: switch (ficha) {
          AsyncData(:final value) => _Contenido(value),
          AsyncError(:final error) when !ficha.isLoading => _ErrorFicha(
            ErrorApi.desde(error),
            alReintentar: () => ref.invalidate(fichaProvider(id)),
          ),
          _ => const Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Cargando el incidente',
            ),
          ),
        },
      ),
    );
  }
}

/// Un incidente desestimado o vencido ya no tiene ficha. Desde un aviso viejo
/// se llega igual, y reintentar no lo trae de vuelta.
class _ErrorFicha extends StatelessWidget {
  const _ErrorFicha(this.error, {required this.alReintentar});

  final ErrorApi error;
  final VoidCallback alReintentar;

  @override
  Widget build(BuildContext context) {
    final noEsta = error.codigo == 'INCIDENTE_NO_ENCONTRADO';
    return Padding(
      padding: const EdgeInsets.all(Espacio.lg),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MensajeError(
            noEsta ? 'Este incidente ya no está en el mapa.' : error.mensaje,
          ),
          if (!noEsta) ...[
            const SizedBox(height: Espacio.lg),
            OutlinedButton(
              onPressed: alReintentar,
              child: const Text('Reintentar'),
            ),
          ],
        ],
      ),
    );
  }
}

class _Contenido extends ConsumerWidget {
  const _Contenido(this.ficha);

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final esVecino = ref.watch(sesionProvider).value?.rol == Rol.vecino;

    return ListView(
      children: [
        if (ficha.fotoCierreId case final fotoCierreId?)
          _AntesYDespues(ficha, fotoCierreId)
        else
          CarruselFotos(
            fotoIds: ficha.fotoIds,
            descripcion: ficha.categoriaNombre,
            alAmpliar: (i) => ampliarFotos(
              context,
              titulo: ficha.categoriaNombre,
              fotoIds: ficha.fotoIds,
              descripcion: ficha.categoriaNombre,
              inicial: i,
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CabeceraProblema(ficha),
              if (esVecino) ...[
                const SizedBox(height: Espacio.lg),
                BotonSeguir(ficha.id),
              ],
              const SizedBox(height: Espacio.lg),
              DatosProblema(ficha),
              const SizedBox(height: Espacio.sm),
              MapaProblema(ficha),
              const SizedBox(height: Espacio.xl),
              RecorridoProblema(ficha),
              if (ficha.cantidadVecinos > 1) ...[
                const SizedBox(height: Espacio.xl),
                _Reportes(ficha.id),
              ],
              const Divider(height: Espacio.xxl),
              SeccionComentarios.deIncidente(ficha.id),
            ],
          ),
        ),
      ],
    );
  }
}

/// Un incidente resuelto (F09): las fotos de los reportes (el antes) y la que
/// lo cerró (el después). Una sobre la otra: lado a lado quedan muy chicas en
/// el celular.
class _AntesYDespues extends StatelessWidget {
  const _AntesYDespues(this.ficha, this.fotoCierreId);

  final FichaIncidente ficha;
  final int fotoCierreId;

  @override
  Widget build(BuildContext context) {
    final antes = '${ficha.categoriaNombre}, antes';
    final despues =
        '${ficha.categoriaNombre}, después: cómo quedó al resolverse';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Rotulo('Antes'),
        CarruselFotos(
          fotoIds: ficha.fotoIds,
          descripcion: antes,
          alAmpliar: (i) => ampliarFotos(
            context,
            titulo: 'Antes',
            fotoIds: ficha.fotoIds,
            descripcion: antes,
            inicial: i,
          ),
        ),
        _Rotulo(switch (ficha.resueltoEn) {
          final resueltoEn? =>
            'Después · resuelto el ${fechaLarga(resueltoEn)}',
          null => 'Después',
        }),
        AspectRatio(
          aspectRatio: 4 / 3,
          child: FotoIncidente(
            fotoCierreId,
            descripcion: despues,
            alAmpliar: () => ampliarFotos(
              context,
              titulo: 'Después',
              fotoIds: [fotoCierreId],
              descripcion: despues,
            ),
          ),
        ),
      ],
    );
  }
}

class _Rotulo extends StatelessWidget {
  const _Rotulo(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: Espacio.lg,
        vertical: Espacio.sm,
      ),
      child: Semantics(
        header: true,
        child: Text(
          texto,
          style: tema.textTheme.labelMedium?.copyWith(
            color: tema.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// Los vecinos que reportaron el mismo problema: una fila por reporte, que
/// lleva a su publicación.
class _Reportes extends ConsumerWidget {
  const _Reportes(this.incidenteId);

  final int incidenteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final reportes = ref.watch(reportesDeIncidenteProvider(incidenteId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(switch (reportes) {
            AsyncData(:final value) => 'Reportes (${value.length})',
            _ => 'Reportes',
          }, style: tema.textTheme.titleMedium),
        ),
        const SizedBox(height: Espacio.sm),
        switch (reportes) {
          AsyncData(:final value) => Column(
            children: [for (final r in value) _FilaReporte(r)],
          ),
          AsyncError(:final error) when !reportes.isLoading => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MensajeError(ErrorApi.desde(error).mensaje),
              const SizedBox(height: Espacio.sm),
              OutlinedButton(
                onPressed: () =>
                    ref.invalidate(reportesDeIncidenteProvider(incidenteId)),
                child: const Text('Reintentar'),
              ),
            ],
          ),
          _ => const Padding(
            padding: EdgeInsets.all(Espacio.lg),
            child: Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Cargando los reportes',
              ),
            ),
          ),
        },
      ],
    );
  }
}

class _FilaReporte extends StatelessWidget {
  const _FilaReporte(this.reporte);

  final ReportePublico reporte;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.colorScheme.onSurfaceVariant;
    final meGusta = reporte.cantidadMeGusta;
    final comentarios = reporte.cantidadComentarios;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: () => context.push(Rutas.reporte(reporte.id)),
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(radioBorde),
        child: SizedBox.square(
          dimension: 52,
          child: reporte.fotoIds.isEmpty
              ? ColoredBox(color: tema.colorScheme.surfaceContainerLow)
              : FotoIncidente(
                  reporte.fotoIds.first,
                  descripcion: 'Foto del ${reporte.autor.nombre}',
                ),
        ),
      ),
      title: Row(
        children: [
          AvatarAutor(reporte.autor, radio: 11),
          const SizedBox(width: Espacio.sm),
          Flexible(
            child: Text(reporte.autor.nombre, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
      // Los íconos no se leen: TalkBack dice la línea entera.
      subtitle: Semantics(
        label:
            '${haceCuanto(reporte.creadoEn)}, $meGusta me gusta, '
            '$comentarios comentarios',
        child: ExcludeSemantics(
          child: Wrap(
            spacing: Espacio.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('${haceCuanto(reporte.creadoEn)} ·'),
              Icon(Icons.favorite_border, size: 16, color: secundario),
              Text('$meGusta ·'),
              Icon(Icons.chat_bubble_outline, size: 16, color: secundario),
              Text('$comentarios'),
            ],
          ),
        ),
      ),
    );
  }
}
