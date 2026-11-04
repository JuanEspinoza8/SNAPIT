import 'package:flutter/material.dart';

import '../../compartido/formato/fechas.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/estados.dart';
import 'carrusel_fotos.dart';
import 'modelos.dart';
import 'widgets_social.dart';

/// Un incidente en el feed: la foto a todo el ancho y los datos abajo. Si
/// lo reportaron varios vecinos, es el «post destacado» que los agrupa.
class TarjetaIncidente extends StatelessWidget {
  const TarjetaIncidente(this.tarjeta, {super.key, required this.alAbrir});

  final TarjetaFeed tarjeta;
  final VoidCallback alAbrir;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );

    return Card(
      margin: const EdgeInsets.symmetric(
        horizontal: Espacio.md,
        vertical: Espacio.sm,
      ),
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radioBorde * 1.5),
        side: BorderSide(color: tema.colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CarruselFotos(
            fotoIds: tarjeta.fotoIds,
            cantidadTotal: tarjeta.cantidadFotos,
            descripcion: tarjeta.categoriaNombre,
          ),
          // Toda la parte de abajo abre el detalle. La foto no, para que
          // pasarlas con el dedo no lo abra sin querer.
          InkWell(
            onTap: alAbrir,
            child: Padding(
              padding: const EdgeInsets.all(Espacio.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (tarjeta.agrupado) ...[
                    _Agrupado(tarjeta.cantidadReportes),
                    const SizedBox(height: Espacio.sm),
                  ],
                  Text(
                    tarjeta.categoriaNombre,
                    style: tema.textTheme.titleMedium,
                  ),
                  if (tarjeta.direccion case final direccion?) ...[
                    const SizedBox(height: Espacio.xs),
                    Row(
                      children: [
                        Icon(
                          Icons.place_outlined,
                          size: 16,
                          color: tema.colorScheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: Espacio.xs),
                        Expanded(child: Text(direccion, style: secundario)),
                      ],
                    ),
                  ],
                  const SizedBox(height: Espacio.md),
                  Wrap(
                    spacing: Espacio.sm,
                    runSpacing: Espacio.sm,
                    children: [
                      EtiquetaEstado(tarjeta.estado),
                      EtiquetaGravedad(tarjeta.gravedad),
                    ],
                  ),
                  const SizedBox(height: Espacio.md),
                  Text(
                    tarjeta.cantidadVecinos == 1
                        ? 'Lo reportó 1 vecino'
                        : 'Lo reportaron ${tarjeta.cantidadVecinos} vecinos',
                    style: secundario,
                  ),
                  const SizedBox(height: Espacio.md),
                  Row(
                    children: [
                      ContadoresSociales(
                        meGusta: tarjeta.cantidadMeGusta,
                        comentarios: tarjeta.cantidadComentarios,
                      ),
                      const SizedBox(width: Espacio.md),
                      // Pasada una semana es la fecha larga: si no entra, baja.
                      Expanded(
                        child: Text(
                          haceCuanto(tarjeta.primerReporteEn),
                          style: secundario,
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Agrupado extends StatelessWidget {
  const _Agrupado(this.reportes);

  final int reportes;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Row(
      children: [
        Icon(Icons.layers_outlined, size: 16, color: tema.colorScheme.primary),
        const SizedBox(width: Espacio.xs),
        // En un celular angosto o con letra grande pasa a otra línea.
        Expanded(
          child: Text(
            'Agrupado · $reportes reportes del mismo problema',
            style: tema.textTheme.labelMedium?.copyWith(
              color: tema.colorScheme.primary,
            ),
          ),
        ),
      ],
    );
  }
}
