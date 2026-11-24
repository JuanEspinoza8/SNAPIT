import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../mapa/modelos.dart';
import '../mapa/repositorio_mapa.dart';
import 'carrusel_fotos.dart';
import 'ficha_problema.dart';
import 'visor_fotos.dart';
import 'social.dart';
import 'widgets_social.dart';

/// Una publicación entera: quién la hizo, la foto, el me gusta y todos los
/// comentarios, con la caja para comentar (#152), y además el problema del
/// que forma parte (qué es, en qué está, sus datos y el mapa), para no tener
/// que ir a otra pantalla. Si lo reportaron otros vecinos, se puede ir a la
/// ficha del problema, que junta todos sus reportes.
class PantallaReporte extends ConsumerWidget {
  const PantallaReporte(this.id, {super.key});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reporte = ref.watch(reporteProvider(id));
    return Scaffold(
      appBar: AppBar(
        // Al volver del ingreso se llega acá sin nada debajo: el inicio.
        leading: context.canPop()
            ? null
            : IconButton(
                tooltip: 'Ir al inicio',
                icon: const Icon(Icons.home_outlined),
                onPressed: () => context.go(Rutas.principal),
              ),
        title: Text(
          reporte.value == null
              ? 'Reporte'
              : 'Reporte del ${reporte.value!.autor.nombre}',
        ),
      ),
      body: SafeArea(
        child: switch (reporte) {
          AsyncData(:final value) => _Contenido(value),
          // Un link a una publicación que quitó un administrador lo dice, con
          // el motivo: no es un error que se pueda reintentar.
          AsyncError(:final error)
              when ErrorApi.desde(error).codigo == 'REPORTE_QUITADO' =>
            Padding(
              padding: const EdgeInsets.all(Espacio.xl),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.shield_outlined,
                    size: Espacio.xxxl,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: Espacio.lg),
                  Text(
                    'Publicación eliminada por un administrador',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: Espacio.sm),
                  Text(
                    ErrorApi.desde(error).mensaje,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          AsyncError(:final error) when !reporte.isLoading => Padding(
            padding: const EdgeInsets.all(Espacio.lg),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MensajeError(ErrorApi.desde(error).mensaje),
                const SizedBox(height: Espacio.lg),
                OutlinedButton(
                  onPressed: () => ref.invalidate(reporteProvider(id)),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          ),
          _ => const Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Cargando el reporte',
            ),
          ),
        },
      ),
    );
  }
}

class _Contenido extends ConsumerWidget {
  const _Contenido(this.reporte);

  final ReportePublico reporte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final ficha = ref.watch(fichaProvider(reporte.incidenteId)).value;
    final esVecino = ref.watch(sesionProvider).value?.rol == Rol.vecino;
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Row(
            children: [
              AvatarAutor(reporte.autor, radio: 20),
              const SizedBox(width: Espacio.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reporte.autor.nombre,
                      style: tema.textTheme.titleMedium,
                    ),
                    Text(
                      haceCuanto(reporte.creadoEn),
                      style: tema.textTheme.bodySmall?.copyWith(
                        color: tema.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        CarruselFotos(
          fotoIds: reporte.fotoIds,
          descripcion: 'el reporte del ${reporte.autor.nombre}',
        ),
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: BotonMeGusta(reporte),
              ),
              if (reporte.descripcion case final descripcion?
                  when descripcion.trim().isNotEmpty) ...[
                const SizedBox(height: Espacio.md),
                Text(descripcion),
              ],
              // El problema, si cargó. Si no, la publicación se ve igual.
              if (ficha != null) ...[
                const SizedBox(height: Espacio.lg),
                CabeceraProblema(ficha),
                if (esVecino) ...[
                  const SizedBox(height: Espacio.lg),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: BotonSeguir(ficha.id),
                  ),
                ],
                if (ficha.fotoCierreId case final fotoCierreId?) ...[
                  const SizedBox(height: Espacio.lg),
                  _ComoQuedo(ficha, fotoCierreId),
                ],
                const SizedBox(height: Espacio.lg),
                DatosProblema(ficha),
                const SizedBox(height: Espacio.sm),
                MapaProblema(ficha),
                const SizedBox(height: Espacio.xl),
                RecorridoProblema(ficha),
                if (ficha.cantidadVecinos > 1) ...[
                  const SizedBox(height: Espacio.md),
                  _OtrosVecinos(ficha),
                ],
              ],
              const Divider(height: Espacio.xxl),
              SeccionComentarios.deReporte(reporte.id),
            ],
          ),
        ),
      ],
    );
  }
}

/// Si el problema se resolvió: la foto que lo cerró, para compararla con la
/// del vecino.
class _ComoQuedo extends StatelessWidget {
  const _ComoQuedo(this.ficha, this.fotoId);

  final FichaIncidente ficha;
  final int fotoId;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final descripcion =
        '${ficha.categoriaNombre}, después: cómo quedó al resolverse';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(switch (ficha.resueltoEn) {
            final resueltoEn? =>
              'Así quedó · resuelto el ${fechaLarga(resueltoEn)}',
            null => 'Así quedó',
          }, style: tema.textTheme.titleMedium),
        ),
        const SizedBox(height: Espacio.sm),
        ClipRRect(
          borderRadius: BorderRadius.circular(radioBorde),
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: FotoIncidente(
              fotoId,
              descripcion: descripcion,
              alAmpliar: () => ampliarFotos(
                context,
                titulo: 'Así quedó',
                fotoIds: [fotoId],
                descripcion: descripcion,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Lo reportaron otros vecinos: la ficha del problema junta todos sus
/// reportes.
class _OtrosVecinos extends StatelessWidget {
  const _OtrosVecinos(this.ficha);

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final otros = ficha.cantidadVecinos - 1;
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radioBorde),
        side: BorderSide(color: Theme.of(context).colorScheme.outline),
      ),
      child: ListTile(
        leading: const Icon(Icons.group_outlined),
        title: Text(
          otros == 1
              ? 'Otro vecino reportó este problema'
              : 'Otros $otros vecinos reportaron este problema',
        ),
        trailing: const Text('Ver todos'),
        onTap: () => context.push(Rutas.incidente(ficha.id)),
      ),
    );
  }
}
