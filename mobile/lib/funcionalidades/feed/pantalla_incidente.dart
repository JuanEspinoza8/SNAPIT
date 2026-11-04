import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/estados.dart';
import '../mapa/modelos.dart';
import '../mapa/repositorio_mapa.dart';
import 'carrusel_fotos.dart';

/// El detalle de un incidente que se abre desde el feed: todas sus fotos,
/// sus datos y dónde está.
class PantallaIncidente extends ConsumerWidget {
  const PantallaIncidente(this.id, {super.key});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ficha = ref.watch(fichaProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(ficha.value?.categoriaNombre ?? 'Incidente')),
      body: SafeArea(
        child: switch (ficha) {
          AsyncData(:final value) => _Contenido(value),
          AsyncError(:final error) when !ficha.isLoading => Padding(
            padding: const EdgeInsets.all(Espacio.lg),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MensajeError(ErrorApi.desde(error).mensaje),
                const SizedBox(height: Espacio.lg),
                OutlinedButton(
                  onPressed: () => ref.invalidate(fichaProvider(id)),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
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

class _Contenido extends StatelessWidget {
  const _Contenido(this.ficha);

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );

    return ListView(
      children: [
        CarruselFotos(
          fotoIds: ficha.fotoIds,
          descripcion: ficha.categoriaNombre,
        ),
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(ficha.categoriaNombre, style: tema.textTheme.titleLarge),
              const SizedBox(height: Espacio.md),
              Wrap(
                spacing: Espacio.sm,
                runSpacing: Espacio.sm,
                children: [
                  EtiquetaEstado(ficha.estado),
                  if (ficha.gravedad case final gravedad?)
                    EtiquetaGravedad(gravedad),
                ],
              ),
              if (ficha.enRevision) ...[
                const SizedBox(height: Espacio.sm),
                Text(
                  'Todavía no se verificó: puede cambiar de categoría o '
                  'descartarse.',
                  style: secundario,
                ),
              ],
              const SizedBox(height: Espacio.lg),
              if (ficha.direccion case final direccion?)
                _Dato(Icons.place_outlined, 'Dirección', direccion),
              _Dato(
                Icons.event_outlined,
                'Primer reporte',
                fechaLarga(ficha.primerReporteEn),
              ),
              _Dato(
                Icons.group_outlined,
                'Vecinos que lo reportaron',
                '${ficha.cantidadVecinos}',
              ),
              const SizedBox(height: Espacio.sm),
              _MapaChico(ficha),
            ],
          ),
        ),
      ],
    );
  }
}

class _Dato extends StatelessWidget {
  const _Dato(this.icono, this.nombre, this.valor);

  final IconData icono;
  final String nombre;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 20, color: tema.colorScheme.onSurfaceVariant),
          const SizedBox(width: Espacio.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  nombre,
                  style: tema.textTheme.bodySmall?.copyWith(
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                ),
                Text(valor),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Dónde está, sin poder mover el mapa: es para ubicarse, no para navegar.
class _MapaChico extends StatelessWidget {
  const _MapaChico(this.ficha);

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final punto = LatLng(ficha.lat, ficha.lon);
    return Semantics(
      label: 'Mapa con la ubicación del incidente',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radioBorde),
        child: SizedBox(
          height: 180,
          child: FlutterMap(
            options: MapOptions(
              initialCenter: punto,
              initialZoom: 16,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.none,
              ),
            ),
            children: [
              const CapaOsm(),
              MarkerLayer(
                markers: [
                  Marker(
                    point: punto,
                    width: 32,
                    height: 32,
                    child: MarcaEstado(ficha.estado),
                  ),
                ],
              ),
              const AtribucionOsm(),
            ],
          ),
        ),
      ),
    );
  }
}
